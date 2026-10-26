import { expect, test } from "bun:test";
import { safeReturnTo } from "./contracts";
import { detectLanguage } from "./language";

test("explicit language wins, browser quality is respected and unsupported locales fall back", () => {
	expect(detectLanguage("ja-JP", "ko-KR,en-US;q=0.5")).toBe("ja-JP");
	expect(detectLanguage("unsupported", "fr-FR,ja;q=0.9,ko;q=0.8")).toBe("ja-JP");
	expect(detectLanguage("", "en;q=0.2,ko-KR;q=0.9")).toBe("ko-KR");
	expect(detectLanguage("", "ja;q=0,en-US;q=0.5")).toBe("en-US");
	expect(detectLanguage("", "fr-FR")).toBe("en-US");
});
test("return paths cannot redirect authentication to another origin", () => {
	for (const value of [
		"//evil.example",
		"https://evil.example",
		"/\\evil.example",
		"/\n/evil",
		"/%2f%2fevil.example",
	]) {
		expect(safeReturnTo(value)).toBe("/poem");
	}
	expect(safeReturnTo("/poem/write?language=ja-JP")).toBe("/poem/write?language=ja-JP");
});
