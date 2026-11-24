import type { EditSnapshot, Eol, ParsedDoc } from "$types/edit.ts";
import { diffLines } from "../observe/diff.ts";

const MAX_STEPS = 2000;

/** File content as the editor shows it (LF, no final newline) and each line's ending, for saving it back. */
export function parseDoc(raw: string): ParsedDoc {
	const pieces = raw.split("\n");
	const finalNewline = pieces.length > 1 && pieces.at(-1) === "";
	if (finalNewline) pieces.pop();
	const lineEols: Eol[] = [];
	let crlf = 0;
	const lines = pieces.map((piece, i) => {
		const terminated = i < pieces.length - 1 || finalNewline;
		const isCrlf = terminated && piece.endsWith("\r");
		if (isCrlf) crlf++;
		lineEols.push(isCrlf ? "\r\n" : "\n");
		return isCrlf ? piece.slice(0, -1) : piece;
	});
	const terminated = pieces.length - (finalNewline ? 0 : 1);
	const eol: Eol = crlf * 2 > terminated ? "\r\n" : "\n";
	// the unterminated last line has no ending of its own: lines added after it use the majority
	if (!finalNewline && lineEols.length > 0) lineEols[lineEols.length - 1] = eol;
	return { text: lines.join("\n"), format: { eol, lineEols, finalNewline } };
}

/**
 * The bytes to write for the editor text: unchanged lines keep their own ending, a changed line takes the ending of
 * the line it replaced, an added line the ending of the old line before it (the majority when there is none).
 */
export function serializeDoc(text: string, base: ParsedDoc): string {
	const { format } = base;
	const lines = text.split("\n");
	const oldLines = base.text.split("\n");
	const eolOf = (oldNo: number | null) => (oldNo === null ? format.eol : (format.lineEols[oldNo - 1] ?? format.eol));
	const eols: Eol[] = [];
	if (format.lineEols.every((e) => e === format.eol)) {
		for (let i = 0; i < lines.length; i++) eols.push(format.eol);
	} else {
		let replaced: Eol[] = [];
		let previous: Eol | null = null;
		for (const op of diffLines(oldLines, lines)) {
			if (op.kind === "eq") {
				replaced = [];
				previous = eolOf(op.oldNo);
				eols.push(previous);
			} else if (op.kind === "del") {
				previous = eolOf(op.oldNo);
				replaced.push(previous);
			} else {
				eols.push(replaced.shift() ?? previous ?? eolOf(1));
			}
		}
	}
	return lines
		.map((line, i) => (i < lines.length - 1 || format.finalNewline ? line + (eols[i] ?? format.eol) : line))
		.join("");
}

/** Undo / redo, one step per change, back to the text the file opened with and no further. */
export class EditHistory {
	private states: EditSnapshot[];
	private index = 0;

	constructor(initial: EditSnapshot) {
		this.states = [initial];
	}

	get current(): EditSnapshot {
		return this.states[this.index] ?? { text: "", cursor: 0 };
	}

	/** A new state after a change; a cursor move alone only updates where the step puts the cursor back. */
	record(next: EditSnapshot): void {
		if (next.text === this.current.text) {
			this.states[this.index] = next;
			return;
		}
		this.states = [...this.states.slice(0, this.index + 1), next].slice(-MAX_STEPS);
		this.index = this.states.length - 1;
	}

	undo(): EditSnapshot | null {
		if (this.index === 0) return null;
		this.index--;
		return this.current;
	}

	redo(): EditSnapshot | null {
		if (this.index >= this.states.length - 1) return null;
		this.index++;
		return this.current;
	}
}
