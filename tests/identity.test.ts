import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SanzioRun, SanzioRunOptions } from "$types/testing.ts";
import { HINT } from "../src/ui/splash-frame.ts";
import { THEMES } from "../src/ui/theme.ts";
import { startSanzio, tempDir } from "./helpers/pty.ts";

let run: SanzioRun | undefined;
afterEach(() => run?.kill());

const FRAME_30 = `╭${"─".repeat(30)}╮`;
const FRAME_16 = `╭${"─".repeat(16)}╮`;
const statusLine = (screen: string) => screen.split("\n").at(-1) ?? "";

/** Starts sanzio and waits for the opening, with the fake claude already running behind it. */
async function startWithSplash(options: Partial<SanzioRunOptions> = {}) {
	const r = startSanzio({ cwd: tempDir("sanzio-id-"), cols: 100, rows: 30, ...options });
	run = r;
	const screen = await r.waitForScreen((s) => s.includes(HINT), "the opening");
	await r.waitFor(() => r.records().some((rec) => rec.event === "start"), "fake claude started");
	return { r, screen };
}

function homeWithTheme(theme: string): string {
	const home = tempDir("sanzio-home-");
	mkdirSync(join(home, ".config", "sanzio"), { recursive: true });
	writeFileSync(join(home, ".config", "sanzio", "config.json"), JSON.stringify({ theme }));
	return home;
}

describe("AC1 sanzio opens on Raphael's portrait and the big Sanzio", () => {
	test("a 30-wide gold frame of half blocks, 18 rows, centered, with the hint", async () => {
		const { screen } = await startWithSplash();
		const lines = screen.split("\n");
		const top = lines.findIndex((l) => l.includes(FRAME_30));
		expect(top).toBeGreaterThan(0);
		const x = lines[top]?.indexOf(FRAME_30) ?? 0;
		const portrait = lines.slice(top + 1, top + 19).map((l) => [...l].slice(x + 1, x + 31).join(""));
		expect(portrait).toEqual(Array(18).fill("▀".repeat(30)));
		expect(lines[top + 19]?.slice(x)).toStartWith(`╰${"─".repeat(30)}╯`);
		// big letters to the right of the frame
		expect(lines.slice(top, top + 19).some((l) => /[▀▄█]{3}/.test([...l].slice(x + 33).join("")))).toBe(true);
		// centered on the pane: equal margins (±1) on both sides of the 81-column block
		const right = 100 - (x + 81);
		expect(Math.abs(x - right)).toBeLessThanOrEqual(2);
	});
});

describe("AC2 the opening leaves on a key, and that key is swallowed", () => {
	test("the key that closes it never reaches claude; the next one does", async () => {
		const { r } = await startWithSplash();
		r.write("1");
		await r.waitForScreen((s) => !s.includes(HINT), "opening gone");
		await Bun.sleep(300);
		expect(r.inputs()).toBe("");
		r.write("x");
		await r.waitFor(() => r.inputs() === "x", "x reaches claude");
	});

	test("with no key it leaves by itself after about 1.5 s", async () => {
		const { r } = await startWithSplash();
		const shown = Date.now();
		await r.waitForScreen((s) => !s.includes(HINT) && s.includes("ready"), "opening gone", 4000);
		expect(Date.now() - shown).toBeLessThan(3000);
		expect(r.inputs()).toBe("");
	});

	test("claude's folder-trust dialog closes it at once, with nothing sent", async () => {
		// the dialog can close the splash before it is ever drawn, so time it from claude's start, not the splash
		const r = startSanzio({ cwd: tempDir("sanzio-id-"), cols: 100, rows: 30, env: { FAKE_CLAUDE_TRUST: "1" } });
		run = r;
		await r.waitFor(() => r.records().some((rec) => rec.event === "start"), "fake claude started");
		const shown = Date.now();
		const screen = await r.waitForScreen((s) => !s.includes(HINT) && s.includes("Do you trust"), "trust dialog shown");
		expect(Date.now() - shown).toBeLessThan(1000);
		expect(screen).toContain("Yes, proceed");
		expect(r.inputs()).toBe("");
	});
});

describe("AC3 a narrow terminal gets the compact opening", () => {
	test("56 columns: the 16 × 10 portrait with Sanzio in text beside it, nothing cut", async () => {
		const { screen } = await startWithSplash({ cols: 56 });
		const lines = screen.split("\n");
		const top = lines.findIndex((l) => l.includes(FRAME_16));
		expect(top).toBeGreaterThan(0);
		const x = lines[top]?.indexOf(FRAME_16) ?? 0;
		expect(lines.slice(top + 1, top + 11).map((l) => [...l].slice(x + 1, x + 17).join(""))).toEqual(
			Array(10).fill("▀".repeat(16)),
		);
		expect(lines.some((l) => l.includes(`▀│  Sanzio`))).toBe(true);
		expect(lines.some((l) => l.includes(`▀│  ${HINT}`))).toBe(true);
		expect(screen).not.toContain(FRAME_30);
	});
});

describe("AC4 the status line starts with the Sanzio mark", () => {
	test("Sanzio on the left, S in vermilion and anzio in gold", async () => {
		const { r } = await startWithSplash();
		const screen = await r.waitForScreen((s) => statusLine(s).includes("SEGUINDO"), "status line");
		expect(statusLine(screen)).toStartWith(" Sanzio  SEGUINDO");
		expect(r.output()).toMatch(/38;2;232;105;76m(.\[[0-9;]*m)*S/);
		expect(r.output()).toMatch(/38;2;220;171;74m(.\[[0-9;]*m)*anzio/);
	});
});

describe("AC4 / AC6 a narrow window keeps the mark, the warning and the mode whole", () => {
	test("56 columns with an invalid theme: Sanzio, the short warning and SEGUINDO", async () => {
		const { r } = await startWithSplash({ cols: 56, env: { SANZIO_THEME: "perganinho" } });
		const screen = await r.waitForScreen((s) => statusLine(s).includes("SEGUINDO"), "status line");
		expect(statusLine(screen)).toStartWith(" Sanzio  ⚠ tema inválido: verniz   SEGUINDO");
	});
});

describe("AC5 / AC6 theme from the config file or SANZIO_THEME", () => {
	test("no configuration paints verniz", async () => {
		const { r } = await startWithSplash({ env: { HOME: tempDir("sanzio-home-") } });
		expect(r.output()).toContain("48;2;42;37;25m");
		expect(r.output()).not.toContain("48;2;241;230;200m");
	});

	test('{"theme":"pergaminho"} paints the light theme', async () => {
		const { r } = await startWithSplash({ env: { HOME: homeWithTheme("pergaminho") } });
		const screen = await r.waitForScreen((s) => !s.includes(HINT), "opening gone");
		expect(screen).not.toContain("⚠");
		expect(screen).not.toContain("/theme light");
		expect(r.output()).toContain("48;2;241;230;200m");
	});

	test("SANZIO_THEME wins over the file", async () => {
		const { r } = await startWithSplash({ env: { HOME: homeWithTheme("pergaminho"), SANZIO_THEME: "verniz" } });
		await r.waitForScreen((s) => !s.includes(HINT), "opening gone");
		expect(r.output()).not.toContain("48;2;241;230;200m");
	});

	test("an invalid name falls back to verniz with a one-line warning", async () => {
		const { r } = await startWithSplash({ cols: 160, env: { SANZIO_THEME: "perganinho" } });
		const screen = await r.waitForScreen((s) => statusLine(s).includes("⚠"), "warning");
		expect(statusLine(screen)).toContain(' ⚠ tema "perganinho" inválido, usando "verniz" ');
		expect(r.output()).toContain("48;2;42;37;25m");
	});
});

describe("AC5 / AC6 the claude pane sits on the theme's ground, not the host terminal's", () => {
	for (const t of Object.values(THEMES)) {
		test(`${t.name}: claude's text and empty cells carry the ${t.bg} background`, async () => {
			const { r } = await startWithSplash({ env: { SANZIO_THEME: t.name } });
			await r.waitForScreen((s) => !s.includes(HINT) && s.includes("fake claude ready"), "claude visible");
			await Bun.sleep(200);
			const out = r.output();
			const at = out.lastIndexOf("fake");
			// the background set right before claude's text: the host default (49) would show the host's own color
			const backgrounds = [...out.slice(Math.max(0, at - 200), at).matchAll(/.\[(49|48;2;[0-9;]+)m/g)];
			const rgb = [1, 3, 5].map((i) => Number.parseInt(t.bg.slice(i, i + 2), 16)).join(";");
			expect(backgrounds.at(-1)?.[1]).toBe(`48;2;${rgb}`);
			expect(out.slice(at, at + 400)).not.toContain("\x1b[49m");
		});
	}
});
