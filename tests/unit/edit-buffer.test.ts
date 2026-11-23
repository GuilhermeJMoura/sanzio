import { describe, expect, test } from "bun:test";
import { EditHistory, parseDoc, serializeDoc } from "../../src/ui/edit-buffer.ts";

describe("AC2 saving writes exactly the editor text, in the file's own format", () => {
	test.each([
		["LF with a final newline", "a\nb\n", "a\nb"],
		["LF without a final newline", "a\nb", "a\nb"],
		["CRLF with a final newline", "a\r\nb\r\n", "a\nb"],
		["CRLF without a final newline", "a\r\nb", "a\nb"],
		["empty file", "", ""],
		["a lone newline", "\n", ""],
	])("%s round-trips and keeps its line ending", (_, raw, shown) => {
		const doc = parseDoc(raw);
		expect(doc.text).toBe(shown);
		expect(serializeDoc(doc.text, doc.format)).toBe(raw);
	});

	test("an edited CRLF file is written back with CRLF on every line, new lines included", () => {
		const { format } = parseDoc("a\r\nb\r\n");
		expect(serializeDoc("a\nX\nb", format)).toBe("a\r\nX\r\nb\r\n");
	});
});

describe("AC3 undo / redo step by step down to the opened text", () => {
	test("each change is a step; undo stops at the opened text; redo replays; a new change drops the redo", () => {
		const h = new EditHistory({ text: "alpha", cursor: 0 });
		h.record({ text: "aalpha", cursor: 1 });
		h.record({ text: "abalpha", cursor: 2 });
		expect(h.undo()).toEqual({ text: "aalpha", cursor: 1 });
		expect(h.undo()).toEqual({ text: "alpha", cursor: 0 });
		expect(h.undo()).toBeNull();
		expect(h.redo()).toEqual({ text: "aalpha", cursor: 1 });
		h.record({ text: "aXalpha", cursor: 2 });
		expect(h.redo()).toBeNull();
		expect(h.undo()?.text).toBe("aalpha");
	});

	test("a cursor move alone is not a step, it only moves where undo puts the cursor", () => {
		const h = new EditHistory({ text: "abc", cursor: 0 });
		h.record({ text: "abc", cursor: 2 });
		expect(h.undo()).toBeNull();
		h.record({ text: "abXc", cursor: 3 });
		expect(h.undo()).toEqual({ text: "abc", cursor: 2 });
	});
});
