import { test } from "bun:test";
import assert from "node:assert/strict";
import { createRequestHandler, type ServerBuild } from "react-router";

test("production SSR preserves writing and editing drafts during an API outage", async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = Object.assign(
		async () => {
			throw new Error("Simulated backend outage");
		},
		{ preconnect: originalFetch.preconnect },
	);
	try {
		const build = (await import(new URL("../build/server/index.js", import.meta.url).href)) as ServerBuild;
		const handler = createRequestHandler(build, "production");
		for (const path of ["/poem/write", "/poem/example-id/edit"]) {
			const response = await handler(
				new Request(`http://localhost:3000${path}`, {
					method: "POST",
					headers: {
						origin: "http://localhost:3000",
						cookie: `temppj_session=${"a".repeat(64)}`,
						"accept-language": "ja-JP",
					},
					body: new URLSearchParams({ title: "Unsaved title", content: "Unsaved story", language: "ja-JP" }),
				}),
			);
			const html = await response.text();
			assert.equal(response.status, 502);
			assert.ok(
				html.includes('value="Unsaved title"') && html.includes("Unsaved story"),
				`${path} must preserve the draft`,
			);
			assert.ok(html.includes('<html lang="ja-JP">'));
		}
	} finally {
		globalThis.fetch = originalFetch;
	}
});
