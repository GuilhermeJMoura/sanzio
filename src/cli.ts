#!/usr/bin/env bun
import { runClaudePane } from "./claude-pane.ts";

const command = Bun.which("claude");
if (!command) {
	process.stderr.write("phdterm: claude was not found in PATH. Install Claude Code and try again.\n");
	process.exit(127);
}

const code = await runClaudePane({
	command,
	args: process.argv.slice(2),
	cwd: process.cwd(),
	env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
});
process.exit(code);
