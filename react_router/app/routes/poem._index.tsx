import { LANGUAGES, type Post, type PostList, text } from "@shared/contracts";
import { PenLine, X } from "lucide-react";
import { useRef } from "react";
import type { ShouldRevalidateFunction } from "react-router";
import { data, Form, Link, redirect, useLocation, useNavigate, useNavigation } from "react-router";
import { FormError } from "~/components/form-error";
import { apiError, apiRequest, assertOrigin, requireResponse, responseHeaders } from "~/lib/api.server";
import { formatDate, LANGUAGE_NAMES } from "~/lib/i18n";
import { useApp } from "~/lib/use-app";
import PoemDrawerCard from "~/library/ui/card/poem_drawer";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "~/shadcn/components/ui/alert-dialog";
import { Button } from "~/shadcn/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "~/shadcn/components/ui/drawer";
import type { Route } from "./+types/poem._index";

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const query = new URLSearchParams();
	for (const key of ["language", "page"])
		if (url.searchParams.has(key)) query.set(key, url.searchParams.get(key) ?? "");
	const list = await requireResponse<PostList>(await apiRequest(request, `/posts?${query}`));
	const postId = url.searchParams.get("post");
	let post: Post | null = null;
	let postError: string | null = null;
	if (postId) {
		const response = await apiRequest(request, `/posts/${encodeURIComponent(postId)}`);
		if (response.status === 404) postError = "POST_NOT_FOUND";
		else post = await requireResponse<Post>(response);
	}
	return data(
		{ list, post, postError, postId },
		{ status: postError ? 404 : 200, headers: { "cache-control": "no-store" } },
	);
}
export async function action({ request }: Route.ActionArgs) {
	assertOrigin(request);
	const form = await request.formData();
	if (form.get("intent") !== "delete" || !text(form.get("id")))
		return data({ error: { code: "VALIDATION" } }, { status: 422 });
	const response = await apiRequest(request, `/posts/${encodeURIComponent(text(form.get("id")))}`, "DELETE");
	const headers = responseHeaders(response);
	if (!response.ok) return data({ error: await apiError(response) }, { status: response.status, headers });
	const url = new URL(request.url);
	url.searchParams.delete("post");
	return redirect(url.pathname + url.search, { headers });
}

export const shouldRevalidate: ShouldRevalidateFunction = ({ actionStatus, defaultShouldRevalidate }) =>
	actionStatus === 502 ? false : defaultShouldRevalidate;

export default function Poem({ loaderData, actionData }: Route.ComponentProps) {
	const { list, post, postError, postId } = loaderData;
	const { user, language, t } = useApp();
	const navigate = useNavigate();
	const location = useLocation();
	const busy = useNavigation().state !== "idle";
	const heading = useRef<HTMLHeadingElement>(null);
	const lastTrigger = useRef<HTMLAnchorElement | null>(null);
	const deleteForm = useRef<HTMLFormElement>(null);
	const queryLink = (changes: Record<string, string | null>) => {
		const params = new URLSearchParams(location.search);
		for (const [key, value] of Object.entries(changes))
			value === null ? params.delete(key) : params.set(key, value);
		return `/poem${params.size ? `?${params}` : ""}`;
	};
	const closeLink = queryLink({ post: null });
	const pageCount = Math.max(1, Math.ceil(list.total / list.pageSize));
	return (
		<Drawer
			autoFocus
			open={!!postId}
			onOpenChange={(open) => {
				if (!open) navigate(closeLink, { preventScrollReset: true });
			}}
		>
			<section className="mb-12 flex flex-wrap items-end justify-between gap-7">
				<div className="max-w-2xl">
					<p className="mb-4 text-xs font-semibold tracking-[0.18em] text-primary">{t("eyebrow")}</p>
					<h1
						ref={heading}
						tabIndex={-1}
						className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl"
					>
						{t("feedTitle")}
					</h1>
					<p className="mt-5 text-muted-foreground">{t("feedDescription")}</p>
				</div>
				<Button asChild size="lg">
					<Link to={user ? "/poem/write" : "/sign/in?returnTo=%2Fpoem%2Fwrite"}>
						<PenLine size={16} aria-hidden="true" />
						{t(user ? "write" : "loginToWrite")}
					</Link>
				</Button>
			</section>
			<section
				aria-label={t("language")}
				className="mb-8 flex flex-wrap items-center justify-between gap-4 border-y py-4"
			>
				<Form method="get" className="flex flex-wrap items-center gap-3">
					<label htmlFor="feed-language" className="sr-only">
						{t("language")}
					</label>
					<select
						id="feed-language"
						key={new URLSearchParams(location.search).get("language") ?? "all"}
						name="language"
						defaultValue={new URLSearchParams(location.search).get("language") ?? ""}
						className="rounded-md border bg-background px-3 py-2 text-sm"
					>
						<option value="">{t("allLanguages")}</option>
						{LANGUAGES.map((locale) => (
							<option key={locale} value={locale}>
								{LANGUAGE_NAMES[locale]}
							</option>
						))}
					</select>
					<Button variant="ghost" type="submit" disabled={busy}>
						{t("filter")}
					</Button>
				</Form>
				<p className="text-sm text-muted-foreground">{t("countPosts", { count: list.total })}</p>
			</section>
			{list.items.length ? (
				<div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 sm:gap-x-8 lg:grid-cols-4">
					{list.items.map((item) => (
						<PoemDrawerCard
							key={item.id}
							post={item}
							href={queryLink({ post: item.id })}
							onSelect={(element) => {
								lastTrigger.current = element;
							}}
						/>
					))}
				</div>
			) : (
				<div className="rounded-lg border border-dashed py-20 text-center">
					<h2 className="text-xl font-medium">{t("empty")}</h2>
					<p className="mt-3 text-sm text-muted-foreground">{t("emptyHint")}</p>
					<Button asChild variant="link" className="mt-4">
						<Link to="/poem/write">{t("write")}</Link>
					</Button>
				</div>
			)}
			<nav
				className="mt-12 flex items-center justify-center gap-5"
				aria-label={t("pageOf", { page: list.page, pages: pageCount })}
			>
				{list.page > 1 ? (
					<Link
						to={queryLink({ page: String(list.page - 1), post: null })}
						className="text-sm hover:underline"
					>
						← {t("previous")}
					</Link>
				) : (
					<span className="text-sm text-muted-foreground">← {t("previous")}</span>
				)}
				<span className="text-sm">{t("pageOf", { page: list.page, pages: pageCount })}</span>
				{list.page < pageCount ? (
					<Link
						to={queryLink({ page: String(list.page + 1), post: null })}
						className="text-sm hover:underline"
					>
						{t("next")} →
					</Link>
				) : (
					<span className="text-sm text-muted-foreground">{t("next")} →</span>
				)}
			</nav>
			<DrawerContent
				className="mx-auto max-h-[90vh]! max-w-4xl"
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					(lastTrigger.current ?? heading.current)?.focus({ preventScroll: true });
				}}
			>
				<div className="overflow-y-auto overscroll-contain px-5 pb-10 sm:px-12">
					<DrawerHeader className="relative px-0 pt-8 text-left!">
						<DrawerTitle
							lang={post?.language}
							className="pr-10 text-3xl leading-snug break-words sm:text-4xl"
						>
							{post?.title ?? t(postError ?? "storyDetails")}
						</DrawerTitle>
						<Button
							variant="ghost"
							size="icon"
							className="absolute top-6 right-0"
							aria-label={t("close")}
							onClick={() => navigate(closeLink, { preventScrollReset: true })}
						>
							<X aria-hidden="true" />
						</Button>
						<DrawerDescription className="mt-4">
							{post
								? `${t("author")} ${post.author.nickname} · ${LANGUAGE_NAMES[post.language]} · ${formatDate(post.createdAt, language)} UTC`
								: t("backToFeed")}
						</DrawerDescription>
					</DrawerHeader>
					{post && (
						<>
							<article
								lang={post.language}
								className="my-7 min-h-32 border-y py-8 text-base leading-9 whitespace-pre-wrap break-words"
							>
								{post.content}
							</article>
							<p className="text-xs text-muted-foreground">
								{t("updated")}:{" "}
								<time dateTime={post.updatedAt}>{formatDate(post.updatedAt, language)} UTC</time>
							</p>
						</>
					)}
					{post && user?.id === post.author.id && (
						<div className="mt-6 flex justify-end gap-3">
							<Button asChild variant="outline">
								<Link to={`/poem/${encodeURIComponent(post.id)}/edit`}>{t("edit")}</Link>
							</Button>
							<Form method="post" ref={deleteForm}>
								<input type="hidden" name="intent" value="delete" />
								<input type="hidden" name="id" value={post.id} />
							</Form>
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button variant="destructive" disabled={busy}>
										{t("delete")}
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
										<AlertDialogDescription>{t("deleteDescription")}</AlertDialogDescription>
									</AlertDialogHeader>
									<FormError error={actionData?.error} />
									<AlertDialogFooter>
										<AlertDialogCancel disabled={busy}>{t("cancel")}</AlertDialogCancel>
										<AlertDialogAction
											disabled={busy}
											onClick={(event) => {
												event.preventDefault();
												deleteForm.current?.requestSubmit();
											}}
										>
											{t(busy ? "deletePending" : "confirmDelete")}
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</div>
					)}
					<FormError error={actionData?.error} />
				</div>
			</DrawerContent>
		</Drawer>
	);
}
