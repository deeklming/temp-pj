import { createHash, randomBytes } from "node:crypto";
import { and, count, desc, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import type { ApiError, Language, Post, PublicUser } from "../../shared/contracts";
import {
	isLanguage,
	record,
	SESSION_COOKIE,
	SESSION_SECONDS,
	sessionCookie,
	text,
	validateAuth,
	validatePost,
} from "../../shared/contracts";
import type { PostCache } from "./cache";
import type { BoardDatabase } from "./db";
import { logger } from "./logger";
import { posts, sessions, users } from "./schema";

class ApiFault extends Error {
	constructor(
		public status: number,
		public payload: ApiError,
	) {
		super(payload.code);
	}
}
function fail(status: number, code: string, fieldErrors?: Record<string, string>): never {
	throw new ApiFault(status, { code, ...(fieldErrors ? { fieldErrors } : {}) });
}
function check(errors: Record<string, string>) {
	if (Object.keys(errors).length) fail(422, "VALIDATION", errors);
}
function hash(token: string) {
	return createHash("sha256").update(token).digest("hex");
}

export function createApp(
	{ db, sqlite }: BoardDatabase,
	options: { origin?: string; cache?: PostCache } = {},
) {
	const cache = options.cache;
	const startedAt = new WeakMap<Request, number>();
	const origin = options.origin ?? process.env.APP_ORIGIN ?? "http://localhost:3000";
	const secure = new URL(origin).protocol === "https:";
	const serialize = (token: string, age = SESSION_SECONDS) =>
		`${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? "; Secure" : ""}`;
	function currentUser(request: Request): PublicUser | null {
		const token = sessionCookie(request.headers).split("=")[1];
		if (!token) return null;
		const session = db
			.select({ id: users.id, nickname: users.nickname, expiresAt: sessions.expiresAt })
			.from(sessions)
			.innerJoin(users, eq(sessions.userId, users.id))
			.where(eq(sessions.tokenHash, hash(token)))
			.get();
		if (!session) return null;
		if (session.expiresAt <= Date.now()) {
			db.delete(sessions)
				.where(eq(sessions.tokenHash, hash(token)))
				.run();
			return null;
		}
		return { id: session.id, nickname: session.nickname };
	}
	function requireUser(request: Request) {
		const user = currentUser(request);
		if (!user) fail(401, "UNAUTHENTICATED");
		return user;
	}
	function createSession(userId: string) {
		const token = randomBytes(32).toString("hex");
		db.insert(sessions)
			.values({ tokenHash: hash(token), userId, expiresAt: Date.now() + SESSION_SECONDS * 1000 })
			.run();
		return serialize(token);
	}
	function getPost(id: string): Post {
		const row = db
			.select({
				id: posts.id,
				title: posts.title,
				content: posts.content,
				language: posts.language,
				createdAt: posts.createdAt,
				updatedAt: posts.updatedAt,
				author: { id: users.id, nickname: users.nickname },
			})
			.from(posts)
			.innerJoin(users, eq(posts.authorId, users.id))
			.where(eq(posts.id, id))
			.get();
		if (!row) fail(404, "POST_NOT_FOUND");
		return row;
	}
	function postValues(body: unknown) {
		check(validatePost(body));
		const fields = record(body);
		return {
			title: text(fields.title).trim(),
			content: text(fields.content),
			language: fields.language as Language,
		};
	}
	return new Elysia()
		.onRequest(({ request }) => {
			startedAt.set(request, performance.now());
		})
		.onAfterResponse(({ request, response, set }) => {
			logger.info("{method} {path} {status} ({duration}ms)", {
				method: request.method,
				path: new URL(request.url).pathname,
				status: response instanceof Response ? response.status : (set.status ?? 200),
				duration: Math.round(performance.now() - (startedAt.get(request) ?? performance.now())),
			});
		})
		.onError(({ error, code, set }) => {
			if (error instanceof ApiFault) {
				set.status = error.status;
				if (error.status === 401) set.headers["set-cookie"] = serialize("", 0);
				return error.payload;
			}
			if (code === "NOT_FOUND") {
				set.status = 404;
				return { code: "NOT_FOUND" };
			}
			if (code === "PARSE" || code === "VALIDATION") {
				set.status = 422;
				return { code: "VALIDATION" };
			}
			logger.error("API request failed: {code}", { code });
			set.status = 500;
			return { code: "INTERNAL_ERROR" };
		})
		.onBeforeHandle(({ request, set }) => {
			set.headers["cache-control"] = "no-store";
			if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && request.headers.get("origin") !== origin)
				fail(403, "ORIGIN_FORBIDDEN");
		})
		.get("/api/health", () => {
			sqlite.query("SELECT 1").get();
			return { status: "ok" };
		})
		.post("/api/auth/signup", async ({ body, set }) => {
			check(validateAuth(body, true));
			const fields = record(body);
			const email = text(fields.email).trim().toLowerCase();
			if (db.select({ id: users.id }).from(users).where(eq(users.email, email)).get())
				fail(409, "EMAIL_EXISTS", { email: "EMAIL_EXISTS" });
			const passwordHash = await Bun.password.hash(text(fields.password), { algorithm: "argon2id" });
			const user = { id: crypto.randomUUID(), nickname: text(fields.nickname).trim() };
			try {
				db.transaction((tx) => {
					tx.insert(users)
						.values({ ...user, email, passwordHash, createdAt: new Date().toISOString() })
						.run();
					set.headers["set-cookie"] = createSession(user.id);
				});
			} catch (error) {
				if (db.select({ id: users.id }).from(users).where(eq(users.email, email)).get())
					fail(409, "EMAIL_EXISTS", { email: "EMAIL_EXISTS" });
				throw error;
			}
			set.status = 201;
			return { user };
		})
		.post("/api/auth/signin", async ({ body, set }) => {
			check(validateAuth(body, false));
			const fields = record(body);
			const user = db
				.select()
				.from(users)
				.where(eq(users.email, text(fields.email).trim().toLowerCase()))
				.get();
			if (!user || !(await Bun.password.verify(text(fields.password), user.passwordHash)))
				fail(401, "INVALID_CREDENTIALS");
			set.headers["set-cookie"] = createSession(user.id);
			return { user: { id: user.id, nickname: user.nickname } };
		})
		.post("/api/auth/signout", ({ request, set }) => {
			const token = sessionCookie(request.headers).split("=")[1];
			if (token)
				db.delete(sessions)
					.where(eq(sessions.tokenHash, hash(token)))
					.run();
			set.headers["set-cookie"] = serialize("", 0);
			return new Response(null, { status: 204 });
		})
		.get("/api/auth/me", ({ request }) => ({ user: requireUser(request) }))
		.get("/api/posts", async ({ query, set }) => {
			if (query.language && !isLanguage(query.language))
				fail(422, "VALIDATION", { language: "LANGUAGE_INVALID" });
			const pageText = query.page ?? "1";
			const page = Number(pageText);
			if (
				!/^[1-9]\d*$/.test(pageText) ||
				!Number.isSafeInteger(page) ||
				page > Math.floor(Number.MAX_SAFE_INTEGER / 12)
			)
				fail(422, "VALIDATION", { page: "PAGE_INVALID" });
			const version =
				sqlite.query<{ data_version: number }, []>("PRAGMA data_version").get()?.data_version ?? 0;
			const cacheKey = cache?.key(page, query.language || "all", version);
			const cached = cache && cacheKey ? await cache.get(cacheKey) : undefined;
			set.headers["x-cache"] = cached === undefined ? "BYPASS" : "MISS";
			if (cached) {
				try {
					const result = JSON.parse(cached);
					set.headers["x-cache"] = "HIT";
					return result;
				} catch {
					logger.warn("Invalid cached list; reading from SQLite");
				}
			}
			const filter = query.language ? eq(posts.language, query.language as Language) : undefined;
			const items = db
				.select({
					id: posts.id,
					title: posts.title,
					language: posts.language,
					createdAt: posts.createdAt,
					updatedAt: posts.updatedAt,
					author: { id: users.id, nickname: users.nickname },
				})
				.from(posts)
				.innerJoin(users, eq(posts.authorId, users.id))
				.where(filter)
				.orderBy(desc(posts.createdAt), desc(posts.id))
				.limit(12)
				.offset((page - 1) * 12)
				.all();
			const total = db.select({ value: count() }).from(posts).where(filter).get()?.value ?? 0;
			const result = { items, page, pageSize: 12, total };
			if (cache && cacheKey && cached !== undefined) await cache.set(cacheKey, JSON.stringify(result));
			return result;
		})
		.get("/api/posts/:id", ({ params }) => getPost(params.id))
		.post("/api/posts", ({ request, body, set }) => {
			const user = requireUser(request);
			const fields = postValues(body);
			const id = crypto.randomUUID();
			const now = new Date().toISOString();
			db.insert(posts)
				.values({ ...fields, id, authorId: user.id, createdAt: now, updatedAt: now })
				.run();
			set.status = 201;
			cache?.invalidate();
			return getPost(id);
		})
		.patch("/api/posts/:id", ({ params, request, body }) => {
			const user = requireUser(request);
			if (getPost(params.id).author.id !== user.id) fail(403, "FORBIDDEN");
			const fields = postValues(body);
			db.update(posts)
				.set({ ...fields, updatedAt: new Date().toISOString() })
				.where(and(eq(posts.id, params.id), eq(posts.authorId, user.id)))
				.run();
			cache?.invalidate();
			return getPost(params.id);
		})
		.delete("/api/posts/:id", ({ params, request }) => {
			const user = requireUser(request);
			if (getPost(params.id).author.id !== user.id) fail(403, "FORBIDDEN");
			db.delete(posts)
				.where(and(eq(posts.id, params.id), eq(posts.authorId, user.id)))
				.run();
			cache?.invalidate();
			return new Response(null, { status: 204 });
		});
}
