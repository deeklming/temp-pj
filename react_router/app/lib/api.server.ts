import type { ApiError, PublicUser } from "@shared/contracts";
import { sessionCookie } from "@shared/contracts";
import { data } from "react-router";
import { logger } from "./logger.server";

export const APP_ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:3000";
const API_URL = process.env.API_URL ?? "http://127.0.0.1:3001";
export function assertOrigin(request: Request) {
	if (request.method !== "POST") throw data({ code: "METHOD_NOT_ALLOWED" }, { status: 405 });
	if (request.headers.get("origin") !== new URL(request.url).origin)
		throw data({ code: "ORIGIN_FORBIDDEN" }, { status: 403 });
}

export async function apiRequest(request: Request, path: string, method = "GET", body?: unknown) {
	const startedAt = performance.now();
	const pathname = path.split("?")[0];
	try {
		const response = await fetch(`${API_URL}/api${path}`, {
			method,
			headers: {
				"content-type": "application/json",
				cookie: sessionCookie(request.headers),
				origin: APP_ORIGIN,
			},
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: AbortSignal.timeout(10000),
			redirect: "error",
		});
		logger.info("API {method} {path} {status} ({duration}ms)", {
			method,
			path: pathname,
			status: response.status,
			duration: Math.round(performance.now() - startedAt),
		});
		return response;
	} catch {
		logger.error("API {method} {path} unavailable", { method, path: pathname });
		return Response.json({ code: "API_UNAVAILABLE" }, { status: 502 });
	}
}
export function responseHeaders(response: Response) {
	const headers = new Headers({ "cache-control": "no-store" });
	for (const cookie of response.headers.getSetCookie()) headers.append("set-cookie", cookie);
	return headers;
}
export async function apiError(response: Response): Promise<ApiError> {
	try {
		const body = (await response.json()) as ApiError;
		return typeof body.code === "string" ? body : { code: "INTERNAL_ERROR" };
	} catch {
		return { code: "INTERNAL_ERROR" };
	}
}
export async function requireResponse<T>(response: Response): Promise<T> {
	if (!response.ok)
		throw data(await apiError(response), { status: response.status, headers: responseHeaders(response) });
	return response.json() as Promise<T>;
}
export async function getCurrentUser(
	request: Request,
): Promise<{ user: PublicUser | null; headers: Headers; unavailable?: boolean }> {
	if (!sessionCookie(request.headers))
		return { user: null, headers: new Headers({ "cache-control": "no-store" }) };
	const response = await apiRequest(request, "/auth/me");
	const headers = responseHeaders(response);
	if (response.status === 502) return { user: null, headers, unavailable: true };
	if (response.status === 401) return { user: null, headers };
	const { user } = await requireResponse<{ user: PublicUser }>(response);
	return { user, headers };
}
