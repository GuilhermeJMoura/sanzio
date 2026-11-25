import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import type { EditorModel } from "$types/workspace.ts";
import { createEditController } from "../src/edit-controller.ts";
import { diffLines } from "../src/observe/diff.ts";
import { SessionChanges } from "../src/observe/session-changes.ts";
import { createEditor } from "../src/ui/editor.ts";
import { PERGAMINHO, theme, useTheme } from "../src/ui/theme.ts";
import { tempDir } from "./helpers/pty.ts";

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

/** Renders until `ok` holds; the time it took, in ms. */
async function until(ok: () => boolean, label: string, timeoutMs = 2000): Promise<number> {
	const start = performance.now();
	for (;;) {
		await setup?.renderOnce();
		if (ok()) return performance.now() - start;
		if (performance.now() - start > timeoutMs) throw new Error(`timed out: ${label}\n${setup?.captureCharFrame()}`);
		await Bun.sleep(5);
	}
}

const tryColor = (token: string, nth = 1) => {
	try {
		return color(token, nth);
	} catch {
		return null;
	}
};

describe("AC2 typing updates the colors in about 200 ms", () => {
	test('foo turned into "foo" becomes a string; // turns the line into a comment', async () => {
		const e = await open("src/a.ts", "const x = foo;\nlet y = 1;");
		await e.edit();
		const area = e.editor.surface.area;
		area.focus();
		expect(color("foo")).toBe(theme.fg);

		area.cursorOffset = 10;
		setup?.mockInput.pressKey('"');
		area.cursorOffset = 14;
		setup?.mockInput.pressKey('"');
		const quoted = await until(() => tryColor('"foo"', 2) === theme.syntax.string, "foo as a string");
		expect(quoted).toBeLessThan(250);

		area.cursorOffset = 17;
		await setup?.mockInput.typeText("// ");
		const commented = await until(() => tryColor("// let", 4) === theme.syntax.comment, "let in a comment");
		expect(commented).toBeLessThan(250);
		expect(area.plainText).toBe('const x = "foo";\n// let y = 1;');
	});
});

describe("AC3 a file of no known language edits in fg, without error", () => {
	test("notes.txt: every cell is fg and nothing is logged", async () => {
		const warn = spyOn(console, "warn");
		const error = spyOn(console, "error");
		try {
			const e = await open("notes.txt", 'const x = "y"; // z');
			await e.edit();
			expect([color("const"), color('"y"'), color("// z")]).toEqual([theme.fg, theme.fg, theme.fg]);
			expect(warn).not.toHaveBeenCalled();
			expect(error).not.toHaveBeenCalled();
		} finally {
			warn.mockRestore();
			error.mockRestore();
		}
	});
});

describe("AC4 ctrl+s saves exactly the typed text; undo and redo keep the colors on their text", () => {
	test('"foo" saved as typed; ctrl+z back to foo in fg, ctrl+y back to a string', async () => {
		const root = tempDir("sanzio-colors-");
		mkdirSync(join(root, "src"));
		writeFileSync(join(root, "src/a.ts"), "const x = foo;\n");
		setup = await createTestRenderer({ width: 80, height: 20 });
		const s = setup;
		const path = "src/a.ts";
		const editor = createEditor(s.renderer, {
			onFocus: noop,
			onOpenPending: noop,
			onDismiss: noop,
			onTab: noop,
			onEditKey: (key) => controller.key(key),
			onEditChange: () => controller.changed(),
		});
		s.renderer.root.add(editor.box);
		const render = () => editor.update({ ...model(path, "", false), edit: controller.model(path) });
		const controller = createEditController({
			root,
			surface: editor.surface,
			changes: new SessionChanges(),
			now: () => 0,
			render,
			onStart: noop,
		});
		await controller.enter(path, 1);
		const area = editor.surface.area;
		area.focus();
		area.cursorOffset = 10;
		s.mockInput.pressKey('"');
		area.cursorOffset = 14;
		s.mockInput.pressKey('"');
		await until(() => tryColor('"foo"', 2) === theme.syntax.string, "typed string");

		s.mockInput.pressKey("s", { ctrl: true });
		await until(() => readFileSync(join(root, path), "utf8") !== "const x = foo;\n", "saved");
		expect(readFileSync(join(root, path), "utf8")).toBe('const x = "foo";\n');

		s.mockInput.pressKey("z", { ctrl: true });
		s.mockInput.pressKey("z", { ctrl: true });
		await until(() => area.plainText === "const x = foo;" && tryColor("foo") === theme.fg, "undone to fg");
		expect(color("const")).toBe(theme.syntax.keyword);

		s.mockInput.pressKey("y", { ctrl: true });
		s.mockInput.pressKey("y", { ctrl: true });
		await until(() => tryColor('"foo"', 2) === theme.syntax.string, "redone string");
		expect(area.plainText).toBe('const x = "foo";');
		expect(readFileSync(join(root, path), "utf8")).toBe('const x = "foo";\n');
	});
});

describe("AC5 pergaminho edits in pergaminho's colors", () => {
	test("the viewer and the edit area show the same pergaminho colors", async () => {
		useTheme("pergaminho");
		const e = await open("src/a.ts", SOURCE);
		await e.view();
		const viewer = tokens();
		expect(viewer).toEqual({
			keyword: PERGAMINHO.syntax.keyword,
			string: PERGAMINHO.syntax.string,
			comment: PERGAMINHO.syntax.comment,
		});
		await e.edit();
		expect(tokens()).toEqual(viewer);
	});
});

describe("AC6 a 3000-line file: keys never wait for the colors", () => {
	test("each key shows at once and the event loop never stalls while it highlights", async () => {
		const big = Array.from({ length: 3000 }, (_, i) => `const v${i} = "s${i}"; // line ${i}`).join("\n");
		const e = await open("src/big.ts", big);
		await e.edit();
		await until(() => tryColor("const v0") === theme.syntax.keyword, "big file colored", 5000);
		const area = e.editor.surface.area;
		area.focus();
		area.cursorOffset = 0;
		const typed = "let q = 'x'; ".repeat(4);
		const keys: number[] = [];
		const stalls: number[] = [];
		// long enough for highlight passes to land between the keys
		for (const ch of typed) {
			const start = performance.now();
			setup?.mockInput.pressKey(ch);
			await setup?.renderOnce();
			keys.push(performance.now() - start);
			const slept = performance.now();
			await Bun.sleep(30);
			stalls.push(performance.now() - slept - 30);
		}
		expect(area.plainText.startsWith(`${typed}const v0`)).toBe(true);
		expect(Math.max(...keys)).toBeLessThan(50);
		expect(Math.max(...stalls)).toBeLessThan(40);
		// 'x' sits where the old line had its =: the string color proves the typed text itself was highlighted
		await until(() => tryColor("'x'", 1) === theme.syntax.string, "typed text colored", 2000);
	});
});
