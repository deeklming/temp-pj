import { AuthForm } from "~/components/auth-form";
import { authAction, authLoader } from "~/lib/auth.server";
import type { Route } from "./+types/sign.in";
export const loader = ({ request }: Route.LoaderArgs) => authLoader(request);
export const action = ({ request }: Route.ActionArgs) => authAction(request, false);
export default function SignIn({ loaderData, actionData }: Route.ComponentProps) {
	return <AuthForm signup={false} returnTo={loaderData.returnTo} result={actionData} />;
}
