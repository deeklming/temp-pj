import type { PublicUser } from "./contracts";
import { codePointLength, record } from "./contracts";

export interface ChatMessage {
	id: string;
	content: string;
	author: PublicUser;
	createdAt: string;
}

export type ChatEvent =
	| { type: "ready" }
	| { type: "message"; message: ChatMessage }
	| { type: "sent" }
	| { type: "error"; code: string };

export function chatContent(input: unknown): string | null {
	const content = record(input).content;
	return typeof content === "string" && content.trim() && codePointLength(content) <= 1000 ? content : null;
}

export function isChatMessage(input: unknown): input is ChatMessage {
	const message = record(input);
	const author = record(message.author);
	return (
		chatContent(message) !== null &&
		typeof message.id === "string" &&
		message.id.length > 0 &&
		message.id.length <= 128 &&
		typeof author.id === "string" &&
		author.id.length > 0 &&
		author.id.length <= 128 &&
		typeof author.nickname === "string" &&
		codePointLength(author.nickname) >= 2 &&
		codePointLength(author.nickname) <= 30 &&
		typeof message.createdAt === "string" &&
		Number.isFinite(Date.parse(message.createdAt))
	);
}
