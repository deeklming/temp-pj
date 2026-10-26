import { expect, spyOn, test } from "bun:test";

test.each(["http://localhost:3000", "http://127.0.0.1:3000"])(
	"signup on %s reaches field validation instead of rejecting its own origin",
	async (origin) => {
		const { authAction } = await import("../app/lib/auth.server");
		const result = await authAction(
			new Request(`${origin}/sign/up`, {
				method: "POST",
				headers: { origin },
				body: new URLSearchParams({ email: "invalid", nickname: "Tester", password: "short" }),
			}),
			true,
		);
		if (result instanceof Response) throw new Error("Expected field errors, not a redirect");
		expect(result.init?.status).toBe(422);
		expect(result.data).toMatchObject({
			error: { code: "VALIDATION", fieldErrors: { email: "EMAIL_INVALID", password: "PASSWORD_LENGTH" } },
			values: { email: "invalid", nickname: "Tester" },
		});
	},
);

test.each([
	"https://evil.example",
	"http://localhost:3000",
	"http://127.0.0.1:3001",
	"https://127.0.0.1:3000",
	"null",
	"",
])("POST to 127.0.0.1 rejects a different or missing origin: %s", async (origin) => {
	const { assertOrigin } = await import("../app/lib/api.server");
	let failure: unknown;
	try {
		assertOrigin(
			new Request("http://127.0.0.1:3000/sign/up", {
				method: "POST",
				headers: origin ? { origin } : undefined,
			}),
		);
	} catch (error) {
		failure = error;
	}
	expect(failure).toMatchObject({ data: { code: "ORIGIN_FORBIDDEN" }, init: { status: 403 } });
});

test("an unavailable backend returns the submitted story with a 502 form error", async () => {
	const fetch = spyOn(globalThis, "fetch").mockRejectedValue(new Error("Simulated backend outage"));
	try {
		const { savePost } = await import("../app/lib/posts.server");
		const request = new Request("http://localhost:3000/poem/write", {
			method: "POST",
			headers: { origin: "http://localhost:3000", cookie: `temppj_session=${"a".repeat(64)}` },
			body: new URLSearchParams({ title: "Keep my title", content: "Keep my story", language: "ja-JP" }),
		});
		const result = await savePost(request);
		if (result instanceof Response) throw new Error("Expected a form error, not a redirect");
		expect(result.init?.status).toBe(502);
		expect(result.data).toEqual({
			error: { code: "API_UNAVAILABLE" },
			values: { title: "Keep my title", content: "Keep my story", language: "ja-JP" },
		});
	} finally {
		fetch.mockRestore();
	}
});
