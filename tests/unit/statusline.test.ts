import { describe, expect, test } from "bun:test";
import type { StatusModel } from "$types/workspace.ts";
import { statusParts } from "../../src/ui/statusline.ts";

const base: StatusModel = {
	follow: "following",
	branch: "feat/sessions",
	busy: true,
	current: "src/x.ts",
	added: 12,
	removed: 3,
	files: 4,
	workspaceVisible: true,
	manual: null,
	editing: false,
	dirty: false,
};
const text = (model: StatusModel) => {
	const { left, right } = statusParts(model);
	return `${left.map((s) => s.text).join("")} | ${right.map((s) => s.text).join("")}`;
};

describe("AC8 status line", () => {
	test("SEGUINDO, branch, what claude does, +/− · files and the shortcuts", () => {
		expect(text(base)).toBe(
			" SEGUINDO  ⎇ feat/sessions  claude em src/x.ts  | +12 −3 · 4 arq  ctrl+e editor · f seguir ",
		);
		const mode = statusParts(base).left[0];
		expect(mode).toMatchObject({ bg: "#bd93f9", fg: "#282a36", bold: true });
	});

	test("PAUSADO on gray; claude thinking or idle", () => {
		expect(text({ ...base, follow: "paused", current: null })).toStartWith(
			" PAUSADO  ⎇ feat/sessions  claude pensando… ",
		);
		expect(statusParts({ ...base, follow: "paused" }).left[0]).toMatchObject({ bg: "#44475a", fg: "#f8f8f2" });
		expect(text({ ...base, busy: false })).toContain(" claude ocioso ");
	});

	test("outside git there is no branch", () => {
		expect(text({ ...base, branch: null })).not.toContain("⎇");
	});

	test("conversation mode explains when the editor opens; a manual hide says so", () => {
		expect(text({ ...base, workspaceVisible: false })).toContain(
			"modo conversa · editor abre na 1ª edição · ctrl+e editor · f seguir",
		);
		expect(text({ ...base, workspaceVisible: false, manual: false })).toContain("editor escondido · ctrl+e");
	});
});

describe("AC1 editing: EDITANDO on the status line, with its keys", () => {
	test("EDITANDO before the follow mode, ● when unsaved, ctrl+s and esc hints", () => {
		expect(text({ ...base, follow: "paused", editing: true })).toStartWith(" EDITANDO  PAUSADO ");
		expect(text({ ...base, follow: "paused", editing: true, dirty: true })).toStartWith(" EDITANDO ●  PAUSADO ");
		expect(text({ ...base, editing: true })).toContain("| ctrl+s salvar · esc sair · +12");
	});
});
