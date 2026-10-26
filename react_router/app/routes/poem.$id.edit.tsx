import { isLanguage, type Post } from "@shared/contracts";
import { data, Link, redirect, type ShouldRevalidateFunction } from "react-router";
import { PostForm } from "~/components/post-form";
import { apiRequest, getCurrentUser, requireResponse } from "~/lib/api.server";
import { savePost } from "~/lib/posts.server";
import { useApp } from "~/lib/use-app";
import type { Route } from "./+types/poem.$id.edit";
export async function loader({ request, params }: Route.LoaderArgs) {
	const { user, headers, unavailable } = await getCurrentUser(request);
	if (unavailable) return data({ post: null }, { status: 502, headers });
	if (!user)
		throw redirect(`/sign/in?returnTo=${encodeURIComponent(new URL(request.url).pathname)}`, { headers });
	const response = await apiRequest(request, `/posts/${encodeURIComponent(params.id)}`);
	if (response.status === 502) return data({ post: null }, { status: 502, headers });
	const post = await requireResponse<Post>(response);
	if (post.author.id !== user.id) throw data({ code: "FORBIDDEN" }, { status: 403 });
	return data({ post }, { headers });
}
export const action = ({ request, params }: Route.ActionArgs) => savePost(request, params.id);
export const shouldRevalidate: ShouldRevalidateFunction = ({ actionStatus, defaultShouldRevalidate }) =>
	actionStatus === 502 ? false : defaultShouldRevalidate;
export default function Edit({ loaderData, actionData }: Route.ComponentProps) {
	const { language, t } = useApp();
	if (!loaderData.post && !actionData)
		return (
			<section role="alert">
				<h1 className="text-2xl font-semibold">{t("errorTitle")}</h1>
				<p className="my-4">{t("API_UNAVAILABLE")}</p>
				<Link to="/poem" className="underline">
					{t("backToFeed")}
				</Link>
			</section>
		);
	const values = actionData?.values;
	const initial = loaderData.post ?? {
		title: values?.title ?? "",
		content: values?.content ?? "",
		language: isLanguage(values?.language) ? values.language : language,
	};
	return <PostForm key={loaderData.post?.id ?? "offline"} initial={initial} editing result={actionData} />;
}
