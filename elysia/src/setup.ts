import { reset } from "@logtape/logtape";
import { openDatabase } from "./db";
import { configureLogging, logger } from "./logger";
import { seedDatabase } from "./seed";

await configureLogging();
const database = openDatabase();
try {
	await seedDatabase(database);
	logger.info("Database migrated and 206 demo posts ready (existing records preserved)");
} finally {
	database.sqlite.close();
	await reset();
}
