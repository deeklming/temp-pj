import { type Post, text, validatePost } from "@shared/contracts";
import { data, redirect } from "react-router";
import { apiError, apiRequest, assertOrigin, requireResponse, responseHeaders } from "./api.server";

export async function savePost(request: Request, id?: string) {
	assertOrigin(request);
	const form = await request.formData();
	const values = {
		title: text(form.get("title")),
		content: text(form.get("content")),
		language: text(form.get("language")),
	};
	const fieldErrors = validatePost(values);
	if (Object.keys(fieldErrors).length)
		return data({ error: { code: "VALIDATION", fieldErrors }, values }, { status: 422 });
	const response = await apiRequest(
		request,
		id ? `/posts/${encodeURIComponent(id)}` : "/posts",
		id ? "PATCH" : "POST",
		values,
	);
	const headers = responseHeaders(response);
	if (!response.ok)
		return data({ error: await apiError(response), values }, { status: response.status, headers });
	const post = await requireResponse<Post>(response);
	return redirect(`/poem?post=${encodeURIComponent(post.id)}`, { headers });
}
