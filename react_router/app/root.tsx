import { LANGUAGES } from "@shared/contracts";
import { detectLanguage } from "@shared/language";
import { Globe2, PenLine } from "lucide-react";
import {
	data,
	Form,
	isRouteErrorResponse,
	Link,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	type ShouldRevalidateFunction,
	useLocation,
	useNavigation,
} from "react-router";
import type { Route } from "./+types/root";
import { getCurrentUser } from "./lib/api.server";
import { LANGUAGE_NAMES, translate } from "./lib/i18n";
import { logger } from "./lib/logger.server";
import { useApp } from "./lib/use-app";
import { Button } from "./shadcn/components/ui/button";
import "./app.css";

export async function loader({ request }: Route.LoaderArgs) {
	const cookie =
		request.headers
			.get("cookie")
			?.split(";")
			.map((part) => part.trim())
			.find((part) => part.startsWith("temppj_language="))
			?.split("=")[1] ?? "";
	const language = detectLanguage(cookie, request.headers.get("accept-language") ?? "");
	const { user, headers, unavailable } = await getCurrentUser(request);
	logger.info("Page loader {method} {path} {status}", {
		method: request.method,
		path: new URL(request.url).pathname,
		status: unavailable ? 502 : 200,
	});
	return data(
		{ user, language, sessionUnavailable: !!unavailable },
		{ status: unavailable ? 502 : 200, headers },
	);
}
export const headers: Route.HeadersFunction = ({ loaderHeaders }) => loaderHeaders;
export const shouldRevalidate: ShouldRevalidateFunction = ({ actionStatus, defaultShouldRevalidate }) =>
	actionStatus === 502 ? false : defaultShouldRevalidate;
export const meta: Route.MetaFunction = ({ data: result }) => [
	{ title: `temppj · ${translate(result?.language ?? "en-US", "tagline")}` },
	{ name: "description", content: translate(result?.language ?? "en-US", "feedDescription") },
];

export function Layout({ children }: { children: React.ReactNode }) {
	const { language, user, sessionUnavailable, t } = useApp();
	const location = useLocation();
	const busy = useNavigation().state !== "idle";
	return (
		<html lang={language}>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<Meta />
				<Links />
			</head>
			<body>
				<header className="border-b border-border">
					<div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
						<Link to="/" className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
							<PenLine size={24} aria-hidden="true" />
							temppj<span className="text-primary">.</span>
						</Link>
						<nav className="flex flex-wrap items-center gap-3 text-sm" aria-label={t("appName")}>
							<Link to="/poem" className="hover:underline">
								{t("browseStories")}
							</Link>
							<Form method="post" action="/api/cookie/lang" className="flex items-center gap-1">
								<Globe2 size={16} aria-hidden="true" />
								<input type="hidden" name="returnTo" value={location.pathname + location.search} />
								<label className="sr-only" htmlFor="ui-language">
									{t("uiLanguage")}
								</label>
								<select
									id="ui-language"
									key={language}
									name="language"
									defaultValue={language}
									className="bg-transparent py-2"
									onChange={(event) => event.currentTarget.form?.requestSubmit()}
									disabled={busy}
								>
									{LANGUAGES.map((locale) => (
										<option key={locale} value={locale}>
											{LANGUAGE_NAMES[locale]}
										</option>
									))}
								</select>
								<noscript>
									<button type="submit">{t("save")}</button>
								</noscript>
							</Form>
							{sessionUnavailable ? (
								<output className="max-w-sm text-sm text-destructive">{t("API_UNAVAILABLE")}</output>
							) : user ? (
								<>
									<span className="max-w-28 truncate text-muted-foreground">{user.nickname}</span>
									<Form method="post" action="/sign/out">
										<Button variant="ghost" disabled={busy}>
											{t("signout")}
										</Button>
									</Form>
								</>
							) : (
								<>
									<Link to="/sign/in" className="hover:underline">
										{t("signin")}
									</Link>
									<Button asChild variant="outline">
										<Link to="/sign/up">{t("signup")}</Link>
									</Button>
								</>
							)}
						</nav>
					</div>
				</header>
				<main className="mx-auto min-h-[75vh] w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">{children}</main>
				<footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 border-t px-5 py-7 text-sm text-muted-foreground sm:px-8">
					<span>temppj · {t("tagline")}</span>
					<span>{t("footer")}</span>
				</footer>
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}
export default function App() {
	return <Outlet />;
}
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	const { t } = useApp();
	const code =
		isRouteErrorResponse(error) && typeof error.data?.code === "string" ? error.data.code : "INTERNAL_ERROR";
	return (
		<section className="mx-auto max-w-lg py-20 text-center">
			<p className="mb-3 text-sm text-muted-foreground">{isRouteErrorResponse(error) ? error.status : 500}</p>
			<h1 className="mb-4 text-3xl font-semibold">{t("errorTitle")}</h1>
			<p role="alert" className="mb-8 text-muted-foreground">
				{t(code)}
			</p>
			<Button asChild>
				<Link to="/poem" reloadDocument>
					{t("backToFeed")}
				</Link>
			</Button>
		</section>
	);
}
