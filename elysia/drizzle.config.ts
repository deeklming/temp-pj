import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

const root = fileURLToPath(new URL(".", import.meta.url));
const path = (value: string) => resolve(root, value).replaceAll("\\", "/");
export default defineConfig({
	schema: path("src/schema.ts"),
	out: path("db/migrations"),
	dialect: "sqlite",
	dbCredentials: { url: path(process.env.DATABASE_PATH ?? "db/board.sqlite") },
});
