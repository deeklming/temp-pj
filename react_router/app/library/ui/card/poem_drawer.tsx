import type { PostSummary } from "@shared/contracts";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import { formatDate, LANGUAGE_NAMES } from "~/lib/i18n";
import { useApp } from "~/lib/use-app";

export default function PoemDrawerCard({
	post,
	href,
	onSelect,
}: {
	post: PostSummary;
	href: string;
	onSelect: (element: HTMLAnchorElement) => void;
}) {
	const { t, language } = useApp();
	let hash = 0;
	for (const char of post.id) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
	const hue = [42, 112, 190, 18, 260, 155][Math.abs(hash) % 6];
	return (
		<Link
			to={href}
			preventScrollReset
			onClick={(event) => onSelect(event.currentTarget)}
			className="group min-w-0 rounded-xl outline-offset-4"
			aria-label={`${t("readPost")}: ${post.title}`}
		>
			<div
				className="relative flex aspect-[4/5] items-center justify-center overflow-hidden rounded-lg border border-black/5 transition-transform duration-200 group-hover:-translate-y-1 group-hover:shadow-md"
				style={{ backgroundColor: `hsl(${hue} 28% 87%)`, color: `hsl(${hue} 25% 28%)` }}
			>
				<span className="absolute top-4 left-4 rounded-full border border-current/20 px-2.5 py-1 text-xs">
					{LANGUAGE_NAMES[post.language]}
				</span>
				<ArrowUpRight className="absolute top-5 right-4" size={18} aria-hidden="true" />
				<span
					className="-translate-y-3 select-none font-serif text-[11rem] leading-none opacity-45"
					aria-hidden="true"
				>
					“
				</span>
				<span
					className="absolute right-7 bottom-7 left-7 border-t border-current/25 pt-3 text-xs tracking-[0.2em]"
					aria-hidden="true"
				>
					temppj.
				</span>
			</div>
			<h2
				lang={post.language}
				className="mt-4 line-clamp-2 break-words text-lg font-semibold leading-snug group-hover:text-primary"
			>
				{post.title}
			</h2>
			<div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
				<span className="max-w-28 truncate">{post.author.nickname}</span>
				<time dateTime={post.createdAt}>{formatDate(post.createdAt, language)}</time>
			</div>
		</Link>
	);
}
