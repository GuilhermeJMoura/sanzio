import { describe, expect, test } from "bun:test";
import { formatModel, formatTitle, parseTranscript, projectSlug } from "../src/session-info.ts";

const line = (o: unknown) => JSON.stringify(o);
const assistant = (stop: string | null, extra: Record<string, unknown> = {}) =>
	line({
		type: "assistant",
		effort: "high",
		perTurnEffort: "high",
		message: { model: "claude-opus-5-5", stop_reason: stop },
		...extra,
	});
const user = (content: unknown, extra: Record<string, unknown> = {}) =>
	line({ type: "user", message: { role: "user", content }, ...extra });

describe("AC8 title shows model, effort and state from the transcript", () => {
	test("a turn still running is working", () => {
		const text = [user("refactor login"), assistant("tool_use"), user([{ type: "tool_result", content: "ok" }])].join(
			"\n",
		);
		expect(parseTranscript(text)).toEqual({ model: "Opus 5.5", effort: "high", state: "working" });
	});

	test("a finished turn is idle, and noise lines do not change it", () => {
		const text = [
			user("hi"),
			assistant("end_turn"),
			line({ type: "attachment" }),
			line({ type: "system", subtype: "stop_hook_summary" }),
			user("<command-name>/model</command-name>"),
			user("meta", { isMeta: true }),
			assistant("tool_use", { isSidechain: true }),
		].join("\n");
		expect(parseTranscript(text).state).toBe("idle");
	});

	test("an interrupted turn is idle", () => {
		const text = [
			user("go"),
			assistant("tool_use"),
			user([{ type: "text", text: "[Request interrupted by user]" }]),
		].join("\n");
		expect(parseTranscript(text).state).toBe("idle");
	});

	test("broken, partial and unknown lines are skipped", () => {
		const text = [
			"{not json",
			"42",
			line({ type: "assistant", message: "weird" }),
			assistant("end_turn"),
			'{"type":"user","mess',
		].join("\n");
		expect(parseTranscript(text)).toEqual({ model: "Opus 5.5", effort: "high", state: "idle" });
		expect(parseTranscript("")).toEqual({ model: null, effort: null, state: null });
	});

	test("effort falls back to the per-session field and synthetic models are ignored", () => {
		const text = [
			line({
				type: "assistant",
				effort: "medium",
				message: { model: "claude-sonnet-4-5-20250929", stop_reason: "end_turn" },
			}),
			line({ type: "assistant", message: { model: "<synthetic>", stop_reason: "end_turn" } }),
		].join("\n");
		expect(parseTranscript(text)).toEqual({ model: "Sonnet 4.5", effort: "medium", state: "idle" });
	});

	test("model ids become display names", () => {
		expect(formatModel("claude-opus-5-5")).toBe("Opus 5.5");
		expect(formatModel("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
		expect(formatModel("claude-opus-4")).toBe("Opus 4");
		expect(formatModel("claude-3-5-sonnet-20241022")).toBe("Sonnet 3.5");
		expect(formatModel("gpt-oss")).toBe("gpt-oss");
	});

	test("title reads like the prototype", () => {
		expect(formatTitle({ model: "Opus 5.5", effort: "high", state: "working" })).toBe(
			" claude · Opus 5.5 · high · trabalhando ",
		);
		expect(formatTitle({ model: "Opus 5.5", effort: null, state: "idle" })).toBe(" claude · Opus 5.5 · ocioso ");
		expect(formatTitle({ model: null, effort: null, state: null })).toBe(" claude ");
	});

	test("project slug matches Claude Code's folder naming", () => {
		expect(projectSlug("/Users/me/Code/phd.term_x")).toBe("-Users-me-Code-phd-term-x");
	});
});
