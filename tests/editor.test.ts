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
	justLines,
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
