import { fileURLToPath } from "node:url";
import { getTimeRotatingFileSink } from "@logtape/file";
import { configure, getConsoleSink, getLogger } from "@logtape/logtape";

export const logger = getLogger(["temppj", "backend"]);

export async function configureLogging() {
	await configure({
		sinks: {
			file: getTimeRotatingFileSink({
				directory: fileURLToPath(new URL("../../logs/backend/", import.meta.url)),
				interval: "daily",
				bufferSize: 0,
			}),
			console: getConsoleSink(),
		},
		loggers: [
			{ category: ["temppj"], lowestLevel: "info", sinks: ["file", "console"] },
			{ category: ["logtape", "meta"], lowestLevel: "warning", sinks: ["console"] },
		],
	});
}
