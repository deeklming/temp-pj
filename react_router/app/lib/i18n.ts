import type { Language } from "@shared/contracts";
import { parse } from "smol-toml";
import english from "~/asset/language/en-US.toml?raw";
import japanese from "~/asset/language/ja-JP.toml?raw";
import korean from "~/asset/language/ko-KR.toml?raw";

const dictionaries = {
	"en-US": parse(english),
	"ko-KR": parse(korean),
	"ja-JP": parse(japanese),
} as Record<Language, Record<string, string>>;
export const LANGUAGE_NAMES: Record<Language, string> = {
	"ko-KR": "한국어",
	"en-US": "English",
	"ja-JP": "日本語",
};
export function translate(language: Language, key: string, values: Record<string, string | number> = {}) {
	const template =
		dictionaries[language][key] ?? dictionaries["en-US"][key] ?? dictionaries["en-US"].INTERNAL_ERROR;
	return template.replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));
}
export function formatDate(value: string, language: Language) {
	return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}
