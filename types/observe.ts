export type DiffKind = "eq" | "add" | "del";

export interface DiffOp {
	kind: DiffKind;
	text: string;
	/** 1-based line in the old text; null for added lines */
	oldNo: number | null;
	/** 1-based line in the new text; null for removed lines */
	newNo: number | null;
}

/** A row of the diff viewer: a diff line, or a gap standing for `skipped` unchanged lines. */
export type DiffRow = DiffOp | { kind: "gap"; skipped: number };

export interface DiffStats {
	added: number;
	removed: number;
}

/** One hunk of Claude Code's `tool_response.structuredPatch`. */
export interface PatchHunk {
	oldStart: number;
	oldLines: number;
	newStart: number;
	newLines: number;
	lines: string[];
}

export type HookPhase = "pre" | "post";

/** What phdterm keeps from a PreToolUse / PostToolUse hook payload. */
export interface HookEvent {
	phase: HookPhase;
	tool: string;
	/** pairs a PreToolUse with its PostToolUse / PostToolUseFailure */
	toolUseId: string | null;
	/** absolute path of the file the tool works on, when it has one */
	file: string | null;
	patch: PatchHunk[] | null;
	/** absolute paths a Bash call changed (`tool_response.bashEditDiff.changedFiles`) */
	changedFiles: string[];
}

export interface HookServerOptions {
	token: string;
	onEvent: (event: HookEvent) => void | Promise<void>;
}

export interface HookServer {
	url: string;
	stop: () => void;
}

export type GitMark = "M" | "U";

export interface RepoInfo {
	/** folder phdterm watches: the git root, or the current folder outside a repo */
	root: string;
	isGit: boolean;
}

export interface WatchTreeOptions extends RepoInfo {
	/** paths relative to `root` that changed, already filtered from .git, node_modules and gitignored files */
	onChange: (paths: string[]) => void;
}

export interface FileUpdate {
	/** path relative to the repo root */
	path: string;
	/** new content; null when the file is gone */
	content: string | null;
	byClaude: boolean;
	/** the user saved it from phdterm's editor (ctrl+s) */
	byYou?: boolean;
	tool: string;
	/** new-file lines this edit added, when the hook said so (structuredPatch) */
	justLines?: number[];
	at: number;
}

export interface ClaudeEdit {
	path: string;
	tool: string;
	at: number;
	isNew: boolean;
	stats: DiffStats;
}

export interface LastEdit {
	path: string;
	tool: string;
	at: number;
	justLines: number[];
}

export interface HttpHookHandler {
	type: "http";
	url: string;
	headers: Record<string, string>;
	allowedEnvVars: string[];
	timeout: number;
}

export interface HookMatcherGroup {
	matcher: string;
	hooks: HttpHookHandler[];
}

/** The slice of Claude Code settings phdterm passes with `--settings`. */
export interface HookSettings {
	hooks: Record<"PreToolUse" | "PostToolUse" | "PostToolUseFailure", HookMatcherGroup[]>;
}

export interface ToolCall {
	file: string | null;
	at: number;
}
