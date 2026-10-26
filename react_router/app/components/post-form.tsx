import { type ApiError, codePointLength, LANGUAGES, type PostInput } from "@shared/contracts";
import { useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import { LANGUAGE_NAMES } from "~/lib/i18n";
import { useApp } from "~/lib/use-app";
import { Button } from "~/shadcn/components/ui/button";
import { Input } from "~/shadcn/components/ui/input";
import { Textarea } from "~/shadcn/components/ui/textarea";
import { FormError } from "./form-error";

export function PostForm({
	initial,
	editing = false,
	result,
}: {
	initial: PostInput;
	editing?: boolean;
	result?: { error: ApiError; values: { title: string; content: string; language: string } };
}) {
	const { t } = useApp();
	const [title, setTitle] = useState(result?.values.title ?? initial.title);
	const [content, setContent] = useState(result?.values.content ?? initial.content);
	const busy = useNavigation().state !== "idle";
	return (
		<section className="mx-auto max-w-2xl">
			<Link to="/poem" className="text-sm text-muted-foreground hover:text-primary">
				← {t("backToFeed")}
			</Link>
			<h1 className="mt-7 mb-9 text-4xl font-semibold tracking-tight">
				{t(editing ? "editPost" : "newPost")}
			</h1>
			<Form method="post" className="grid gap-6" noValidate>
				<FormError error={result?.error} />
				<div className="grid gap-2">
					<label htmlFor="language">{t("language")}</label>
					<select
						id="language"
						name="language"
						defaultValue={result?.values.language ?? initial.language}
						className="h-11 w-fit rounded-md border bg-background px-3"
						aria-invalid={!!result?.error.fieldErrors?.language}
					>
						{LANGUAGES.map((language) => (
							<option key={language} value={language}>
								{LANGUAGE_NAMES[language]}
							</option>
						))}
					</select>
					<FormError error={result?.error} field="language" />
				</div>
				<div className="grid gap-2">
					<label htmlFor="title">{t("title")}</label>
					<Input
						id="title"
						name="title"
						value={title}
						onChange={(event) => setTitle(event.target.value)}
						className="h-12 text-lg"
						required
						aria-invalid={!!result?.error.fieldErrors?.title}
						aria-describedby="title-hint title-error"
					/>
					<div className="flex justify-between gap-3 text-xs text-muted-foreground">
						<span id="title-hint">{t("titleHint")}</span>
						<span>{t("charCount", { count: codePointLength(title) })}</span>
					</div>
					<FormError error={result?.error} field="title" />
				</div>
				<div className="grid gap-2">
					<label htmlFor="content">{t("content")}</label>
					<Textarea
						id="content"
						name="content"
						value={content}
						onChange={(event) => setContent(event.target.value)}
						className="min-h-72 leading-8"
						required
						aria-invalid={!!result?.error.fieldErrors?.content}
						aria-describedby="content-hint content-error"
					/>
					<div className="flex justify-between gap-3 text-xs text-muted-foreground">
						<span id="content-hint">{t("contentHint")}</span>
						<span>{t("charCount", { count: codePointLength(content) })}</span>
					</div>
					<FormError error={result?.error} field="content" />
				</div>
				<div className="flex justify-end gap-3 border-t pt-6">
					<Button asChild variant="ghost">
						<Link to="/poem">{t("cancel")}</Link>
					</Button>
					<Button type="submit" disabled={busy}>
						{t(busy ? "saving" : editing ? "save" : "publish")}
					</Button>
				</div>
			</Form>
		</section>
	);
}
