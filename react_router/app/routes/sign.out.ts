import { redirect } from "react-router";
import { apiRequest, assertOrigin, requireResponse, responseHeaders } from "~/lib/api.server";
import type { Route } from "./+types/sign.out";
export async function action({ request }: Route.ActionArgs) {
	assertOrigin(request);
	const response = await apiRequest(request, "/auth/signout", "POST", {});
	if (!response.ok) await requireResponse(response);
	return redirect("/poem", { headers: responseHeaders(response) });
}
