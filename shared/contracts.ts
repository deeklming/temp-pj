export const LANGUAGES = ["ko-KR", "en-US", "ja-JP"] as const;
export type Language = (typeof LANGUAGES)[number];
export const SESSION_COOKIE = "temppj_session";
export const SESSION_SECONDS = 604800;
export interface PublicUser {
	id: string;
	nickname: string;
}
export interface PostSummary {
	id: string;
	title: string;
	language: Language;
	author: PublicUser;
	createdAt: string;
	updatedAt: string;
}
export interface Post extends PostSummary {
	content: string;
}
export interface PostList {
	items: PostSummary[];
	page: number;
	pageSize: number;
	total: number;
}
export interface ApiError {
	code: string;
	fieldErrors?: Record<string, string>;
}
export interface PostInput {
	title: string;
	content: string;
	language: Language;
}
export function isLanguage(value: unknown): value is Language {
	return LANGUAGES.some((language) => language === value);
}
export function codePointLength(value: string) {
	return Array.from(value).length;
}
export function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}
export function text(value: unknown): string {
	return typeof value === "string" ? value : "";
}
export function validatePost(value: unknown): Record<string, string> {
	const fields = record(value);
	const errors: Record<string, string> = {};
	const title = text(fields.title).trim();
	const content = text(fields.content);
	if (!title || codePointLength(title) > 100) errors.title = "TITLE_LENGTH";
	if (!content.trim() || codePointLength(content) > 10000) errors.content = "CONTENT_LENGTH";
	if (!isLanguage(fields.language)) errors.language = "LANGUAGE_INVALID";
	return errors;
}
export function validateAuth(value: unknown, signup: boolean): Record<string, string> {
	const fields = record(value);
	const errors: Record<string, string> = {};
	const email = text(fields.email).trim();
	if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "EMAIL_INVALID";
	const passwordLength = codePointLength(text(fields.password));
	if (passwordLength < 8 || passwordLength > 128) errors.password = "PASSWORD_LENGTH";
	if (signup) {
		const length = codePointLength(text(fields.nickname).trim());
		if (length < 2 || length > 30) errors.nickname = "NICKNAME_LENGTH";
	}
	return errors;
}
export function sessionCookie(headers: Headers): string {
	const value = headers
		.get("cookie")
		?.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith(`${SESSION_COOKIE}=`));
	return value && /^temppj_session=[a-f0-9]{64}$/.test(value) ? value : "";
}
export function safeReturnTo(value: unknown, fallback = "/poem"): string {
	if (
		typeof value !== "string" ||
		!value.startsWith("/") ||
		value.startsWith("//") ||
		/[\\\r\n]|%(?:2f|5c|0a|0d)/i.test(value)
	)
		return fallback;
	const url = new URL(value, "http://local.invalid");
	return url.origin === "http://local.invalid" ? `${url.pathname}${url.search}` : fallback;
}
