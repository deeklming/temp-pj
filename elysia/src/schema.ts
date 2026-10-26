import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Language } from "../../shared/contracts";
export const users = sqliteTable("users", {
	id: text("id").primaryKey(),
	email: text("email").notNull().unique(),
	nickname: text("nickname").notNull(),
	passwordHash: text("password_hash").notNull(),
	createdAt: text("created_at").notNull(),
});
export const sessions = sqliteTable(
	"sessions",
	{
		tokenHash: text("token_hash").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		expiresAt: integer("expires_at").notNull(),
	},
	(table) => [index("sessions_user_idx").on(table.userId)],
);
export const posts = sqliteTable(
	"posts",
	{
		id: text("id").primaryKey(),
		authorId: text("author_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		content: text("content").notNull(),
		language: text("language").$type<Language>().notNull(),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
	},
	(table) => [
		index("posts_created_idx").on(table.createdAt, table.id),
		index("posts_language_idx").on(table.language, table.createdAt, table.id),
		check("posts_language_check", sql`${table.language} IN ('ko-KR', 'en-US', 'ja-JP')`),
	],
);
