import type { ClaudeEdit, DiffRow, DiffStats, FileUpdate, LastEdit } from "$types/observe.ts";
import { contextRows, diffLines, diffStats, splitLines } from "./diff.ts";

export function formatAge(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	if (seconds < 3) return "agora";
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
	return `${Math.floor(seconds / 3600)}h`;
}

/** Files of this session: their content at session start, what changed since, and which of it claude did. */
export class SessionChanges {
	private readonly base = new Map<string, string | null>();
	private readonly current = new Map<string, string | null>();
	private readonly claude = new Map<string, ClaudeEdit>();
	lastEdit: LastEdit | null = null;

	hasBase(path: string): boolean {
		return this.base.has(path);
	}

	/** Content at session start; null when the file did not exist. Only the first call per path counts. */
	setBase(path: string, content: string | null): void {
		if (!this.base.has(path)) this.base.set(path, content);
	}

	contentOf(path: string): string | null {
		return this.current.has(path) ? (this.current.get(path) ?? null) : (this.base.get(path) ?? null);
	}

	/** Records a new content for `path`; false when nothing changed (e.g. the watcher seeing a hook's edit again). */
	apply(update: FileUpdate): boolean {
		const previous = this.contentOf(update.path);
		if (previous === update.content) return false;
		this.setBase(update.path, previous);
		this.current.set(update.path, update.content);
		const known = this.claude.get(update.path);
		if (!update.byClaude) {
			if (known) known.stats = this.statsOf(update.path);
			return true;
		}

		const justLines =
			update.justLines ??
			diffLines(splitLines(previous), splitLines(update.content))
				.filter((op) => op.kind === "add")
				.map((op) => op.newNo ?? 0);
		this.claude.set(update.path, {
			path: update.path,
			tool: update.tool,
			at: update.at,
			isNew: this.base.get(update.path) === null,
			stats: this.statsOf(update.path),
		});
		this.lastEdit = {
			path: update.path,
			tool: update.tool,
			at: update.at,
			justLines,
		};
		return true;
	}

	private statsOf(path: string): DiffStats {
		return diffStats(diffLines(splitLines(this.base.get(path) ?? null), splitLines(this.contentOf(path))));
	}

	/** Files claude edited this session, the most recent first. */
	claudeEdits(): ClaudeEdit[] {
		return [...this.claude.values()].sort((a, b) => b.at - a.at);
	}

	isClaudeEdited(path: string): boolean {
		return this.claude.has(path);
	}

	totals(): DiffStats & { files: number } {
		let added = 0;
		let removed = 0;
		for (const edit of this.claude.values()) {
			added += edit.stats.added;
			removed += edit.stats.removed;
		}
		return { added, removed, files: this.claude.size };
	}

	viewerRows(path: string): DiffRow[] {
		return contextRows(diffLines(splitLines(this.base.get(path) ?? null), splitLines(this.contentOf(path))));
	}
}
