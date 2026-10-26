import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema";
export const backendRoot = fileURLToPath(new URL("../", import.meta.url));
export function openDatabase(filename = process.env.DATABASE_PATH ?? "db/board.sqlite") {
	const path = filename === ":memory:" ? filename : resolve(backendRoot, filename);
	if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
	const sqlite = new Database(path, { create: true });
	sqlite.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
	const db = drizzle(sqlite, { schema });
	try {
		migrate(db, { migrationsFolder: fileURLToPath(new URL("../db/migrations/", import.meta.url)) });
	} catch (error) {
		sqlite.close();
		throw error;
	}
	return { db, sqlite };
}
export type BoardDatabase = ReturnType<typeof openDatabase>;
