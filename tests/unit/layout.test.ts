import { describe, expect, test } from "bun:test";
import {
	claudeEdited,
	cycleFocus,
	dismissPending,
	focusPane,
	initialWorkspace,
	openByUser,
	paneSizes,
	toggleFollow,
	toggleWorkspace,
	workspaceVisible,
} from "../../src/ui/layout.ts";

describe("AC1 conversation mode until the first edit", () => {
	test("starts with only claude, focused; the first claude edit shows explorer and editor on that file", () => {
		let s = initialWorkspace();
		expect(workspaceVisible(s)).toBe(false);
		expect(s.focus).toBe("claude");
		s = claudeEdited(s, "src/a.ts");
		expect(workspaceVisible(s)).toBe(true);
		expect(s.open).toBe("src/a.ts");
		expect(s.focus).toBe("claude");
	});

	test("explorer on the left about a fifth of the width, claude at the bottom 38% of the work area", () => {
		expect(paneSizes(160, 44)).toEqual({ explorerWidth: 35, claudeHeight: 16 });
		expect(paneSizes(100, 30)).toEqual({ explorerWidth: 24, claudeHeight: 11 });
	});
});

describe("AC4 opening another file pauses follow; f resumes on the last edit", () => {
	test("opening a file other than the last edit pauses, f resumes and jumps back", () => {
		let s = claudeEdited(initialWorkspace(), "src/a.ts");
		s = openByUser(s, "README.md", "src/a.ts");
		expect(s).toMatchObject({ open: "README.md", follow: "paused" });
		s = toggleFollow(s, "src/a.ts");
		expect(s).toMatchObject({ open: "src/a.ts", follow: "following" });
	});

	test("opening the file claude is on keeps following", () => {
		const s = openByUser(claudeEdited(initialWorkspace(), "src/a.ts"), "src/a.ts", "src/a.ts");
		expect(s.follow).toBe("following");
	});

	test("f while following pauses", () => {
		expect(toggleFollow(claudeEdited(initialWorkspace(), "a"), "a").follow).toBe("paused");
	});

	test("tabs keep the last four files opened", () => {
		let s = initialWorkspace();
		for (const f of ["a", "b", "c", "d", "e"]) s = claudeEdited(s, f);
		expect(s.tabs).toEqual(["b", "c", "d", "e"]);
	});
});

describe("AC5 paused, a claude edit raises 'o claude editou X'", () => {
	test("the edit does not move the editor; abrir opens it, ignorar drops the notice", () => {
		let s = openByUser(claudeEdited(initialWorkspace(), "a"), "b", "a");
		s = claudeEdited(s, "c");
		expect(s).toMatchObject({ open: "b", pending: "c", follow: "paused" });
		const opened = openByUser(s, "c", "c");
		expect(opened).toMatchObject({ open: "c", pending: null });
		const ignored = dismissPending(s);
		expect(ignored).toMatchObject({ open: "b", pending: null, follow: "paused" });
	});

	test("an edit to the file already open raises no notice", () => {
		const s = claudeEdited(openByUser(claudeEdited(initialWorkspace(), "a"), "b", "a"), "b");
		expect(s.pending).toBeNull();
	});
});

describe("AC6 ctrl+e hides and shows explorer and editor; the manual choice wins", () => {
	test("ctrl+e before any edit opens the workspace; after, it hides it and edits do not reopen it", () => {
		let s = toggleWorkspace(initialWorkspace());
		expect(workspaceVisible(s)).toBe(true);
		s = toggleWorkspace(claudeEdited(s, "a"));
		expect(workspaceVisible(s)).toBe(false);
		s = claudeEdited(s, "b");
		expect(workspaceVisible(s)).toBe(false);
		expect(workspaceVisible(toggleWorkspace(s))).toBe(true);
	});

	test("hiding the workspace gives the focus back to claude", () => {
		let s = focusPane(claudeEdited(initialWorkspace(), "a"), "editor");
		expect(s.focus).toBe("editor");
		s = toggleWorkspace(s);
		expect(s.focus).toBe("claude");
		expect(focusPane(s, "explorer").focus).toBe("claude");
	});
});

describe("foco-pelo-teclado AC1 / AC3 ctrl+o cycles the focus claude → explorer → editor → claude", () => {
	test("with the workspace shown each ctrl+o moves to the next pane, then back to claude", () => {
		let s = toggleWorkspace(initialWorkspace());
		expect(s.focus).toBe("claude");
		s = cycleFocus(s);
		expect(s.focus).toBe("explorer");
		s = cycleFocus(s);
		expect(s.focus).toBe("editor");
		s = cycleFocus(s);
		expect(s.focus).toBe("claude");
	});

	test("in conversation mode ctrl+o changes nothing", () => {
		const s = initialWorkspace();
		expect(cycleFocus(s)).toEqual(s);
		const hidden = toggleWorkspace(claudeEdited(s, "a"));
		expect(cycleFocus(hidden)).toEqual(hidden);
	});
});
