import { writeSync } from "node:fs";
import { constants } from "node:os";
import type { CliRenderer } from "@opentui/core";
import { BoxRenderable, createCliRenderer, EmbeddedTerminalRenderable } from "@opentui/core";
import type { ClaudeLaunch, ClaudeSettings } from "$types/pane.ts";
import { claudeThemeKey, PLUGIN_DIR } from "./claude-theme.ts";
import { loadTheme } from "./config.ts";
import { HOOK_TOKEN_ENV, hookSettings, startHookServer } from "./observe/hook-server.ts";
import { repoInfo } from "./observe/watcher.ts";
import { formatTitle, watchSession } from "./session-info.ts";
import { createSplash } from "./ui/splash.ts";
import { theme, useTheme } from "./ui/theme.ts";
import { createWorkspace } from "./workspace.ts";

// the status line takes the last row
const STATUS_ROWS = 1;
const RESUME_HEADER = "Resume this session with:";
const OUTPUT_TAIL_CHARS = 64 * 1024;
const EOF_GRACE_MS = 300;

/** The claude pane: a rounded box around the embedded terminal claude runs in. */
export function createClaudePane(renderer: CliRenderer): { box: BoxRenderable; terminal: EmbeddedTerminalRenderable } {
	const box = new BoxRenderable(renderer, {
		id: "claude-pane",
		width: "100%",
		height: "100%",
		borderStyle: "rounded",
		borderColor: theme.accent,
		titleColor: theme.accent,
		backgroundColor: theme.bg,
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
	// claude's default text (no color of its own) turns sepia on the light ground: OSC 10 sets the default foreground
	if (theme.name === "pergaminho")
		terminal.write(`\x1b]10;rgb:${theme.fg.slice(1, 3)}/${theme.fg.slice(3, 5)}/${theme.fg.slice(5, 7)}\x1b\\`);
	return { box, terminal };
}

/** Finds claude's exit hint in its raw output and returns it with `sanzio` as the program, or null. */
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
	return `${RESUME_HEADER}\n${command.replace(/(^|[\s;&|])claude(?=\s|$)/, "$1sanzio")}\n`;
}

function exitCodeOf(proc: Bun.Subprocess): number {
	const { exitCode, signalCode } = proc;
	if (exitCode !== null) return exitCode;
	if (typeof signalCode === "number") return 128 + signalCode;
	return signalCode ? 128 + constants.signals[signalCode] : 1;
}

/** Runs claude inside the sanzio workspace and resolves with claude's exit code once the terminal is restored. */
export async function runClaudePane(launch: ClaudeLaunch): Promise<number> {
	const startedAt = Date.now();
	const selection = loadTheme(launch.env);
	useTheme(selection.name);
	const renderer = await createCliRenderer({
		screenMode: "alternate-screen",
		exitOnCtrlC: false,
		useMouse: true,
		backgroundColor: theme.bg,
	});
	const pane = createClaudePane(renderer);
	const { box, terminal } = pane;
	const workspace = createWorkspace(renderer, repoInfo(launch.cwd), pane, selection.invalid);
	renderer.root.add(workspace.root);
	box.add(createSplash(renderer).node);
	terminal.focus();

	// claude's own settings stay untouched: sanzio's hooks and theme ride on --settings, merged over the user's;
	// the theme itself comes from sanzio's plugin, loaded for this run only with --plugin-dir
	const token = crypto.randomUUID();
	const hooks = startHookServer({ token, onEvent: (event) => workspace.hook(event) });
	void workspace.start();

	let tail = "";
	const decoder = new TextDecoder();
	let markEof: () => void = () => {};
	const eof = new Promise<void>((resolve) => {
		markEof = resolve;
	});

	const settings: ClaudeSettings = { ...hookSettings(hooks.url), theme: claudeThemeKey(theme.name) };
	const argv = [launch.command, "--settings", JSON.stringify(settings), "--plugin-dir", PLUGIN_DIR, ...launch.args];
	const proc = Bun.spawn(argv, {
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
