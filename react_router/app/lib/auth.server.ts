import { safeReturnTo, text, validateAuth } from "@shared/contracts";
import { data, redirect } from "react-router";
import { apiError, apiRequest, assertOrigin, getCurrentUser, responseHeaders } from "./api.server";

export async function authLoader(request: Request) {
	const { user, headers } = await getCurrentUser(request);
	const returnTo = safeReturnTo(new URL(request.url).searchParams.get("returnTo"));
	if (user) throw redirect(returnTo, { headers });
	return data({ returnTo }, { headers });
}
export async function authAction(request: Request, signup: boolean) {
	assertOrigin(request);
	const form = await request.formData();
	const fields = {
		email: text(form.get("email")),
		nickname: text(form.get("nickname")),
		password: text(form.get("password")),
	};
	const values = { email: fields.email, nickname: fields.nickname };
	const fieldErrors = validateAuth(fields, signup);
	if (Object.keys(fieldErrors).length)
		return data({ error: { code: "VALIDATION", fieldErrors }, values }, { status: 422 });
	const response = await apiRequest(request, signup ? "/auth/signup" : "/auth/signin", "POST", fields);
	const headers = responseHeaders(response);
	if (!response.ok)
		return data({ error: await apiError(response), values }, { status: response.status, headers });
	return redirect(safeReturnTo(form.get("returnTo")), { headers });
}
