import { data, redirect, type ShouldRevalidateFunction } from "react-router";
import { PostForm } from "~/components/post-form";
import { getCurrentUser } from "~/lib/api.server";
import { savePost } from "~/lib/posts.server";
import { useApp } from "~/lib/use-app";
import type { Route } from "./+types/poem.write";
export async function loader({ request }: Route.LoaderArgs) {
	const { user, headers, unavailable } = await getCurrentUser(request);
	if (!unavailable && !user) throw redirect("/sign/in?returnTo=%2Fpoem%2Fwrite", { headers });
	return data({}, { status: unavailable ? 502 : 200, headers });
}
export const action = ({ request }: Route.ActionArgs) => savePost(request);
export const shouldRevalidate: ShouldRevalidateFunction = ({ actionStatus, defaultShouldRevalidate }) =>
	actionStatus === 502 ? false : defaultShouldRevalidate;
export default function Write({ actionData }: Route.ComponentProps) {
	const { language } = useApp();
	return <PostForm initial={{ title: "", content: "", language }} result={actionData} />;
}
