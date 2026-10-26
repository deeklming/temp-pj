import { reset } from "@logtape/logtape";
import { createApp } from "./app";
import { createPostCache } from "./cache";
import { openDatabase } from "./db";
import { configureLogging, logger } from "./logger";

await configureLogging();
const database = openDatabase();
const cache = process.env.VALKEY_URL ? createPostCache(process.env.VALKEY_URL) : undefined;
if (cache) await cache.connect();
else logger.warn("VALKEY_URL is not set; list caching is disabled");
const port = Number(process.env.API_PORT ?? 3001);

const app = createApp(database, { cache }).listen({ hostname: "127.0.0.1", port });
logger.info("Backend ready on port {port}", { port: app.server?.port });

let stopping = false;
async function stop() {
	if (stopping) return;
	stopping = true;
	await app.stop();
	cache?.close();
	database.sqlite.close();
	logger.info("Backend stopped");
	await reset();
	process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
