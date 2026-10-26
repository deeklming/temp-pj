import { isLanguage, type Language } from "./contracts";

export function detectLanguage(cookie: string, acceptLanguage = ""): Language {
	if (isLanguage(cookie)) return cookie;
	const candidates = acceptLanguage
		.split(",")
		.map((entry, order) => {
			const [tag = "", ...parameters] = entry.trim().split(";");
			const quality = parameters.find((part) => part.trim().startsWith("q="));
			return { tag: tag.toLowerCase(), quality: quality ? Number(quality.trim().slice(2)) : 1, order };
		})
		.filter((entry) => entry.quality > 0 && entry.quality <= 1)
		.sort((a, b) => b.quality - a.quality || a.order - b.order);
	for (const { tag } of candidates) {
		if (tag === "ko" || tag.startsWith("ko-")) return "ko-KR";
		if (tag === "ja" || tag.startsWith("ja-")) return "ja-JP";
		if (tag === "en" || tag.startsWith("en-")) return "en-US";
	}
	return "en-US";
}
