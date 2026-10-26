import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApiError, Post, PostList } from "../../shared/contracts";
import { createApp } from "./app";
import { openDatabase } from "./db";
import { seedDatabase } from "./seed";

const origin = "http://localhost:3000";
let directory: string;
let database: ReturnType<typeof openDatabase>;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), "temppj-"));
	database = openDatabase(join(directory, "test.sqlite"));
	app = createApp(database, { origin });
});
afterEach(() => {
	database.sqlite.close(true);
	rmSync(directory, { recursive: true, force: true });
});

function request(path: string, method = "GET", body?: unknown, cookie = "", requestOrigin = origin) {
	return app.handle(
		new Request(`http://localhost:3001/api${path}`, {
			method,
			headers: { origin: requestOrigin, "content-type": "application/json", cookie },
			body: body === undefined ? undefined : JSON.stringify(body),
		}),
	);
}

async function signup(email = "member@example.com") {
	const response = await request("/auth/signup", "POST", {
		email,
		nickname: "Member",
		password: "DemoPass123!",
	});
	expect(response.status).toBe(201);
	return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

describe("authentication", () => {
	test("normalizes email, hashes credentials and keeps private fields out of public responses", async () => {
		const cookie = await signup(" MEMBER@EXAMPLE.COM ");
		expect(cookie).toMatch(/^temppj_session=[a-f0-9]{64}$/);
		const me = await request("/auth/me", "GET", undefined, cookie);
		expect(await me.json()).toEqual({ user: { id: expect.any(String), nickname: "Member" } });
		const stored = database.sqlite.query("SELECT email, password_hash FROM users").get() as {
			email: string;
			password_hash: string;
		};
		expect(stored.email).toBe("member@example.com");
		expect(stored.password_hash).toStartWith("$argon2id$");
		const duplicate = await request("/auth/signup", "POST", {
			email: "Member@example.com",
			nickname: "Another",
			password: "DemoPass123!",
		});
		expect(duplicate.status).toBe(409);
	});
	test("signin issues protected cookies, rejects bad passwords, and logout revokes the token", async () => {
		await signup();
		expect(
			(await request("/auth/signin", "POST", { email: "member@example.com", password: "incorrect" })).status,
		).toBe(401);
		const response = await request("/auth/signin", "POST", {
			email: "MEMBER@example.com",
			password: "DemoPass123!",
		});
		expect(response.status).toBe(200);
		const header = response.headers.get("set-cookie") ?? "";
		expect(header).toContain("HttpOnly");
		expect(header).toContain("SameSite=Lax");
		expect(header).toContain("Max-Age=604800");
		const cookie = header.split(";")[0];
		expect((await request("/auth/signout", "POST", {}, cookie)).status).toBe(204);
		expect((await request("/auth/me", "GET", undefined, cookie)).status).toBe(401);
	});
	test("rejects expired and forged sessions and unexpected origins", async () => {
		const cookie = await signup();
		database.sqlite.run("UPDATE sessions SET expires_at = 0");
		const expired = await request("/auth/me", "GET", undefined, cookie);
		expect(expired.status).toBe(401);
		expect(expired.headers.get("set-cookie")).toContain("Max-Age=0");
		expect((await request("/auth/me", "GET", undefined, "temppj_session=forged")).status).toBe(401);
		expect((await request("/auth/signup", "POST", {}, "", "https://evil.example")).status).toBe(403);
		expect((await request("/auth/signout", "POST", {}, cookie, "null")).status).toBe(403);
	});
	test("validates signup boundaries without exposing submitted passwords", async () => {
		const response = await request("/auth/signup", "POST", {
			email: "bad",
			nickname: "x",
			password: "short",
		});
		expect(response.status).toBe(422);
		const error = (await response.json()) as ApiError;
		expect(error.fieldErrors).toEqual({
			email: "EMAIL_INVALID",
			nickname: "NICKNAME_LENGTH",
			password: "PASSWORD_LENGTH",
		});
		expect(JSON.stringify(error)).not.toContain("short");
	});
});

describe("posts", () => {
	test("requires authentication and derives author from the session", async () => {
		expect(
			(await request("/posts", "POST", { title: "Title", content: "Body", language: "en-US" })).status,
		).toBe(401);
		const cookie = await signup();
		const response = await request(
			"/posts",
			"POST",
			{ title: " Title ", content: "First\nSecond", language: "en-US", authorId: "forged" },
			cookie,
		);
		expect(response.status).toBe(201);
		const post = (await response.json()) as Post;
		expect(post.title).toBe("Title");
		expect(post.content).toBe("First\nSecond");
		expect(post.author.id).not.toBe("forged");
		expect(post.author.nickname).toBe("Member");
		expect((await request(`/posts/${post.id}`)).status).toBe(200);
	});
	test("only the owner can edit or delete and deleted posts become missing", async () => {
		const owner = await signup();
		const other = await signup("other@example.com");
		const created = await request(
			"/posts",
			"POST",
			{ title: "Original", content: "Body", language: "ko-KR" },
			owner,
		);
		const { id } = (await created.json()) as Post;
		expect(
			(await request(`/posts/${id}`, "PATCH", { title: "Stolen", content: "Body", language: "en-US" }, other))
				.status,
		).toBe(403);
		expect((await request(`/posts/${id}`, "DELETE", undefined, other)).status).toBe(403);
		const edited = await request(
			`/posts/${id}`,
			"PATCH",
			{ title: "Edited", content: "Changed", language: "ja-JP" },
			owner,
		);
		expect(edited.status).toBe(200);
		expect(((await edited.json()) as Post).title).toBe("Edited");
		expect((await request(`/posts/${id}`, "DELETE", undefined, owner)).status).toBe(204);
		expect((await request(`/posts/${id}`)).status).toBe(404);
	});
	test("enforces Unicode code point limits, nonblank text and supported languages", async () => {
		const cookie = await signup();
		for (const fields of [
			{ title: " ", content: "Body", language: "en-US" },
			{ title: "x".repeat(101), content: "Body", language: "en-US" },
			{ title: "Title", content: "\n ", language: "en-US" },
			{ title: "Title", content: "x".repeat(10001), language: "en-US" },
			{ title: "Title", content: "Body", language: "fr-FR" },
		])
			expect((await request("/posts", "POST", fields, cookie)).status).toBe(422);
		expect(
			(
				await request(
					"/posts",
					"POST",
					{ title: "😀".repeat(100), content: "😀".repeat(10000), language: "en-US" },
					cookie,
				)
			).status,
		).toBe(201);
	});
	test("filters, paginates deterministically and omits content from list responses", async () => {
		const cookie = await signup();
		for (let i = 0; i < 14; i++)
			await request(
				"/posts",
				"POST",
				{ title: `Post ${i}`, content: "Body", language: i === 0 ? "ko-KR" : "en-US" },
				cookie,
			);
		const first = (await (await request("/posts")).json()) as PostList;
		const second = (await (await request("/posts?page=2")).json()) as PostList;
		expect(first.items).toHaveLength(12);
		expect(second.items).toHaveLength(2);
		expect(first.total).toBe(14);
		expect(first.items[0]).not.toHaveProperty("content");
		expect(new Set([...first.items, ...second.items].map((post: { id: string }) => post.id)).size).toBe(14);
		const filtered = (await (await request("/posts?language=ko-KR")).json()) as PostList;
		expect(filtered.total).toBe(1);
		for (const query of ["page=0", "page=-1", "page=1.5", "page=abc", "language=fr-FR"])
			expect((await request(`/posts?${query}`)).status).toBe(422);
	});
});

test("migrations persist data and repeated seed preserves user edits", async () => {
	await seedDatabase(database);
	expect(((await (await request("/posts")).json()) as PostList).total).toBe(206);
	database.sqlite.run("UPDATE posts SET title = 'Keep this edit' WHERE id = 'demo-post-1'");
	await seedDatabase(database);
	expect(((await (await request("/posts")).json()) as PostList).total).toBe(206);
	const lastPage = (await (await request("/posts?page=18")).json()) as PostList;
	expect(lastPage.items).toHaveLength(2);
	for (const language of ["ko-KR", "en-US", "ja-JP"]) {
		const page = (await (await request(`/posts?language=${language}&page=2`)).json()) as PostList;
		expect(page.items).toHaveLength(12);
		expect(page.items.every((post) => post.language === language)).toBe(true);
	}
	database.sqlite.close(true);
	database = openDatabase(join(directory, "test.sqlite"));
	app = createApp(database, { origin });
	expect(((await (await request("/posts/demo-post-1")).json()) as Post).title).toBe("Keep this edit");
	expect((await request("/health")).status).toBe(200);
});
