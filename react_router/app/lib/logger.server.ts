import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { getTimeRotatingFileSink } from "@logtape/file";
import { configureSync, getConsoleSink, getLogger } from "@logtape/logtape";

// Root tests run from the repository; React Router CLIs run from the frontend workspace.
const workspaceRoot = existsSync("react_router/package.json") ? process.cwd() : resolve("..");
configureSync({
	reset: true,
	sinks: {
		file: getTimeRotatingFileSink({
			directory: resolve(workspaceRoot, "logs/frontend"),
			interval: "daily",
			bufferSize: 0,
		}),
		console: getConsoleSink(),
	},
	loggers: [
		{ category: ["temppj", "frontend"], lowestLevel: "info", sinks: ["file", "console"] },
		{ category: ["logtape", "meta"], lowestLevel: "warning", sinks: ["console"] },
	],
});
export const logger = getLogger(["temppj", "frontend"]);
