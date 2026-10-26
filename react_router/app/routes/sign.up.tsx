import { AuthForm } from "~/components/auth-form";
import { authAction, authLoader } from "~/lib/auth.server";
import type { Route } from "./+types/sign.up";
export const loader = ({ request }: Route.LoaderArgs) => authLoader(request);
export const action = ({ request }: Route.ActionArgs) => authAction(request, true);
export default function SignUp({ loaderData, actionData }: Route.ComponentProps) {
	return <AuthForm signup returnTo={loaderData.returnTo} result={actionData} />;
}
