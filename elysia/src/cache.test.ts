import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RedisClient } from "bun";
import type { Post, PostList } from "../../shared/contracts";
import { createApp } from "./app";
import { createPostCache } from "./cache";
import { openDatabase } from "./db";
import { seedDatabase } from "./seed";

test.skipIf(!process.env.VALKEY_URL)(
	"Valkey caches pages for 120s, expires and refreshes after writes",
	async () => {
		const directory = mkdtempSync(join(tmpdir(), "temppj-cache-"));
		const cleanups: Array<() => unknown> = [() => rmSync(directory, { recursive: true, force: true })];
		const errors: unknown[] = [];
		try {
			const database = openDatabase(join(directory, "board.sqlite"));
			cleanups.push(() => database.sqlite.close(true));
			const cache = createPostCache(process.env.VALKEY_URL ?? "");
			cleanups.push(() => cache.close());
			const inspector = new RedisClient(process.env.VALKEY_URL);
			cleanups.push(() => inspector.close());
			const keys = new Set<string>();
			cleanups.push(async () => {
				if (keys.size) await inspector.del(...keys);
			});
			await cache.connect();
			await seedDatabase(database);
			const app = createApp(database, { cache });
			let cookie = "";
			const request = (path: string, method = "GET", body?: unknown) =>
				app.handle(
					new Request(`http://localhost/api${path}`, {
						method,
						headers: { origin: "http://localhost:3000", "content-type": "application/json", cookie },
						body: body === undefined ? undefined : JSON.stringify(body),
					}),
				);
			const key = (page = 1, language = "all") => {
				const version =
					database.sqlite.query<{ data_version: number }, []>("PRAGMA data_version").get()?.data_version ?? 0;
				const value = cache.key(page, language, version);
				keys.add(value);
				return value;
			};
			let response = await request("/posts");
			expect(response.headers.get("x-cache")).toBe("MISS");
			const first = (await response.json()) as PostList;
			expect(first.total).toBe(206);
			expect(first.items).toHaveLength(12);
			const firstKey = key();
			expect(await inspector.ttl(firstKey)).toBeGreaterThanOrEqual(119);
			expect(await inspector.ttl(firstKey)).toBeLessThanOrEqual(120);
			response = await request("/posts");
			expect(response.headers.get("x-cache")).toBe("HIT");
			expect(await response.json()).toEqual(first);
			response = await request("/posts?page=2");
			expect(response.headers.get("x-cache")).toBe("MISS");
			key(2);
			const second = (await response.json()) as PostList;
			expect(second.items).toHaveLength(12);
			expect(second.items.some((post) => first.items.some((item) => item.id === post.id))).toBe(false);
			response = await request("/posts?language=ja-JP&page=2");
			key(2, "ja-JP");
			expect(((await response.json()) as PostList).items.every((post) => post.language === "ja-JP")).toBe(
				true,
			);
			expect((await request("/posts?language=ja-JP&page=2")).headers.get("x-cache")).toBe("HIT");
			expect((await request("/posts?page=0")).status).toBe(422);

			// Shorten only this test's entry to prove Redis expiry and re-population without a two-minute sleep.
			await inspector.expire(firstKey, 1);
			await Bun.sleep(1100);
			expect(await inspector.get(firstKey)).toBeNull();
			expect((await request("/posts")).headers.get("x-cache")).toBe("MISS");
			expect(await inspector.ttl(firstKey)).toBeGreaterThanOrEqual(119);
			await inspector.set(firstKey, "not-json", "EX", 120);
			expect((await request("/posts")).headers.get("x-cache")).toBe("MISS");

			const signin = await request("/auth/signin", "POST", {
				email: "demo1@example.com",
				password: "DemoPass123!",
			});
			cookie = signin.headers.get("set-cookie")?.split(";")[0] ?? "";
			expect(signin.status).toBe(200);
			response = await request("/posts", "POST", {
				title: "Fresh story",
				content: "Body",
				language: "en-US",
			});
			expect(response.status).toBe(201);
			const created = (await response.json()) as Post;
			expect((await request("/posts")).headers.get("x-cache")).toBe("MISS");
			key();
			expect(((await (await request("/posts")).json()) as PostList).total).toBe(207);
			expect(
				(
					await request(`/posts/${created.id}`, "PATCH", {
						title: "Updated",
						content: "Body",
						language: "ko-KR",
					})
				).status,
			).toBe(200);
			expect((await request("/posts")).headers.get("x-cache")).toBe("MISS");
			key();
			response = await request("/posts?language=ko-KR");
			key(1, "ko-KR");
			expect(((await response.json()) as PostList).items[0]?.title).toBe("Updated");
			expect((await request(`/posts/${created.id}`, "DELETE")).status).toBe(204);
			expect((await request("/posts")).headers.get("x-cache")).toBe("MISS");
			key();
			expect(((await (await request("/posts")).json()) as PostList).total).toBe(206);

			// External setup/seed uses another SQLite connection; it must also retire cached lists.
			const external = openDatabase(join(directory, "board.sqlite"));
			try {
				external.sqlite.run("UPDATE posts SET title = 'External update' WHERE id = ?", [
					first.items[0]?.id ?? "",
				]);
			} finally {
				external.sqlite.close(true);
			}
			response = await request("/posts");
			key();
			expect(response.headers.get("x-cache")).toBe("MISS");
			expect(((await response.json()) as PostList).items[0]?.title).toBe("External update");

			cache.close();
			response = await request("/posts");
			expect(response.headers.get("x-cache")).toBe("BYPASS");
			expect(((await response.json()) as PostList).total).toBe(206);
		} finally {
			for (const cleanup of cleanups.reverse()) {
				try {
					await cleanup();
				} catch (error) {
					errors.push(error);
				}
			}
		}
		if (errors.length) throw new AggregateError(errors, "Cache test cleanup failed");
	},
	15000,
);
