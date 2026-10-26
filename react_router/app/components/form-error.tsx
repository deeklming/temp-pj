import type { ApiError } from "@shared/contracts";
import { useApp } from "~/lib/use-app";
export function FormError({ error, field }: { error?: ApiError; field?: string }) {
	const { t } = useApp();
	const code = field ? error?.fieldErrors?.[field] : error?.code;
	if (!code) return null;
	return (
		<p id={field ? `${field}-error` : undefined} role="alert" className="text-sm text-destructive">
			{t(code)}
		</p>
	);
}
