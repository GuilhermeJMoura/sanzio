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
	invalidTheme: null,
	width: 120,
};
const text = (model: StatusModel) => {
	const { left, right } = statusParts(model);
	return `${left.map((s) => s.text).join("")} | ${right.map((s) => s.text).join("")}`;
};

describe("AC8 status line", () => {
	test("SEGUINDO, branch, what claude does, +/− · files and the shortcuts", () => {
		expect(text(base)).toBe(
			" Sanzio  SEGUINDO  ⎇ feat/sessions  claude em src/x.ts  | +12 −3 · 4 arq  ctrl+e editor · f seguir ",
		);
		const mode = statusParts(base).left.find((s) => s.text === " SEGUINDO ");
		expect(mode).toMatchObject({ bg: "#24407a", fg: "#fbf3dc", bold: true });
	});

	test("PAUSADO on gray; claude thinking or idle", () => {
		expect(text({ ...base, follow: "paused", current: null })).toStartWith(
			" Sanzio  PAUSADO  ⎇ feat/sessions  claude pensando… ",
		);
		const paused = statusParts({ ...base, follow: "paused" }).left.find((s) => s.text === " PAUSADO ");
		expect(paused).toMatchObject({ bg: "#3a3120", fg: "#ece1c6" });
		expect(text({ ...base, busy: false })).toContain(" claude ocioso ");
	});

	test("outside git there is no branch", () => {
		expect(text({ ...base, branch: null })).not.toContain("⎇");
	});

	test("conversation mode explains when the editor opens; a manual hide says so", () => {
		expect(text({ ...base, workspaceVisible: false, width: 200 })).toContain(
			"modo conversa · editor abre na 1ª edição · ctrl+e editor · f seguir",
		);
		expect(text({ ...base, workspaceVisible: false, manual: false, width: 200 })).toContain(
			"editor escondido · ctrl+e",
		);
	});
});

describe("AC1 editing: EDITANDO on the status line, with its keys", () => {
	test("EDITANDO before the follow mode, ● when unsaved, ctrl+s and esc hints", () => {
		expect(text({ ...base, follow: "paused", editing: true })).toStartWith(" Sanzio  EDITANDO  PAUSADO ");
		expect(text({ ...base, follow: "paused", editing: true, dirty: true })).toStartWith(
			" Sanzio  EDITANDO ●  PAUSADO ",
		);
		expect(text({ ...base, editing: true, width: 200 })).toContain("| ctrl+s salvar · esc sair · +12");
	});
});

describe("AC4 the fixed Sanzio mark on the left of the status line", () => {
	test("the name in the theme's gold, the initial S in vermilion, no icon", () => {
		const [pad, s, rest] = statusParts(base).left;
		expect(pad?.text).toBe(" ");
		expect(s).toMatchObject({ text: "S", fg: "#e8694c", bold: true });
		expect(rest).toMatchObject({ text: "anzio", fg: "#dcab4a", bold: true });
	});
});

describe("AC6 an invalid theme name: one vermilion warning segment", () => {
	test("full on wide screens, short on narrow ones, after the mark", () => {
		const wide = statusParts({ ...base, invalidTheme: "perganinho", width: 160 }).left;
		expect(wide[4]).toMatchObject({ text: ' ⚠ tema "perganinho" inválido, usando "verniz" ', bg: "#b3321f" });
		expect(text({ ...base, invalidTheme: "x", width: 60 })).toStartWith(" Sanzio  ⚠ tema inválido: verniz   SEGUINDO ");
		expect(text(base)).not.toContain("⚠");
	});
});

describe("AC6 the warning is never cut", () => {
	test("in conversation mode the hint gives way to the warning", () => {
		const conv = { ...base, workspaceVisible: false, invalidTheme: "perganinho", width: 160 };
		expect(text(conv)).toContain('⚠ tema "perganinho" inválido, usando "verniz"');
		expect(text(conv)).not.toContain("editor abre");
		expect(text({ ...conv, width: 200 })).toContain("modo conversa");
		expect(text({ ...conv, width: 90 })).toContain("⚠ tema inválido: verniz");
	});
});

describe("AC4 / AC6 a narrow status line drops the right side first; the mark, the mode and the warning stay whole", () => {
	const fitted = (model: StatusModel) => {
		const { left, right } = statusParts(model);
		const l = left.map((s) => s.text).join("");
		const r = right.map((s) => s.text).join("");
		return { l, r, total: [...l].length + [...r].length };
	};
	const models: [string, StatusModel][] = [
		["following", base],
		["editing", { ...base, editing: true, dirty: true, follow: "paused" }],
		["conversation", { ...base, workspaceVisible: false }],
		["invalid theme", { ...base, invalidTheme: "perganinho" }],
		["invalid theme in conversation", { ...base, workspaceVisible: false, invalidTheme: "perganinho" }],
	];
	for (const [name, model] of models) {
		test(`${name}: fits from 56 to 200 columns`, () => {
			for (let width = 56; width <= 200; width++) {
				const { l, r, total } = fitted({ ...model, width });
				expect({ width, total: Math.min(total, width) }).toEqual({ width, total });
				expect(l).toStartWith(" Sanzio ");
				expect(l).toContain(model.follow === "paused" ? " PAUSADO " : " SEGUINDO ");
				if (model.editing) expect(l).toContain(" EDITANDO ● ");
				if (model.invalidTheme) expect(l).toMatch(/ ⚠ tema (inválido: verniz|"perganinho" inválido, usando "verniz") /);
				expect(r === "" || r.endsWith(" ")).toBe(true);
			}
		});
	}

	test("56 columns: counts and hints go, the left side is whole", () => {
		const { l, r } = fitted({ ...base, width: 56 });
		expect(l).toStartWith(" Sanzio  SEGUINDO ");
		expect(r.length).toBeLessThan(56 - l.length + 1);
	});

	test("140 columns with an invalid theme in conversation: the hint goes, SEGUINDO stays whole", () => {
		const { l, r } = fitted({ ...base, workspaceVisible: false, invalidTheme: "perganinho", width: 140 });
		expect(l).toContain(" SEGUINDO ");
		expect(r).not.toContain("editor abre");
	});
});
