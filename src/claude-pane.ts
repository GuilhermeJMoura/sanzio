import { writeSync } from "node:fs";
import { constants } from "node:os";
import { BoxRenderable, type CliRenderer, createCliRenderer, EmbeddedTerminalRenderable } from "@opentui/core";
import type { ClaudeLaunch } from "$types/pane.ts";
import { HOOK_TOKEN_ENV, hookSettings, startHookServer } from "./observe/hook-server.ts";
import { repoInfo } from "./observe/watcher.ts";
import { formatTitle, watchSession } from "./session-info.ts";
import { DRACULA } from "./ui/theme.ts";
import { createWorkspace } from "./workspace.ts";

// the status line takes the last row
const STATUS_ROWS = 1;
const RESUME_HEADER = "Resume this session with:";
const OUTPUT_TAIL_CHARS = 64 * 1024;
const EOF_GRACE_MS = 300;

export function createClaudePane(renderer: CliRenderer): { box: BoxRenderable; terminal: EmbeddedTerminalRenderable } {
	const box = new BoxRenderable(renderer, {
		id: "claude-pane",
		width: "100%",
		height: "100%",
		borderStyle: "rounded",
		borderColor: DRACULA.accent,
		titleColor: DRACULA.accent,
		backgroundColor: DRACULA.bg,
		title: formatTitle({ model: null, effort: null, state: null }),
	});
	const terminal = new EmbeddedTerminalRenderable(renderer, {
		id: "claude-terminal",
		width: "100%",
		flexGrow: 1,
		flexShrink: 1,
		minHeight: 0,
		cols: Math.max(1, renderer.width - 2),
		rows: Math.max(1, renderer.height - 2 - STATUS_ROWS),
		transparentBackground: true,
	});
	box.add(terminal);
	return { box, terminal };
}

/** Finds claude's exit hint in its raw output and returns it with `phdterm` as the program, or null. */
export function rewriteResumeHint(output: string): string | null {
	const text = Bun.stripANSI(output).replace(/\r\n?/g, "\n");
	const at = text.lastIndexOf(RESUME_HEADER);
	if (at < 0) return null;
	const command = text
		.slice(at + RESUME_HEADER.length)
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.length > 0);
	if (!command || !/(^|[\s;&|])claude(?=\s|$)/.test(command)) return null;
	return `${RESUME_HEADER}\n${command.replace(/(^|[\s;&|])claude(?=\s|$)/, "$1phdterm")}\n`;
}

function exitCodeOf(proc: Bun.Subprocess): number {
	const { exitCode, signalCode } = proc;
	if (exitCode !== null) return exitCode;
	if (typeof signalCode === "number") return 128 + signalCode;
	return signalCode ? 128 + constants.signals[signalCode] : 1;
}

/** Runs claude inside the phdterm workspace and resolves with claude's exit code once the terminal is restored. */
export async function runClaudePane(launch: ClaudeLaunch): Promise<number> {
	const startedAt = Date.now();
	const renderer = await createCliRenderer({
		screenMode: "alternate-screen",
		exitOnCtrlC: false,
		useMouse: true,
		backgroundColor: DRACULA.bg,
	});
	const pane = createClaudePane(renderer);
	const { box, terminal } = pane;
	const workspace = createWorkspace(renderer, repoInfo(launch.cwd), pane);
	renderer.root.add(workspace.root);
	terminal.focus();

	// claude's own settings stay untouched: phdterm's hooks ride on --settings, merged over the user's
	const token = crypto.randomUUID();
	const hooks = startHookServer({ token, onEvent: (event) => workspace.hook(event) });
	void workspace.start();

	let tail = "";
	const decoder = new TextDecoder();
	let markEof: () => void = () => {};
	const eof = new Promise<void>((resolve) => {
		markEof = resolve;
	});

	const proc = Bun.spawn([launch.command, "--settings", JSON.stringify(hookSettings(hooks.url)), ...launch.args], {
		cwd: launch.cwd,
		env: { ...launch.env, [HOOK_TOKEN_ENV]: token },
		terminal: {
			cols: Math.max(1, renderer.width - 2),
			rows: Math.max(1, renderer.height - 2 - STATUS_ROWS),
			name: "xterm-256color",
			data: (_pty, data) => {
				terminal.write(data);
				tail = (tail + decoder.decode(data, { stream: true })).slice(-OUTPUT_TAIL_CHARS);
			},
			exit: () => markEof(),
		},
	});
	terminal.onData = (data) => {
		proc.terminal?.write(data);
	};
	terminal.onTerminalResize = (cols, rows) => proc.terminal?.resize(cols, rows);
	renderer.on("destroy", () => {
		if (proc.exitCode === null && proc.signalCode === null) proc.kill();
	});

	const stopWatching = watchSession({ cwd: launch.cwd, pid: proc.pid, since: startedAt, env: launch.env }, (info) => {
		box.title = formatTitle(info);
		workspace.setSessionState(info.state);
	});

	await proc.exited;
	await Promise.race([eof, Bun.sleep(EOF_GRACE_MS)]);
	await workspace.confirmExit();
	stopWatching();
	workspace.stop();
	hooks.stop();
	renderer.destroy();
	await renderer.closed;

	const hint = rewriteResumeHint(tail);
	// synchronous: the caller exits right after, which would drop a pending async write
	if (hint) writeSync(1, `\n${hint}`);
	return exitCodeOf(proc);
}
