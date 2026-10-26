import { ArrowRight, BookOpen, Globe2, PenLine, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { useApp } from "~/lib/use-app";
import { Button } from "~/shadcn/components/ui/button";

export default function Home() {
	const { user, language, t } = useApp();
	const startLink = user ? "/poem/write" : "/sign/up";
	const startLabel = t(user ? "write" : "signup");
	const features = [
		{
			icon: BookOpen,
			title: "landingReadTitle",
			description: "landingReadDescription",
			color: "from-violet-100 to-indigo-50 text-violet-700",
		},
		{
			icon: PenLine,
			title: "landingWriteTitle",
			description: "landingWriteDescription",
			color: "from-pink-100 to-rose-50 text-pink-700",
		},
		{
			icon: Globe2,
			title: "landingLanguageTitle",
			description: "landingLanguageDescription",
			color: "from-blue-100 to-cyan-50 text-blue-700",
		},
	];
	return (
		<div className={`space-y-20 sm:space-y-28 ${language === "ko-KR" ? "break-keep" : ""}`}>
			<section
				aria-labelledby="landing-title"
				className="relative isolate overflow-hidden rounded-3xl bg-linear-to-br from-purple-700 via-violet-600 to-blue-600 px-6 py-16 text-white shadow-xl sm:px-12 sm:py-20"
			>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute -top-24 -right-20 -z-10 size-80 rounded-full border-50 border-white/5"
				/>
				<div className="grid items-center gap-14 lg:grid-cols-[1.2fr_1fr]">
					<div className="text-center lg:text-left">
						<p className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-medium tracking-wide">
							<Sparkles size={14} aria-hidden="true" />
							{t("landingEyebrow")}
						</p>
						<h1
							id="landing-title"
							className="text-4xl leading-tight font-bold tracking-tight sm:text-5xl lg:text-6xl"
						>
							{t("landingTitle")}
						</h1>
						<p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-violet-50 sm:text-lg lg:mx-0">
							{t("landingDescription")}
						</p>
						<div className="mt-9 flex flex-wrap justify-center gap-3 lg:justify-start">
							<Button asChild size="lg" className="bg-pink-600 text-white shadow-md hover:bg-pink-700">
								<Link to={startLink}>
									{startLabel}
									<ArrowRight size={16} aria-hidden="true" />
								</Link>
							</Button>
							<Button
								asChild
								size="lg"
								variant="outline"
								className="border-white/40 bg-transparent text-white hover:bg-white/15 hover:text-white"
							>
								<Link to="/poem">{t("browseStories")}</Link>
							</Button>
						</div>
					</div>
					<div className="relative mx-auto w-full max-w-sm pb-5 lg:rotate-3">
						<div
							aria-hidden="true"
							className="absolute inset-0 translate-x-3 translate-y-3 rounded-2xl bg-white/15"
						/>
						<figure className="relative rounded-2xl bg-white p-7 text-stone-800 shadow-2xl sm:p-9">
							<PenLine size={24} className="mb-8 text-violet-600" aria-hidden="true" />
							<p className="mb-3 text-xs font-medium tracking-widest text-violet-700">{t("eyebrow")}</p>
							<blockquote className="font-serif text-2xl leading-relaxed sm:text-3xl">
								{t("landingQuote")}
							</blockquote>
							<figcaption className="mt-8 border-t border-stone-100 pt-4 text-sm text-stone-500">
								{t("landingQuoteCaption")}
							</figcaption>
						</figure>
					</div>
				</div>
			</section>
			<section aria-labelledby="landing-welcome" className="mx-auto max-w-2xl text-center">
				<p className="mb-4 text-xs font-semibold tracking-widest text-violet-700">temppj</p>
				<h2 id="landing-welcome" className="text-3xl leading-snug font-semibold tracking-tight sm:text-4xl">
					{t("landingWelcomeTitle")}
				</h2>
				<p className="mt-5 leading-relaxed text-muted-foreground">{t("landingWelcomeDescription")}</p>
			</section>
			<section aria-labelledby="landing-features">
				<h2 id="landing-features" className="mb-9 text-center text-2xl font-semibold sm:text-3xl">
					{t("landingFeatures")}
				</h2>
				<div className="grid gap-6 md:grid-cols-3">
					{features.map(({ icon: Icon, title, description, color }) => (
						<article key={title} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
							<div className={`flex h-40 items-center justify-center bg-linear-to-br ${color}`}>
								<Icon size={52} strokeWidth={1.25} aria-hidden="true" />
							</div>
							<div className="p-7">
								<h3 className="text-xl font-semibold">{t(title)}</h3>
								<p className="mt-3 leading-relaxed text-muted-foreground">{t(description)}</p>
							</div>
						</article>
					))}
				</div>
			</section>
			<section aria-labelledby="landing-journey">
				<h2 id="landing-journey" className="mb-9 text-center text-2xl font-semibold sm:text-3xl">
					{t("landingJourney")}
				</h2>
				<ol className="grid gap-8 md:grid-cols-3">
					{[1, 2, 3].map((step) => (
						<li key={step} className="rounded-2xl bg-secondary/50 p-7">
							<span
								aria-hidden="true"
								className="mb-6 inline-flex size-10 items-center justify-center rounded-full bg-white text-sm font-semibold text-violet-700"
							>
								0{step}
							</span>
							<h3 className="text-lg font-semibold">{t(`landingStep${step}Title`)}</h3>
							<p className="mt-3 leading-relaxed text-muted-foreground">
								{t(`landingStep${step}Description`)}
							</p>
						</li>
					))}
				</ol>
			</section>
			<section
				aria-labelledby="landing-start"
				className="rounded-3xl bg-linear-to-l from-purple-700 to-blue-600 px-6 py-14 text-center text-white sm:px-12"
			>
				<h2 id="landing-start" className="text-3xl font-semibold sm:text-4xl">
					{t("landingStartTitle")}
				</h2>
				<p className="mx-auto mt-5 max-w-xl leading-relaxed text-violet-50">{t("landingStartDescription")}</p>
				<Button asChild size="lg" className="mt-8 bg-pink-600 text-white shadow-md hover:bg-pink-700">
					<Link to={startLink}>
						{startLabel}
						<ArrowRight size={16} aria-hidden="true" />
					</Link>
				</Button>
			</section>
		</div>
	);
}
