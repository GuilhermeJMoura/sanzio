import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createClaudePane } from "../src/claude-pane.ts";

const statusline = [
	"\x1b[38;2;139;233;253mContext\x1b[0m \x1b[38;5;82m██████\x1b[0m \x1b[1;38;2;80;250;123m12%\x1b[0m",
	" │ \x1b[38;2;255;184;108m2 CLAUDE.md\x1b[0m │ \x1b[48;2;68;71;90m\x1b[38;2;255;121;198m9 MCPs\x1b[0m",
].join("");

describe("AC5 claude's statusline renders with the same colors", () => {
	test("24-bit, 256-color and bold attributes survive the pane", async () => {
		const setup = await createTestRenderer({ width: 80, height: 6 });
		try {
			const { box, terminal } = createClaudePane(setup.renderer);
			setup.renderer.root.add(box);
			await setup.renderOnce();
			terminal.write(statusline);
			await setup.renderOnce();

			const spans = setup.captureSpans().lines[1]?.spans ?? [];
			const find = (text: string) => spans.find((s) => s.text.includes(text));
			const rgb = (text: string, key: "fg" | "bg") => {
				const span = find(text);
				return span ? [span[key].r, span[key].g, span[key].b].map((v) => Math.round(v * 255)) : null;
			};

			expect(setup.captureCharFrame()).toContain("Context ██████ 12% │ 2 CLAUDE.md │ 9 MCPs");
			expect(rgb("Context", "fg")).toEqual([139, 233, 253]);
			expect(rgb("██████", "fg")).toEqual([95, 255, 0]);
			expect(rgb("12%", "fg")).toEqual([80, 250, 123]);
			expect((find("12%")?.attributes ?? 0) & 1).toBe(1);
			expect(rgb("2 CLAUDE.md", "fg")).toEqual([255, 184, 108]);
			expect(rgb("9 MCPs", "fg")).toEqual([255, 121, 198]);
			expect(rgb("9 MCPs", "bg")).toEqual([68, 71, 90]);
		} finally {
			setup.renderer.destroy();
		}
	});
});
