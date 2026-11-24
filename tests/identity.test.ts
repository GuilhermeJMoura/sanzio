import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SanzioRun, SanzioRunOptions } from "$types/testing.ts";
import { LIGHT_NOTICE } from "../src/claude-pane.ts";
import { HINT } from "../src/ui/splash-frame.ts";
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

describe("AC2 the opening leaves on a key, and the key reaches claude", () => {
	test("the first key closes it and is not swallowed", async () => {
		const { r } = await startWithSplash();
		r.write("x");
		await r.waitFor(() => r.inputs().includes("x"), "x reaches claude");
		await r.waitForScreen((s) => !s.includes(HINT), "opening gone");
	});

	test("with no key it leaves by itself after about 1.5 s", async () => {
		const { r } = await startWithSplash();
		const shown = Date.now();
		await r.waitForScreen((s) => !s.includes(HINT) && s.includes("ready"), "opening gone", 4000);
		expect(Date.now() - shown).toBeLessThan(3000);
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

describe("AC5 / AC6 theme from the config file or SANZIO_THEME", () => {
	test("no configuration paints verniz", async () => {
		const { r } = await startWithSplash({ env: { HOME: tempDir("sanzio-home-") } });
		expect(r.output()).toContain("48;2;42;37;25m");
		expect(r.output()).not.toContain("48;2;241;230;200m");
	});

	test('{"theme":"pergaminho"} paints the light theme and asks once for /theme light', async () => {
		const { r } = await startWithSplash({ env: { HOME: homeWithTheme("pergaminho") } });
		const screen = await r.waitForScreen((s) => s.includes(LIGHT_NOTICE), "light notice");
		expect(screen).not.toContain("⚠");
		expect(r.output()).toContain("48;2;241;230;200m");
		// the notice goes on a click
		await r.click("×");
		await r.waitForScreen((s) => !s.includes(LIGHT_NOTICE), "notice dismissed");
	});

	test("SANZIO_THEME wins over the file", async () => {
		const { r } = await startWithSplash({ env: { HOME: homeWithTheme("pergaminho"), SANZIO_THEME: "verniz" } });
		await r.waitForScreen((s) => !s.includes(HINT), "opening gone");
		expect(await r.screen()).not.toContain(LIGHT_NOTICE);
		expect(r.output()).not.toContain("48;2;241;230;200m");
	});

	test("an invalid name falls back to verniz with a one-line warning", async () => {
		const { r } = await startWithSplash({ cols: 120, env: { SANZIO_THEME: "perganinho" } });
		const screen = await r.waitForScreen((s) => statusLine(s).includes("⚠"), "warning");
		expect(statusLine(screen)).toContain(' ⚠ tema "perganinho" inválido, usando "verniz" ');
		expect(r.output()).toContain("48;2;42;37;25m");
	});
});
