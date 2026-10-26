import type { ApiError } from "@shared/contracts";
import { Form, Link, useNavigation } from "react-router";
import { useApp } from "~/lib/use-app";
import { Button } from "~/shadcn/components/ui/button";
import { Input } from "~/shadcn/components/ui/input";
import { FormError } from "./form-error";

export function AuthForm({
	signup,
	returnTo,
	result,
}: {
	signup: boolean;
	returnTo: string;
	result?: { error: ApiError; values: { email: string; nickname: string } };
}) {
	const { t } = useApp();
	const busy = useNavigation().state !== "idle";
	return (
		<section className="mx-auto max-w-md py-8 sm:py-14">
			<p className="mb-4 text-sm font-medium text-primary">{t("eyebrow")}</p>
			<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
				{t(signup ? "signUpTitle" : "signInTitle")}
			</h1>
			<p className="mt-4 text-muted-foreground">{t(signup ? "signupExplanation" : "signinExplanation")}</p>
			<Form method="post" className="mt-8 grid gap-5" noValidate>
				<input type="hidden" name="returnTo" value={returnTo} />
				<FormError error={result?.error} />
				<div className="grid gap-2">
					<label htmlFor="email">{t("email")}</label>
					<Input
						id="email"
						name="email"
						type="email"
						autoComplete="email"
						required
						defaultValue={result?.values.email}
						aria-invalid={!!result?.error.fieldErrors?.email}
						aria-describedby={result?.error.fieldErrors?.email ? "email-error" : undefined}
					/>
					<FormError error={result?.error} field="email" />
				</div>
				{signup && (
					<div className="grid gap-2">
						<label htmlFor="nickname">{t("nickname")}</label>
						<Input
							id="nickname"
							name="nickname"
							autoComplete="nickname"
							required
							defaultValue={result?.values.nickname}
							aria-invalid={!!result?.error.fieldErrors?.nickname}
							aria-describedby="nickname-hint nickname-error"
						/>
						<p id="nickname-hint" className="text-xs text-muted-foreground">
							{t("nicknameHint")}
						</p>
						<FormError error={result?.error} field="nickname" />
					</div>
				)}
				<div className="grid gap-2">
					<label htmlFor="password">{t("password")}</label>
					<Input
						id="password"
						name="password"
						type="password"
						autoComplete={signup ? "new-password" : "current-password"}
						required
						aria-invalid={!!result?.error.fieldErrors?.password}
						aria-describedby="password-hint password-error"
					/>
					<p id="password-hint" className="text-xs text-muted-foreground">
						{t("passwordHint")}
					</p>
					<FormError error={result?.error} field="password" />
				</div>
				<Button type="submit" size="lg" disabled={busy}>
					{busy ? t("saving") : t(signup ? "signup" : "signin")}
				</Button>
			</Form>
			<p className="mt-7 text-sm text-muted-foreground">
				{t(signup ? "authHintSignIn" : "authHintSignUp")}{" "}
				<Link
					className="font-medium text-primary underline underline-offset-4"
					to={`${signup ? "/sign/in" : "/sign/up"}?returnTo=${encodeURIComponent(returnTo)}`}
				>
					{t(signup ? "signin" : "signup")}
				</Link>
			</p>
		</section>
	);
}
