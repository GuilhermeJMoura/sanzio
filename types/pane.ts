import type { HookSettings } from "./observe.ts";

export interface ClaudeLaunch {
	command: string;
	args: string[];
	cwd: string;
	env: Record<string, string | undefined>;
}

/** What sanzio passes to claude with --settings: its hooks and the plugin theme to use. */
export interface ClaudeSettings extends HookSettings {
	theme: string;
}
