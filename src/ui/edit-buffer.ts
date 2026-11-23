import type { DocFormat, EditSnapshot } from "$types/edit.ts";

const MAX_STEPS = 2000;

/** File content as the editor shows it (LF, no final newline) and the format saving must restore. */
export function parseDoc(raw: string): { text: string; format: DocFormat } {
	const eol = raw.includes("\r\n") ? "\r\n" : "\n";
	let text = raw.replace(/\r\n/g, "\n");
	const finalNewline = text.endsWith("\n");
	if (finalNewline) text = text.slice(0, -1);
	return { text, format: { eol, finalNewline } };
}

/** The bytes to write: the editor text with the file's own line ending and final newline. */
export function serializeDoc(text: string, format: DocFormat): string {
	const body = format.finalNewline ? `${text}\n` : text;
	return format.eol === "\n" ? body : body.replace(/\n/g, format.eol);
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
