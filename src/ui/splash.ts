import { type CliRenderer, type OptimizedBuffer, Renderable, RGBA, TextAttributes } from "@opentui/core";
import type { SplashFrame } from "$types/theme.ts";
import { splashFrame } from "./splash-frame.ts";

/** How long the opening stays when no key is pressed. */
export const SPLASH_MS = 1500;

class SplashRenderable extends Renderable {
	private frame: SplashFrame | null = null;
	private readonly colors = new Map<string, RGBA>();

	private rgba(hex: string): RGBA {
		let color = this.colors.get(hex);
		if (!color) {
			color = RGBA.fromHex(hex);
			this.colors.set(hex, color);
		}
		return color;
	}

	protected override renderSelf(buffer: OptimizedBuffer): void {
		if (this.frame?.width !== this.width || this.frame?.height !== this.height) {
			this.frame = splashFrame(this.width, this.height);
		}
		this.frame?.rows.forEach((row, y) => {
			row.forEach((cell, x) => {
				const bold = cell.bold ? TextAttributes.BOLD : 0;
				buffer.setCell(this.x + x, this.y + y, cell.char, this.rgba(cell.fg), this.rgba(cell.bg), bold);
			});
		});
	}
}

/** The opening, laid over the inside of the claude pane; it leaves on the first key (which still reaches claude) or after SPLASH_MS. */
export function createSplash(renderer: CliRenderer, durationMs = SPLASH_MS) {
	const node = new SplashRenderable(renderer, {
		id: "splash",
		position: "absolute",
		top: 0,
		left: 0,
		width: "100%",
		height: "100%",
		zIndex: 100,
	});
	let timer: ReturnType<typeof setTimeout> | null = null;
	// no preventDefault: the key goes on to the focused claude terminal
	const onKey = () => close();
	const close = () => {
		if (timer) clearTimeout(timer);
		timer = null;
		renderer.keyInput.off("keypress", onKey);
		if (!node.isDestroyed) node.destroy();
		renderer.requestRender();
	};
	renderer.keyInput.on("keypress", onKey);
	timer = setTimeout(close, durationMs);
	return { node, close };
}
