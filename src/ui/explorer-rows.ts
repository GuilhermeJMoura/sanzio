import type { ClaudeEdit, GitMark } from "$types/observe.ts";
import type { ChangedRow, TreeNode, TreeRow } from "$types/workspace.ts";
import { formatAge } from "../observe/session-changes.ts";

export function ancestors(path: string): string[] {
	const parts = path.split("/");
	return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
}

export function changedRows(edits: ClaudeEdit[], now: number): ChangedRow[] {
	return edits.map((e) => {
		const slash = e.path.lastIndexOf("/");
		return {
			path: e.path,
			name: e.path.slice(slash + 1),
			dir: slash < 0 ? "" : e.path.slice(0, slash),
			isNew: e.isNew,
			added: e.stats.added,
			removed: e.stats.removed,
			age: formatAge(now - e.at),
		};
	});
}

function buildTree(files: string[]): TreeNode {
	const root: TreeNode = { dirs: new Map(), files: [] };
	for (const file of files) {
		const parts = file.split("/");
		let node = root;
		for (const part of parts.slice(0, -1)) {
			let next = node.dirs.get(part);
			if (!next) {
				next = { dirs: new Map(), files: [] };
				node.dirs.set(part, next);
			}
			node = next;
		}
		node.files.push(file);
	}
	return root;
}

/** Visible rows of the repo tree: folders first, children only under expanded folders. */
export function treeRows(input: {
	files: string[];
	expanded: Set<string>;
	marks: Map<string, GitMark>;
	claude: Set<string>;
	live: string | null;
}): TreeRow[] {
	const rows: TreeRow[] = [];
	const claudeDirs = new Set([...input.claude].flatMap(ancestors));
	const visit = (node: TreeNode, prefix: string, depth: number) => {
		for (const name of [...node.dirs.keys()].sort((a, b) => a.localeCompare(b))) {
			const path = prefix ? `${prefix}/${name}` : name;
			const expanded = input.expanded.has(path);
			rows.push({ kind: "dir", path, name, depth, expanded, dirty: claudeDirs.has(path) });
			const child = node.dirs.get(name);
			if (expanded && child) visit(child, path, depth + 1);
		}
		for (const path of [...node.files].sort((a, b) => a.localeCompare(b))) {
			const name = path.slice(path.lastIndexOf("/") + 1);
			rows.push({ kind: "file", path, name, depth, mark: input.marks.get(path) ?? null, live: path === input.live });
		}
	};
	visit(buildTree(input.files), "", 0);
	return rows;
}
