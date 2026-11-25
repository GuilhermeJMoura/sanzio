import { afterEach, describe, expect, test } from "bun:test";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import type { EditorModel } from "$types/workspace.ts";
import { diffLines } from "../src/observe/diff.ts";
import { createEditor } from "../src/ui/editor.ts";
import { theme, useTheme } from "../src/ui/theme.ts";

let setup: TestRendererSetup | undefined;
afterEach(() => {
	setup?.renderer.destroy();
	useTheme("verniz");
});

const noop = () => {};
const SOURCE = ['const greeting = "hello";', "// a comment", "export const n = 42;"].join("\n");

const model = (path: string, text: string, editing: boolean): EditorModel => {
	const lines = text.split("\n");
	return {
		path,
		rows: [],
		ops: diffLines(lines, lines),
		justLines: [],
		viewer: "marked",
		edit: {
			active: editing,
			dirty: false,
			conflict: null,
			prompt: null,
			readOnly: false,
			error: null,
		},
		follow: "paused",
		tabs: [path],
		claudeTouched: [],
		pending: null,
		focused: true,
	};
};

async function open(path: string, text: string, size = { width: 80, height: 20 }) {
	setup = await createTestRenderer(size);
	const s = setup;
	const editor = createEditor(s.renderer, {
		onFocus: noop,
		onOpenPending: noop,
		onDismiss: noop,
		onTab: noop,
	});
	s.renderer.root.add(editor.box);
	const settle = async (ms = 500) => {
		for (let i = 0; i < ms / 25; i++) {
			await s.renderOnce();
			await Bun.sleep(25);
		}
	};
	return {
		editor,
		settle,
		view: async () => {
			editor.update(model(path, text, false));
			await settle();
		},
		/** what `i` does: the controller loads the text, then the editor renders in edit mode */
		edit: async (line = 1) => {
			editor.surface.load(text, line);
			editor.update(model(path, text, true));
			await settle();
		},
	};
}

/** Hex fg of the cell under the `nth` character of the first `token` on screen. */
function color(token: string, nth = 1): string {
	const frame = setup?.captureSpans();
	if (!frame) throw new Error("no frame");
	for (const line of frame.lines) {
		const text = line.spans.map((s) => s.text).join("");
		const at = text.indexOf(token);
		if (at < 0) continue;
		let col = [...text.slice(0, at)].length + nth;
		for (const span of line.spans) {
			if (col < span.width) {
				const { r, g, b } = span.fg;
				return `#${[r, g, b]
					.map((v) =>
						Math.round(v * 255)
							.toString(16)
							.padStart(2, "0"),
					)
					.join("")}`;
			}
			col -= span.width;
		}
	}
	throw new Error(`${token} not on screen:\n${setup?.captureCharFrame()}`);
}

const tokens = () => ({
	keyword: color("const"),
	string: color('"hello"'),
	comment: color("a comment"),
});

describe("AC1 i keeps the viewer's syntax colors", () => {
	test("const, a string and a comment have the same colors before and after i", async () => {
		const e = await open("src/a.ts", SOURCE);
		await e.view();
		const viewer = tokens();
		expect(viewer).toEqual({
			keyword: theme.syntax.keyword,
			string: theme.syntax.string,
			comment: theme.syntax.comment,
		});
		await e.edit();
		expect(tokens()).toEqual(viewer);
	});
});
