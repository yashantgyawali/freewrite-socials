"use client";

// Harper — a fully on-device grammar & punctuation checker (Rust → WebAssembly).
// No LLM, no network round-trips for the actual checking. The ~8MB WASM is
// fetched once from a CDN on first use (pinned to the installed version so the
// bundled JS glue and the binary stay ABI-compatible) and cached by the browser.
const HARPER_VERSION = "2.4.0";
const SLIM_WASM_URL = `https://cdn.jsdelivr.net/npm/harper.js@${HARPER_VERSION}/dist/harper_wasm_slim_bg.wasm`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let linterPromise: Promise<any> | null = null;

async function getLinter() {
  if (!linterPromise) {
    linterPromise = (async () => {
      const { LocalLinter, createBinaryModuleFromUrl } = await import("harper.js");
      const binary = createBinaryModuleFromUrl(SLIM_WASM_URL, "slim");
      const linter = new LocalLinter({ binary });
      await linter.setup();
      return linter;
    })();
  }
  return linterPromise;
}

// Mechanical grammar/punctuation kinds we always auto-apply.
const SAFE_KINDS = new Set([
  "Capitalization",
  "Formatting",
  "Punctuation",
  "Grammar",
  "Agreement",
  "Repetition",
  "BoundaryError",
]);

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Decide whether to auto-apply a lint's first suggestion. We're conservative on
// purpose: freewriting is full of names and slang, so we only fix grammar &
// punctuation. Spelling-type kinds are applied ONLY when the fix keeps the same
// letters (e.g. dont→don't, cant→can't) and doesn't split a word (tbh↛"tb h").
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function acceptableSuggestion(lint: any): any | null {
  const sugg = lint.suggestions()[0];
  if (!sugg) return null;
  if (SAFE_KINDS.has(lint.lint_kind())) return sugg;
  const replacement: string = sugg.get_replacement_text();
  if (!replacement || replacement.includes(" ")) return null;
  if (normalize(lint.get_problem_text()) === normalize(replacement)) return sugg;
  return null;
}

// Apply acceptable suggestions until the text is clean. Each pass fixes the
// first remaining issue and re-lints, so spans never go stale. Returns the
// corrected text and how many fixes were applied.
export async function fixWithHarper(text: string): Promise<{ fixed: string; count: number }> {
  if (!text.trim()) return { fixed: text, count: 0 };
  const linter = await getLinter();
  let out = text;
  let count = 0;
  for (let i = 0; i < 300; i++) {
    const lints = await linter.lint(out);
    let applied = false;
    for (const lint of lints) {
      const sugg = acceptableSuggestion(lint);
      if (!sugg) continue;
      const next = await linter.applySuggestion(out, lint, sugg);
      if (next === out) continue; // no-op suggestion; try the next lint
      out = next;
      count++;
      applied = true;
      break; // re-lint after each fix
    }
    if (!applied) break;
  }
  return { fixed: out, count };
}
