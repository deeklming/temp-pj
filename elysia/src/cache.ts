import { RedisClient } from "bun";
import { logger } from "./logger";

export function createPostCache(url: string) {
	const client = new RedisClient(url, {
		connectionTimeout: 500,
		enableOfflineQueue: false,
		maxRetries: 3,
	});
	// One backend process serves this local demo. Every entry expires, including retired generations.
	const namespace = `temppj:posts:${crypto.randomUUID()}`;
	let generation = 0;
	return {
		async connect() {
			try {
				await client.connect();
				logger.info("Valkey connected");
			} catch {
				logger.warn("Valkey unavailable; reading lists from SQLite");
			}
		},
		key(page: number, language: string, databaseVersion: number) {
			return `${namespace}:${generation}:${databaseVersion}:${language}:${page}`;
		},
		async get(key: string) {
			try {
				return await client.get(key);
			} catch {
				logger.warn("Valkey read failed; reading list from SQLite");
				return undefined;
			}
		},
		async set(key: string, value: string) {
			try {
				await client.set(key, value, "EX", 120);
			} catch {
				logger.warn("Valkey write failed; list served from SQLite");
			}
		},
		invalidate() {
			generation++;
		},
		close() {
			client.close();
		},
	};
}
export type PostCache = ReturnType<typeof createPostCache>;
