import type { DiffOp, DiffRow, DiffStats, PatchHunk } from "$types/observe.ts";

const CONTEXT = 3;
// above this many cells the LCS table costs too much: show the middle as removed then added
const MAX_LCS_CELLS = 4_000_000;

export function splitLines(text: string | null): string[] {
	if (!text) return [];
	const lines = text.split("\n");
	if (lines.at(-1) === "") lines.pop();
	return lines;
}

function lcsOps(a: string[], b: string[], oldBase: number, newBase: number): DiffOp[] {
	const n = a.length;
	const m = b.length;
	const ops: DiffOp[] = [];
	if (n * m > MAX_LCS_CELLS) {
		a.forEach((text, i) => {
			ops.push({ kind: "del", text, oldNo: oldBase + i, newNo: null });
		});
		b.forEach((text, j) => {
			ops.push({ kind: "add", text, oldNo: null, newNo: newBase + j });
		});
		return ops;
	}
	const width = m + 1;
	const table = new Uint32Array((n + 1) * width);
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			table[i * width + j] =
				a[i] === b[j]
					? (table[(i + 1) * width + j + 1] ?? 0) + 1
					: Math.max(table[(i + 1) * width + j] ?? 0, table[i * width + j + 1] ?? 0);
		}
	}
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			ops.push({
				kind: "eq",
				text: a[i] ?? "",
				oldNo: oldBase + i,
				newNo: newBase + j,
			});
			i++;
			j++;
		} else if ((table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0)) {
			ops.push({
				kind: "del",
				text: a[i] ?? "",
				oldNo: oldBase + i,
				newNo: null,
			});
			i++;
		} else {
			ops.push({
				kind: "add",
				text: b[j] ?? "",
				oldNo: null,
				newNo: newBase + j,
			});
			j++;
		}
	}
	for (; i < n; i++)
		ops.push({
			kind: "del",
			text: a[i] ?? "",
			oldNo: oldBase + i,
			newNo: null,
		});
	for (; j < m; j++)
		ops.push({
			kind: "add",
			text: b[j] ?? "",
			oldNo: null,
			newNo: newBase + j,
		});
	return ops;
}

/** Line diff of `before` → `after`; common head and tail are matched first so a small edit in a big file stays cheap. */
export function diffLines(before: string[], after: string[]): DiffOp[] {
	let head = 0;
	while (head < before.length && head < after.length && before[head] === after[head]) head++;
	let tail = 0;
	while (
		tail < before.length - head &&
		tail < after.length - head &&
		before[before.length - 1 - tail] === after[after.length - 1 - tail]
	) {
		tail++;
	}
	const ops: DiffOp[] = [];
	for (let k = 0; k < head; k++) ops.push({ kind: "eq", text: before[k] ?? "", oldNo: k + 1, newNo: k + 1 });
	ops.push(
		...lcsOps(before.slice(head, before.length - tail), after.slice(head, after.length - tail), head + 1, head + 1),
	);
	for (let k = tail; k > 0; k--) {
		const oldNo = before.length - k + 1;
		ops.push({
			kind: "eq",
			text: before[oldNo - 1] ?? "",
			oldNo,
			newNo: after.length - k + 1,
		});
	}
	return ops;
}

export function diffStats(ops: DiffOp[]): DiffStats {
	let added = 0;
	let removed = 0;
	for (const op of ops) {
		if (op.kind === "add") added++;
		else if (op.kind === "del") removed++;
	}
	return { added, removed };
}

/** Rows for the viewer: changes with 3 lines of context, unchanged runs folded into gaps; no changes shows the whole file. */
export function contextRows(ops: DiffOp[], context = CONTEXT): DiffRow[] {
	if (!ops.some((op) => op.kind !== "eq")) return ops;
	const keep = new Set<number>();
	ops.forEach((op, i) => {
		if (op.kind === "eq") return;
		for (let k = i - context; k <= i + context; k++) keep.add(k);
	});
	const rows: DiffRow[] = [];
	let skipped = 0;
	ops.forEach((op, i) => {
		if (!keep.has(i)) {
			skipped++;
			return;
		}
		if (skipped > 0) rows.push({ kind: "gap", skipped });
		skipped = 0;
		rows.push(op);
	});
	if (skipped > 0) rows.push({ kind: "gap", skipped });
	return rows;
}

/** New-file line numbers of the lines a structuredPatch adds. */
export function addedLines(hunks: PatchHunk[]): number[] {
	const lines: number[] = [];
	for (const hunk of hunks) {
		let newNo = hunk.newStart;
		for (const line of hunk.lines) {
			if (line.startsWith("+")) lines.push(newNo++);
			else if (!line.startsWith("-")) newNo++;
		}
	}
	return lines;
}
