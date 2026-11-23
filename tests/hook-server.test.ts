import { afterEach, describe, expect, test } from "bun:test";
import type { HookEvent, HookServer } from "$types/observe.ts";
import { HOOK_TOKEN_ENV, hookSettings, startHookServer } from "../src/observe/hook-server.ts";

let server: HookServer | undefined;
afterEach(() => server?.stop());

function start(token = "s3cret") {
	const events: HookEvent[] = [];
	server = startHookServer({
		token,
		onEvent: (e) => {
			events.push(e);
		},
	});
	return { events, url: server.url };
}

const post = (url: string, body: unknown, token = "s3cret") =>
	fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
		body: JSON.stringify(body),
	});

describe("AC2 hook events reach phdterm", () => {
	test("listens on 127.0.0.1 on a random port", () => {
		const { url } = start();
		expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/hook$/);
		expect(url).not.toContain(":0/");
	});

	test("a PostToolUse Edit gives the file and the structuredPatch", async () => {
		const { events, url } = start();
		const res = await post(url, {
			hook_event_name: "PostToolUse",
			tool_name: "Edit",
			tool_use_id: "toolu_1",
			tool_input: { file_path: "/repo/src/a.ts", old_string: "a", new_string: "b" },
			tool_response: {
				filePath: "/repo/src/a.ts",
				structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ["-a", "+b"] }],
			},
		});
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("");
		expect(events).toEqual([
			{
				phase: "post",
				tool: "Edit",
				toolUseId: "toolu_1",
				file: "/repo/src/a.ts",
				patch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ["-a", "+b"] }],
				changedFiles: [],
			},
		]);
	});

	test("Bash events carry bashEditDiff.changedFiles; NotebookEdit its notebook_path", async () => {
		const { events, url } = start();
		await post(url, { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "sed -i" } });
		await post(url, {
			hook_event_name: "PostToolUse",
			tool_name: "Bash",
			tool_input: { command: "sed -i" },
			tool_response: { bashEditDiff: { changedFiles: ["/repo/x.json"] } },
		});
		await post(url, {
			hook_event_name: "PreToolUse",
			tool_name: "NotebookEdit",
			tool_input: { notebook_path: "/r/n.ipynb" },
		});
		expect(events.map((e) => [e.phase, e.tool, e.file, e.changedFiles])).toEqual([
			["pre", "Bash", null, []],
			["post", "Bash", null, ["/repo/x.json"]],
			["pre", "NotebookEdit", "/r/n.ipynb", []],
		]);
	});

	test("a failed tool call (PostToolUseFailure) ends the call like a PostToolUse", async () => {
		const { events, url } = start();
		await post(url, {
			hook_event_name: "PostToolUseFailure",
			tool_name: "Edit",
			tool_use_id: "toolu_9",
			tool_input: { file_path: "/repo/a.ts" },
			error: "old_string not found",
		});
		expect(events.map((e) => [e.phase, e.toolUseId, e.file])).toEqual([["post", "toolu_9", "/repo/a.ts"]]);
	});

	test("a request without the session token is refused and ignored", async () => {
		const { events, url } = start();
		const res = await post(url, { hook_event_name: "PostToolUse", tool_name: "Write" }, "wrong");
		expect(res.status).toBe(401);
		expect(events).toEqual([]);
	});
});

describe("AC7 the hooks go in through --settings", () => {
	test("http PreToolUse and PostToolUse on the edit tools and Bash, token read from the env, not written in", () => {
		const settings = hookSettings("http://127.0.0.1:4321/hook");
		const text = JSON.stringify(settings);
		expect(Object.keys(settings.hooks)).toEqual(["PreToolUse", "PostToolUse", "PostToolUseFailure"]);
		for (const event of ["PreToolUse", "PostToolUse", "PostToolUseFailure"] as const) {
			const group = settings.hooks[event][0];
			expect(group?.matcher).toBe("Edit|Write|MultiEdit|NotebookEdit|Bash");
			expect(group?.hooks[0]).toEqual({
				type: "http",
				url: "http://127.0.0.1:4321/hook",
				headers: { Authorization: `Bearer $${HOOK_TOKEN_ENV}` },
				allowedEnvVars: [HOOK_TOKEN_ENV],
				timeout: 5,
			});
		}
		expect(text).not.toContain("disableAllHooks");
	});
});
