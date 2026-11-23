import type { JsonObject } from "$types/json.ts";
import type { HookEvent, HookServer, HookServerOptions, HookSettings, PatchHunk } from "$types/observe.ts";

/** Claude Code reads the token from this env var into the hook header, so it never shows in argv. */
export const HOOK_TOKEN_ENV = "PHDTERM_HOOK_TOKEN";
const MATCHER = "Edit|Write|MultiEdit|NotebookEdit|Bash";
const TIMEOUT_S = 5;

const isObject = (value: unknown): value is JsonObject =>
	typeof value === "object" && value !== null && !Array.isArray(value);
const asString = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);

function isHunk(value: unknown): value is PatchHunk {
	return (
		isObject(value) &&
		typeof value.oldStart === "number" &&
		typeof value.newStart === "number" &&
		Array.isArray(value.lines) &&
		value.lines.every((line) => typeof line === "string")
	);
}

/** Keeps what phdterm needs from a PreToolUse / PostToolUse payload; null for anything else. */
export function parseHookPayload(payload: unknown): HookEvent | null {
	if (!isObject(payload)) return null;
	const phase =
		payload.hook_event_name === "PreToolUse" ? "pre" : payload.hook_event_name === "PostToolUse" ? "post" : null;
	const tool = asString(payload.tool_name);
	if (!phase || !tool) return null;
	const input = isObject(payload.tool_input) ? payload.tool_input : {};
	const response = isObject(payload.tool_response) ? payload.tool_response : {};
	const patch = Array.isArray(response.structuredPatch) ? response.structuredPatch.filter(isHunk) : null;
	const bashDiff = isObject(response.bashEditDiff) ? response.bashEditDiff : {};
	const changedFiles = Array.isArray(bashDiff.changedFiles)
		? bashDiff.changedFiles.filter((f): f is string => typeof f === "string")
		: [];
	return {
		phase,
		tool,
		file: asString(input.file_path) ?? asString(input.notebook_path),
		patch: patch && patch.length > 0 ? patch : null,
		changedFiles,
	};
}

/** Local HTTP endpoint for claude's hooks: 127.0.0.1, random port, one token per session. */
export function startHookServer({ token, onEvent }: HookServerOptions): HookServer {
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(req) {
			const url = new URL(req.url);
			if (req.method !== "POST" || url.pathname !== "/hook") return new Response(null, { status: 404 });
			if (req.headers.get("authorization") !== `Bearer ${token}`) return new Response(null, { status: 401 });
			let payload: unknown;
			try {
				payload = await req.json();
			} catch {
				return new Response(null, { status: 400 });
			}
			const event = parseHookPayload(payload);
			if (event) onEvent(event);
			// an empty 2xx body tells claude "no decision": the tool goes on as usual
			return new Response(null, { status: 200 });
		},
	});
	return { url: `http://127.0.0.1:${server.port}/hook`, stop: () => server.stop(true) };
}

export function hookSettings(url: string): HookSettings {
	const group = () => [
		{
			matcher: MATCHER,
			hooks: [
				{
					type: "http" as const,
					url,
					headers: { Authorization: `Bearer $${HOOK_TOKEN_ENV}` },
					allowedEnvVars: [HOOK_TOKEN_ENV],
					timeout: TIMEOUT_S,
				},
			],
		},
	];
	return { hooks: { PreToolUse: group(), PostToolUse: group() } };
}
