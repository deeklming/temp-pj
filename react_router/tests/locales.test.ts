import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parse } from "smol-toml";

test("all UI and error translation keys exist and contain text in three locales", () => {
	const load = (locale: string) =>
		parse(readFileSync(new URL(`../app/asset/language/${locale}.toml`, import.meta.url), "utf8"));
	const english = load("en-US");
	for (const locale of ["ko-KR", "ja-JP"]) {
		const dictionary = load(locale);
		expect(Object.keys(dictionary).sort()).toEqual(Object.keys(english).sort());
		for (const value of Object.values(dictionary))
			expect(typeof value === "string" && value.trim().length > 0).toBe(true);
	}
	for (const key of [
		"API_UNAVAILABLE",
		"TITLE_LENGTH",
		"CONTENT_LENGTH",
		"EMAIL_EXISTS",
		"INVALID_CREDENTIALS",
		"POST_NOT_FOUND",
		"ORIGIN_FORBIDDEN",
	])
		expect(english).toHaveProperty(key);
});
