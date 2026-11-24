import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import type { PixelGrid } from "$types/theme.ts";
import { PORTRAIT_COMPACT, PORTRAIT_LARGE } from "../../src/ui/portrait.ts";
import { createSplash } from "../../src/ui/splash.ts";
import { COMPACT_WIDTH, HINT, LARGE_HEIGHT, LARGE_WIDTH, splashFrame } from "../../src/ui/splash-frame.ts";
import { theme } from "../../src/ui/theme.ts";

const hex = (c: { r: number; g: number; b: number }) =>
	`#${[c.r, c.g, c.b]
		.map((v) =>
			Math.round(v * 255)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;

/** Renders the splash at `width` × `height` and returns every painted cell as char + fg + bg. */
async function renderSplash(width: number, height: number) {
	const setup = await createTestRenderer({ width, height });
	const splash = createSplash(setup.renderer, 60_000);
	setup.renderer.root.add(splash.node);
	await setup.renderOnce();
	const lines = setup
		.captureSpans()
		.lines.map((line) =>
			line.spans.flatMap((span) => [...span.text].map((char) => ({ char, fg: hex(span.fg), bg: hex(span.bg) }))),
		);
	splash.close();
	setup.renderer.destroy();
	return lines;
}

function expectPortrait(lines: Awaited<ReturnType<typeof renderSplash>>, grid: PixelGrid, x: number, y: number) {
	const cols = grid[0]?.length ?? 0;
	const rows = grid.length / 2;
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			expect(lines[y + r]?.[x + c]).toEqual({ char: "▀", fg: grid[2 * r]?.[c] ?? "", bg: grid[2 * r + 1]?.[c] ?? "" });
		}
	}
	// the thin gold frame
	const top = (lines[y - 1] ?? []).slice(x - 1, x + cols + 1);
	expect(top.map((cell) => cell.char).join("")).toBe(`╭${"─".repeat(cols)}╮`);
	expect(new Set(top.map((cell) => cell.fg))).toEqual(new Set([theme.gold]));
	expect(lines[y + rows]?.[x - 1]?.char).toBe("╰");
	expect(lines[y]?.[x + cols]?.char).toBe("│");
}

describe("AC1 the large opening: Raphael's portrait, 30 × 18 half blocks, gold frame, big Sanzio", () => {
	test("the rendered cells are the 30x36 grid, pixel for pixel", async () => {
		const frame = splashFrame(98, 27);
		expect(frame?.kind).toBe("large");
		const lines = await renderSplash(98, 27);
		const { x, y } = frame?.portrait ?? { x: 0, y: 0 };
		expect(PORTRAIT_LARGE).toHaveLength(36);
		expect(PORTRAIT_LARGE[0]).toHaveLength(30);
		expectPortrait(lines, PORTRAIT_LARGE, x, y);
		const text = lines.map((line) => line.map((cell) => cell.char).join(""));
		// "Sanzio" in big half-block letters right of the frame, the S in vermilion
		const word = text.slice(y + 6, y + 11).map((row) => row.slice(x + 33));
		expect(word.join("")).toMatch(/[▀▄█]/);
		const initial = lines.slice(y + 6, y + 11).flatMap((row) => row.slice(x + 33, x + 41));
		expect(initial.some((cell) => cell.char !== " " && cell.fg === theme.word.initial)).toBe(true);
		expect(text.some((row) => row.includes(HINT))).toBe(true);
	});

	test("it is centered over the pane", () => {
		const frame = splashFrame(120, 30);
		expect(frame?.portrait).toEqual({
			x: Math.floor((120 - LARGE_WIDTH) / 2) + 1,
			y: Math.floor((30 - LARGE_HEIGHT) / 2) + 1,
		});
	});
});

describe("AC3 the compact opening: 16 × 10 portrait and Sanzio in text, never cut", () => {
	test("the rendered cells are the 16x20 grid, with Sanzio beside it", async () => {
		const frame = splashFrame(54, 27);
		expect(frame?.kind).toBe("compact");
		const lines = await renderSplash(54, 27);
		const { x, y } = frame?.portrait ?? { x: 0, y: 0 };
		expectPortrait(lines, PORTRAIT_COMPACT, x, y);
		const text = lines.map((line) => line.map((cell) => cell.char).join(""));
		expect(text[y + 4]?.slice(x + 19)).toStartWith("Sanzio");
		expect(text[y + 6]?.slice(x + 19)).toStartWith(HINT);
	});

	test("compact whenever the large one does not fit; everything stays inside the pane", () => {
		for (const [w, h] of [
			[58, 27],
			[LARGE_WIDTH - 1, 40],
			[120, LARGE_HEIGHT - 1],
			[COMPACT_WIDTH, 12],
		] as const) {
			const frame = splashFrame(w, h);
			expect(frame?.kind).toBe("compact");
			expect(frame?.portrait.x).toBeGreaterThanOrEqual(1);
			expect((frame?.portrait.x ?? 0) + 19 + HINT.length).toBeLessThanOrEqual(w);
			expect(frame?.rows.every((row) => row.length === w)).toBe(true);
		}
		expect(splashFrame(LARGE_WIDTH, LARGE_HEIGHT)?.kind).toBe("large");
		expect(splashFrame(30, 20)?.kind).toBe("stacked");
		expect(splashFrame(10, 5)).toBeNull();
	});
});
