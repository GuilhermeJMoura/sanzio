import { afterEach, describe, expect, test } from "bun:test";
import { pathToFiletype } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import type { EditorModel } from "$types/workspace.ts";
import { diffLines } from "../src/observe/diff.ts";
import { createEditor } from "../src/ui/editor.ts";
import { theme } from "../src/ui/theme.ts";

let setup: TestRendererSetup | undefined;
afterEach(() => setup?.renderer.destroy());

const noop = () => {};
const PATH = "app/main.py";
const SOURCE = ["def greet():", '    return "hello"', "# a comment"].join("\n");

const model = (editing: boolean): EditorModel => {
	const lines = SOURCE.split("\n");
	return {
		path: PATH,
		rows: [],
		ops: diffLines(lines, lines),
		justLines: [],
		viewer: "marked",
		edit: { active: editing, dirty: false, conflict: null, prompt: null, readOnly: false, error: null },
		follow: "paused",
		tabs: [PATH],
		claudeTouched: [],
		pending: null,
		focused: true,
	};
};

const hex = ({ r, g, b }: { r: number; g: number; b: number }) =>
	`#${[r, g, b]
		.map((v) =>
			Math.round(v * 255)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;

/** Hex fg of the cell under the first character of the first `token` on screen. */
function color(token: string): string {
	const frame = setup?.captureSpans();
	for (const line of frame?.lines ?? []) {
		const text = line.spans.map((s) => s.text).join("");
		const at = text.indexOf(token);
		if (at < 0) continue;
		let col = [...text.slice(0, at)].length + 1;
		for (const span of line.spans) {
			if (col < span.width) return hex(span.fg);
			col -= span.width;
		}
	}
	throw new Error(`${token} not on screen:\n${setup?.captureCharFrame()}`);
}

const tokens = () => ({ keyword: color("def"), string: color('"hello"'), comment: color("a comment") });
const expected = () => ({ keyword: theme.syntax.keyword, string: theme.syntax.string, comment: theme.syntax.comment });

describe("Python files get the theme's syntax colors", () => {
	test("a .py path is the python filetype", () => {
		expect(pathToFiletype("x.py")).toBe("python");
	});

	test("def, a string and a comment are colored in the viewer and after i", async () => {
		setup = await createTestRenderer({ width: 80, height: 20 });
		const s = setup;
		const editor = createEditor(s.renderer, { onFocus: noop, onOpenPending: noop, onDismiss: noop, onTab: noop });
		s.renderer.root.add(editor.box);
		const settle = async () => {
			for (let i = 0; i < 20; i++) {
				await s.renderOnce();
				await Bun.sleep(25);
			}
		};

		editor.update(model(false));
		await settle();
		expect(tokens()).toEqual(expected());

		editor.surface.load(SOURCE, 1);
		editor.update(model(true));
		await settle();
		expect(tokens()).toEqual(expected());
	});
});
