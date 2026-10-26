import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../../elysia/src/app";
import { openDatabase } from "../../elysia/src/db";

test("production HTTP routes support three-locale CRUD, sessions and origin protection", async () => {
	const cleanups: Array<() => unknown> = [];
	const errors: unknown[] = [];
	try {
		const directory = mkdtempSync(join(tmpdir(), "temppj-http-"));
		cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
		const database = openDatabase(join(directory, "board.sqlite"));
		cleanups.push(() => database.sqlite.close(true));
		const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
		cleanups.push(() => reservation.stop(true));
		const port = reservation.port;
		const base = `http://127.0.0.1:${port}`;
		await reservation.stop(true);
		const apiOrigin = "http://localhost:3000";
		const api = createApp(database, { origin: apiOrigin }).listen({ hostname: "127.0.0.1", port: 0 });
		cleanups.push(() => api.stop());
		const server = Bun.spawn(
			[
				"node",
				fileURLToPath(new URL("../node_modules/@react-router/serve/bin.js", import.meta.url)),
				"build/server/index.js",
			],
			{
				cwd: fileURLToPath(new URL("../", import.meta.url)),
				env: {
					...process.env,
					NODE_ENV: "production",
					HOST: "127.0.0.1",
					PORT: String(port),
					APP_ORIGIN: apiOrigin,
					API_URL: `http://127.0.0.1:${api.server?.port}`,
				},
				stdout: "ignore",
				stderr: "inherit",
			},
		);
		cleanups.push(async () => {
			server.kill();
			await server.exited;
		});
		let cookie = "";
		const email = `smoke-${crypto.randomUUID()}@example.test`;
		const phrases = { "ko-KR": "작은 생각이", "en-US": "Small thoughts.", "ja-JP": "小さな思いが" };
		async function get(path: string, language = "en-US") {
			return fetch(`${base}${path}`, {
				redirect: "manual",
				headers: { cookie, "accept-language": language },
			});
		}
		async function submit(path: string, fields: Record<string, string>, language = "en-US") {
			const response = await fetch(`${base}${path}`, {
				method: "POST",
				redirect: "manual",
				headers: { origin: base, cookie, "accept-language": language },
				body: new URLSearchParams(fields),
			});
			const session = response.headers.getSetCookie().find((value) => value.startsWith("temppj_session="));
			if (session) cookie = session.split(";")[0] ?? "";
			return response;
		}
		const deadline = Date.now() + 15000;
		while (true) {
			try {
				assert.equal((await get("/")).status, 200);
				break;
			} catch (error) {
				if (server.exitCode !== null || Date.now() >= deadline) throw error;
				await Bun.sleep(50);
			}
		}
		for (const [language, phrase] of Object.entries({
			"en-US": "A home for your words.",
			"ko-KR": "당신의 이야기가 머무는 곳.",
			"ja-JP": "あなたの言葉が集まる場所。",
		})) {
			const landing = await (await get("/", language)).text();
			assert.ok(landing.includes(phrase));
			assert.ok(landing.includes('href="/poem"') && landing.includes('href="/sign/up"'));
		}
		assert.equal((await get("/missing-page")).status, 404);
		assert.equal((await get("/poem/write")).status, 302);
		const signup = await submit("/sign/up", {
			email,
			nickname: "Smoke Author",
			password: "SmokePass123!",
			returnTo: "//evil.example",
		});
		assert.equal(signup.status, 302);
		assert.equal(signup.headers.get("location"), "/poem");
		assert.match(cookie, /^temppj_session=[a-f0-9]{64}$/);
		assert.match(await (await get("/poem")).text(), /Smoke Author/);
		for (const [language, phrase] of Object.entries(phrases)) {
			let response = await get("/poem", language);
			let html = await response.text();
			assert.equal(response.status, 200);
			assert.ok(html.includes(`<html lang="${language}">`) && html.includes(phrase));
			const title = `Smoke ${language}`;
			response = await submit("/poem/write", { title, content: " ", language }, language);
			html = await response.text();
			assert.equal(response.status, 422);
			assert.ok(html.includes(`value="${title}"`), "Validation must preserve the title");
			response = await submit(
				"/poem/write",
				{ title, content: "First line\nSecond line <script>not executed</script>", language },
				language,
			);
			assert.equal(response.status, 302);
			const location = response.headers.get("location");
			assert.ok(location);
			assert.ok(location.startsWith("/poem?post="));
			const id = new URL(`${base}${location}`).searchParams.get("post");
			assert.ok(id);
			assert.equal((await get(location, language)).status, 200);
			const editPath = `/poem/${id}/edit`;
			assert.equal((await get(editPath, language)).status, 200);
			response = await submit(
				editPath,
				{ title: `${title} edited`, content: "Updated body", language },
				language,
			);
			assert.equal(response.status, 302);
			const drawerHtml = await (await get(location, language)).text();
			assert.ok(drawerHtml.includes(`${title} edited`) && drawerHtml.includes("Updated body"));
			response = await submit(location, { intent: "delete", id }, language);
			assert.equal(response.status, 302);
			assert.equal((await get(location, language)).status, 404);
		}
		const locale = await submit("/api/cookie/lang", { language: "ja-JP", returnTo: "/poem?language=ko-KR" });
		assert.equal(locale.headers.get("location"), "/poem?language=ko-KR");
		assert.ok(locale.headers.getSetCookie().some((value) => value.startsWith("temppj_language=ja-JP;")));
		const signout = await submit("/sign/out", {});
		assert.equal(signout.status, 302);
		assert.match(signout.headers.get("set-cookie") ?? "", /Max-Age=0/);
		assert.equal((await get("/poem/write")).status, 302);
		const signin = await submit("/sign/in", { email, password: "SmokePass123!" });
		assert.equal(signin.status, 302);
		assert.match(await (await get("/poem")).text(), /Smoke Author/);
		const badOrigin = await fetch(`${base}/sign/in`, {
			method: "POST",
			headers: { origin: "https://evil.example" },
			body: new URLSearchParams({ email, password: "SmokePass123!" }),
		});
		assert.equal(badOrigin.status, 400);
	} finally {
		for (const cleanup of cleanups.reverse()) {
			try {
				await cleanup();
			} catch (error) {
				errors.push(error);
			}
		}
	}
	if (errors.length) throw new AggregateError(errors, "HTTP test cleanup failed");
}, 30000);
