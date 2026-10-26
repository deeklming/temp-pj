import type { Language, PublicUser } from "@shared/contracts";
import { useRouteLoaderData } from "react-router";
import { translate } from "./i18n";

export function useApp() {
	const root = useRouteLoaderData<{
		language: Language;
		user: PublicUser | null;
		sessionUnavailable?: boolean;
	}>("root");
	const language = root?.language ?? "en-US";
	return {
		language,
		user: root?.user ?? null,
		sessionUnavailable: root?.sessionUnavailable ?? false,
		t: (key: string, values?: Record<string, string | number>) => translate(language, key, values),
	};
}
