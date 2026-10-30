import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { createConnection, createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RedisClient } from "bun";
import type { ChatEvent } from "../../shared/chat";
import { createApp } from "./app";
import { type Chat, createChat } from "./chat";
import { openDatabase } from "./db";

const origin = "http://localhost:3000";
const cleanups: Array<() => unknown> = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function fixture(chat?: Chat) {
	const directory = mkdtempSync(join(tmpdir(), "temppj-chat-"));
	cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
	const database = openDatabase(join(directory, "test.sqlite"));
	cleanups.push(() => database.sqlite.close(true));
	const app = createApp(database, { origin, chat }).listen({ hostname: "127.0.0.1", port: 0 });
	cleanups.push(() => app.stop(true));
	const url = `http://127.0.0.1:${app.server?.port}`;
	return { database, app, url };
}

async function signup(url: string) {
	const response = await fetch(`${url}/api/auth/signup`, {
		method: "POST",
		headers: { origin, "content-type": "application/json" },
		body: JSON.stringify({
			email: `${crypto.randomUUID()}@example.com`,
			nickname: "Chatter",
			password: "DemoPass123!",
		}),
	});
	expect(response.status).toBe(201);
	return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("chat upgrade requires an allowed origin, a session, and Valkey", async () => {
	const { url } = fixture();
	const cookie = await signup(url);
	for (const [requestOrigin, session, expected] of [
		["https://evil.example", cookie, 403],
		["", cookie, 403],
		["http://localhost:3002", cookie, 403],
		[origin, "", 401],
		[origin, cookie, 503],
		["http://127.0.0.1:3000", cookie, 503],
	] as const) {
		const response = await fetch(`${url}/api/chat`, {
			headers: { origin: requestOrigin, cookie: session, upgrade: "websocket" },
		});
		expect(response.status).toBe(expected);
	}
});

async function socket(url: string, cookie: string, requestOrigin = origin) {
	const ws = new WebSocket(`${url.replace("http:", "ws:")}/api/chat`, {
		headers: { cookie, origin: requestOrigin },
	});
	cleanups.push(() => ws.close());
	const events: ChatEvent[] = [];
	let notify: ((event: ChatEvent) => void) | undefined;
	ws.onmessage = (event) => {
		const value = JSON.parse(String(event.data)) as ChatEvent;
		if (notify) {
			const receive = notify;
			notify = undefined;
			receive(value);
		} else events.push(value);
	};
	await new Promise<void>((resolve, reject) => {
		ws.onopen = () => resolve();
		ws.onerror = () => reject(new Error("WebSocket failed"));
	});
	async function next(): Promise<ChatEvent> {
		const event = events.shift();
		if (event) return event;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				notify = undefined;
				reject(new Error("Chat event timed out"));
			}, 2000);
			notify = (value) => {
				clearTimeout(timer);
				resolve(value);
			};
		});
	}
	async function until(type: ChatEvent["type"]) {
		for (let count = 0; count < 10; count++) {
			const event = await next();
			if (event.type === type) return event;
		}
		throw new Error(`Missing chat event ${type}`);
	}
	expect(await next()).toEqual({ type: "ready" });
	return { ws, next, until, events };
}

test.skipIf(!process.env.VALKEY_URL)(
	"Valkey fans out across backends, validates messages and revokes live sessions",
	async () => {
		const channel = `temppj:test:chat:${crypto.randomUUID()}`;
		const firstChat = createChat(process.env.VALKEY_URL ?? "", channel);
		const secondChat = createChat(process.env.VALKEY_URL ?? "", channel);
		cleanups.push(
			() => firstChat.close(),
			() => secondChat.close(),
		);
		const { database, url } = fixture(firstChat);
		const secondApp = createApp(database, { origin, chat: secondChat }).listen({
			hostname: "127.0.0.1",
			port: 0,
		});
		cleanups.push(() => secondApp.stop(true));
		const cookie = await signup(url);
		const otherCookie = await signup(url);
		const sender = await socket(url, cookie);
		const receiver = await socket(
			`http://127.0.0.1:${secondApp.server?.port}`,
			otherCookie,
			"http://127.0.0.1:3000",
		);
		for (const input of [
			{ content: " " },
			{ content: "x".repeat(1001) },
			{ content: 1 },
			["hello"],
			"bad json",
		]) {
			sender.ws.send(JSON.stringify(input));
			expect(await sender.next()).toEqual({ type: "error", code: "CHAT_LENGTH" });
		}
		sender.ws.send(
			JSON.stringify({ content: "🙂".repeat(1000), author: { id: "forged", nickname: "Fake" } }).replaceAll(
				"🙂",
				"\\ud83d\\ude42",
			),
		);
		const received = await receiver.until("message");
		expect(received.type).toBe("message");
		if (received.type !== "message") throw new Error("Missing message");
		expect(received.message.content).toBe("🙂".repeat(1000));
		expect(received.message.author.nickname).toBe("Chatter");
		expect(received.message.author.id).not.toBe("forged");
		expect(received.message.id).toBeString();
		expect(Number.isFinite(Date.parse(received.message.createdAt))).toBe(true);
		const ownEvents = [await sender.next(), await sender.next()];
		expect(ownEvents).toContainEqual(received);
		expect(ownEvents).toContainEqual({ type: "sent" });
		const inspector = new RedisClient(process.env.VALKEY_URL);
		cleanups.push(() => inspector.close());
		// Invalid messages on the broker must never reach a browser.
		await inspector.publish(channel, JSON.stringify({ id: "bad", content: "incomplete" }));
		sender.ws.send(JSON.stringify({ content: "after invalid broker input" }));
		const afterInvalid = await receiver.until("message");
		expect(afterInvalid.type === "message" && afterInvalid.message.content).toBe(
			"after invalid broker input",
		);
		const receiverClosed = new Promise<CloseEvent>((resolve) => {
			receiver.ws.onclose = resolve;
		});
		await fetch(`${url}/api/auth/signout`, { method: "POST", headers: { origin, cookie: otherCookie } });
		sender.ws.send(JSON.stringify({ content: "private after logout" }));
		expect((await receiverClosed).code).toBe(1008);
		const senderClosed = new Promise<CloseEvent>((resolve) => {
			sender.ws.onclose = resolve;
		});
		database.sqlite.run("UPDATE sessions SET expires_at = 0");
		sender.ws.send(JSON.stringify({ content: "expired" }));
		expect((await senderClosed).code).toBe(1008);
	},
	15000,
);

test("unreachable Valkey rejects chat without affecting health", async () => {
	const chat = createChat("redis://127.0.0.1:1");
	cleanups.push(() => chat.close());
	const { url } = fixture(chat);
	const cookie = await signup(url);
	const response = await fetch(`${url}/api/chat`, { headers: { origin, cookie, upgrade: "websocket" } });
	expect(response.status).toBe(503);
	expect((await fetch(`${url}/api/health`)).status).toBe(200);
});

test.skipIf(!process.env.VALKEY_URL || process.env.VALKEY_URL.startsWith("rediss:"))(
	"broker connection loss closes live sockets and reconnect creates a fresh subscription",
	async () => {
		const target = new URL(process.env.VALKEY_URL ?? "");
		const upstreamAddress = { host: target.hostname, port: Number(target.port || 6379) };
		const connections = new Set<Socket>();
		const proxy = createServer((downstream) => {
			const upstream = createConnection(upstreamAddress);
			connections.add(downstream);
			connections.add(upstream);
			downstream.on("error", () => upstream.destroy());
			upstream.on("error", () => downstream.destroy());
			downstream.on("close", () => {
				connections.delete(downstream);
				upstream.destroy();
			});
			upstream.on("close", () => {
				connections.delete(upstream);
				downstream.destroy();
			});
			downstream.pipe(upstream).pipe(downstream);
		});
		cleanups.push(() => {
			for (const connection of connections) connection.destroy();
			proxy.close();
		});
		await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
		const address = proxy.address();
		if (!address || typeof address === "string") throw new Error("Missing proxy address");
		target.hostname = "127.0.0.1";
		target.port = String(address.port);
		const chat = createChat(target.toString(), `temppj:test:chat:${crypto.randomUUID()}`);
		cleanups.push(() => chat.close());
		const { url } = fixture(chat);
		const cookie = await signup(url);
		const connected = await socket(url, cookie);
		const closed = new Promise<CloseEvent>((resolve) => {
			connected.ws.onclose = resolve;
		});
		for (const connection of connections) connection.destroy();
		expect((await closed).code).toBe(1013);
		expect(chat.ready).toBe(false);
		const reconnected = await socket(url, cookie);
		reconnected.ws.send(JSON.stringify({ content: "back online" }));
		const event = await reconnected.until("message");
		expect(event.type === "message" && event.message.content).toBe("back online");
	},
	10000,
);
