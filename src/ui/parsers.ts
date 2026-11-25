import { fileURLToPath } from "node:url";
import { addDefaultParsers } from "@opentui/core";

// tree-sitter grammars OpenTUI does not ship, one folder each under assets/parsers/<filetype>/ holding
// tree-sitter-<filetype>.wasm and highlights.scm; adding a language is one more name here
const LANGUAGES = ["python"];

const asset = (filetype: string, file: string) =>
	fileURLToPath(new URL(`../../assets/parsers/${filetype}/${file}`, import.meta.url));

/** Must run before the first highlight: the tree-sitter client reads its default parsers once, when it starts. */
export function registerParsers(): void {
	addDefaultParsers(
		LANGUAGES.map((filetype) => ({
			filetype,
			wasm: asset(filetype, `tree-sitter-${filetype}.wasm`),
			queries: { highlights: [asset(filetype, "highlights.scm")] },
		})),
	);
}
