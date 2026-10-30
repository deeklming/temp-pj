import { type ChatMessage, chatContent, isChatMessage } from "@shared/chat";
import { codePointLength } from "@shared/contracts";
import { useEffect, useRef, useState } from "react";
import { data, Link, redirect } from "react-router";
import { getCurrentUser } from "~/lib/api.server";
import { useApp } from "~/lib/use-app";
import { Button } from "~/shadcn/components/ui/button";
import type { Route } from "./+types/chat";

export async function loader({ request }: Route.LoaderArgs) {
	const { user, headers, unavailable } = await getCurrentUser(request);
	if (unavailable) throw data({ code: "API_UNAVAILABLE" }, { status: 502, headers });
	if (!user) throw redirect("/sign/in?returnTo=%2Fchat", { headers });
	const endpoint = new URL(process.env.API_URL ?? "http://127.0.0.1:3001");
	const hostname = new URL(request.url).hostname;
	if (["localhost", "127.0.0.1"].includes(endpoint.hostname) && ["localhost", "127.0.0.1"].includes(hostname))
		endpoint.hostname = hostname;
	endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
	endpoint.pathname = "/api/chat";
	endpoint.search = endpoint.hash = endpoint.username = endpoint.password = "";
	return data({ endpoint: endpoint.toString(), user }, { headers });
}

export default function Chat({ loaderData }: Route.ComponentProps) {
	const { t, language } = useApp();
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [draft, setDraft] = useState("");
	const [status, setStatus] = useState("chatConnecting");
	const [error, setError] = useState("");
	const [sending, setSending] = useState(false);
	const [attempt, setAttempt] = useState(0);
	const socket = useRef<WebSocket | null>(null);
	const pending = useRef<string | null>(null);
	const acknowledgementTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const bottom = useRef<HTMLDivElement>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: Reconnect recreates the socket even when its URL is unchanged.
	useEffect(() => {
		let active = true;
		setStatus("chatConnecting");
		setError("");
		const ws = new WebSocket(loaderData.endpoint);
		socket.current = ws;
		const connectionTimer = setTimeout(() => ws.close(), 5000);
		ws.onmessage = (event) => {
			if (!active) return;
			try {
				const value = JSON.parse(String(event.data));
				if (value.type === "ready") {
					clearTimeout(connectionTimer);
					setStatus("chatConnected");
				} else if (value.type === "message" && isChatMessage(value.message)) {
					const message = value.message;
					setMessages((items) =>
						items.some((item) => item.id === message.id) ? items : [...items, message].slice(-100),
					);
				} else if (value.type === "sent") {
					clearTimeout(acknowledgementTimer.current);
					const sent = pending.current;
					setDraft((current) => (current === sent ? "" : current));
					pending.current = null;
					setSending(false);
				} else if (value.type === "error") {
					clearTimeout(acknowledgementTimer.current);
					pending.current = null;
					setSending(false);
					setError(value.code === "CHAT_LENGTH" ? "CHAT_LENGTH" : "CHAT_UNAVAILABLE");
				}
			} catch {
				setError("CHAT_UNAVAILABLE");
			}
		};
		ws.onclose = (event) => {
			if (!active) return;
			clearTimeout(connectionTimer);
			clearTimeout(acknowledgementTimer.current);
			setStatus("chatDisconnected");
			setError(
				event.code === 1008
					? "UNAUTHENTICATED"
					: pending.current !== null
						? "CHAT_DELIVERY_UNKNOWN"
						: "CHAT_UNAVAILABLE",
			);
			pending.current = null;
			setSending(false);
		};
		ws.onerror = () => {
			if (active) setStatus("chatDisconnected");
		};
		return () => {
			active = false;
			clearTimeout(connectionTimer);
			clearTimeout(acknowledgementTimer.current);
			pending.current = null;
			socket.current = null;
			ws.close();
		};
	}, [loaderData.endpoint, attempt]);
	useEffect(() => {
		if (messages.length) bottom.current?.scrollIntoView({ block: "nearest" });
	}, [messages]);
	const length = codePointLength(draft);
	return (
		<section className="mx-auto max-w-3xl space-y-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="text-3xl font-semibold">{t("chatTitle")}</h1>
					<p className="mt-2 text-sm text-muted-foreground">{t("chatDescription")}</p>
				</div>
				<p role="status" className="text-sm text-muted-foreground">
					{t(status)}
				</p>
			</div>
			<div
				role="log"
				aria-label={t("chatTitle")}
				aria-live="polite"
				aria-relevant="additions"
				className="h-[45vh] min-h-64 space-y-4 overflow-y-auto rounded-xl border bg-card p-5"
			>
				{messages.length === 0 && <p className="py-12 text-center text-muted-foreground">{t("chatEmpty")}</p>}
				{messages.map((message) => (
					<article
						key={message.id}
						className={`rounded-lg p-3 ${message.author.id === loaderData.user.id ? "bg-primary/10" : "bg-muted"}`}
					>
						<div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
							<span className="font-medium">{message.author.nickname}</span>
							<time dateTime={message.createdAt}>
								{new Intl.DateTimeFormat(language, {
									hour: "2-digit",
									minute: "2-digit",
									timeZone: "UTC",
								}).format(new Date(message.createdAt))}{" "}
								UTC
							</time>
						</div>
						<p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</p>
					</article>
				))}
				<div ref={bottom} />
			</div>
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{t(error)}
				</p>
			)}
			{status === "chatDisconnected" && (
				<div className="flex gap-3">
					<Button
						variant="outline"
						onClick={() => {
							setSending(false);
							setAttempt((value) => value + 1);
						}}
					>
						{t("chatReconnect")}
					</Button>
					{error === "UNAUTHENTICATED" && (
						<Button asChild>
							<Link to="/sign/in?returnTo=%2Fchat">{t("signin")}</Link>
						</Button>
					)}
				</div>
			)}
			<form
				className="space-y-2"
				onSubmit={(event) => {
					event.preventDefault();
					if (chatContent({ content: draft }) === null) {
						setError("CHAT_LENGTH");
						return;
					}
					if (
						pending.current !== null ||
						status !== "chatConnected" ||
						socket.current?.readyState !== WebSocket.OPEN
					)
						return;
					setError("");
					pending.current = draft;
					setSending(true);
					try {
						socket.current.send(JSON.stringify({ content: draft }));
						acknowledgementTimer.current = setTimeout(() => socket.current?.close(), 5000);
					} catch {
						socket.current?.close();
					}
				}}
			>
				<label htmlFor="chat-message" className="text-sm font-medium">
					{t("chatMessage")}
				</label>
				<textarea
					id="chat-message"
					name="content"
					rows={3}
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					className="w-full resize-y rounded-lg border bg-background p-3"
					aria-describedby="chat-limit"
				/>
				<div className="flex items-center justify-between gap-3">
					<p
						id="chat-limit"
						className={`text-xs ${length > 1000 ? "text-destructive" : "text-muted-foreground"}`}
					>
						{t("chatLimit", { count: length })}
					</p>
					<Button
						type="submit"
						disabled={status !== "chatConnected" || sending || !draft.trim() || length > 1000}
					>
						{t(sending ? "chatSending" : "chatSend")}
					</Button>
				</div>
			</form>
			<noscript>
				<p>{t("chatNeedsJavaScript")}</p>
			</noscript>
		</section>
	);
}
