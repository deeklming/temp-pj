import { isLanguage, safeReturnTo } from "@shared/contracts";
import { data, redirect } from "react-router";
import { APP_ORIGIN, assertOrigin } from "~/lib/api.server";
import type { Route } from "./+types/api.cookie.lang";
export async function action({ request }: Route.ActionArgs) {
	assertOrigin(request);
	const form = await request.formData();
	const language = form.get("language");
	if (!isLanguage(language)) throw data({ code: "LANGUAGE_INVALID" }, { status: 422 });
	return redirect(safeReturnTo(form.get("returnTo")), {
		headers: {
			"set-cookie": `temppj_language=${language}; Path=/; SameSite=Lax; Max-Age=31536000${APP_ORIGIN.startsWith("https:") ? "; Secure" : ""}`,
		},
	});
}
