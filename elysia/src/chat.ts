import { RedisClient } from "bun";
import type { ChatMessage } from "../../shared/chat";
import { isChatMessage } from "../../shared/chat";
import { logger } from "./logger";

export function createChat(url: string, channel = "temppj:chat:public:v1") {
	let publisher: RedisClient | undefined;
	let subscriber: RedisClient | undefined;
	let connecting: Promise<boolean> | undefined;
	let ready = false;
	let closed = false;
	const listeners = new Set<(message: ChatMessage | null) => void>();
	function disconnect() {
		ready = false;
		const clients = [publisher, subscriber];
		publisher = subscriber = undefined;
		for (const client of clients) {
			if (!client) continue;
			// Avoid recursive shutdown callbacks; Bun 1.4.2 also throws when this callback is null.
			client.onclose = () => {};
			client.close();
		}
		for (const listener of listeners) listener(null);
		listeners.clear();
	}
	return {
		get ready() {
			return ready;
		},
		async connect(): Promise<boolean> {
			if (closed) return false;
			if (ready) return true;
			if (connecting) return connecting;
			connecting = (async () => {
				try {
					const options = { connectionTimeout: 500, autoReconnect: false, enableOfflineQueue: false };
					publisher = new RedisClient(url, options);
					subscriber = new RedisClient(url, options);
					const onclose = () => {
						logger.warn("Chat Valkey disconnected; chat unavailable");
						disconnect();
					};
					publisher.onclose = subscriber.onclose = onclose;
					await Promise.all([publisher.connect(), subscriber.connect()]);
					await subscriber.subscribe(channel, (payload) => {
						try {
							const message: unknown = JSON.parse(payload);
							if (!isChatMessage(message)) return;
							for (const listener of listeners) listener(message);
						} catch {
							logger.warn("Invalid chat pub/sub message ignored");
						}
					});
					if (closed || !publisher?.connected || !subscriber?.connected) {
						disconnect();
						return false;
					}
					ready = true;
					return true;
				} catch {
					logger.warn("Chat Valkey unavailable");
					disconnect();
					return false;
				}
			})();
			try {
				return await connecting;
			} finally {
				connecting = undefined;
			}
		},
		listen(listener: (message: ChatMessage | null) => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		async publish(message: ChatMessage) {
			if (!ready || !publisher) throw new Error("CHAT_UNAVAILABLE");
			try {
				await publisher.publish(channel, JSON.stringify(message));
			} catch {
				disconnect();
				throw new Error("CHAT_UNAVAILABLE");
			}
		},
		close() {
			closed = true;
			disconnect();
		},
	};
}

export type Chat = ReturnType<typeof createChat>;
