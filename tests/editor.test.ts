import { afterEach, describe, expect, test } from "bun:test";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import type { EditorModel } from "$types/workspace.ts";
import { contextRows, diffLines } from "../src/observe/diff.ts";
import { createEditor } from "../src/ui/editor.ts";

let setup: TestRendererSetup | undefined;
afterEach(() => setup?.renderer.destroy());

const noop = () => {};
async function show(model: EditorModel) {
	setup = await createTestRenderer({ width: 80, height: 20 });
	const editor = createEditor(setup.renderer, { onFocus: noop, onOpenPending: noop, onDismiss: noop, onTab: noop });
	setup.renderer.root.add(editor.box);
	editor.update(model);
	// give tree-sitter time to highlight: what shows after that is what the user keeps seeing
	for (let i = 0; i < 20; i++) {
		await setup.renderOnce();
		await Bun.sleep(25);
	}
	return setup.captureCharFrame();
}

const model = (path: string, before: string[], after: string[], justLines: number[]): EditorModel => ({
	path,
	rows: contextRows(diffLines(before, after)),
	ops: diffLines(before, after),
	justLines,
	viewer: "diff",
	edit: { active: false, dirty: false, conflict: null, prompt: null, readOnly: false },
	follow: "following",
	tabs: [path],
	claudeTouched: [path],
	pending: null,
	focused: false,
});

describe("the editor shows the raw source, never concealed markup", () => {
	test("a markdown heading change keeps its # markers on both sides", async () => {
		const frame = await show(model("README.md", ["# QA repo", "text"], ["## QA repo", "text"], [1]));
		expect(frame).toContain("− # QA repo");
		expect(frame).toContain("+ ## QA repo");
	});
});

describe("following an edit scrolls to the latest edit's first changed line", () => {
	test("claude editing line 250 again brings it back on screen after the user scrolled up to older hunks", async () => {
		const before = Array.from({ length: 300 }, (_, i) => `const line${i + 1} = ${i + 1};`);
		const older = [...before];
		for (const n of [5, 50, 100, 150, 200]) older[n - 1] = `const line${n} = 'older';`;
		const first = [...older];
		first[249] = "const line250 = 'first try';";
		const second = [...older];
		second[249] = "const line250 = 'second try';";

		setup = await createTestRenderer({ width: 80, height: 20 });
		const editor = createEditor(setup.renderer, { onFocus: noop, onOpenPending: noop, onDismiss: noop, onTab: noop });
		setup.renderer.root.add(editor.box);
		const settle = async () => {
			for (let i = 0; i < 10; i++) {
				await setup?.renderOnce();
				await Bun.sleep(25);
			}
		};
		editor.update(model("src/big.ts", before, first, [250]));
		await settle();
		expect(setup.captureCharFrame()).toContain("'first try';  ◂ claude");
		editor.scroll(-1000);
		await settle();
		expect(setup.captureCharFrame()).not.toContain("line250");

		editor.update(model("src/big.ts", before, second, [250]));
		await settle();
		expect(setup.captureCharFrame()).toMatch(/250 \+ const line250 = 'second try';\s+◂ claude/);
	});
});
