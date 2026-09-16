/** Small output helpers. Everything printed goes through deps.out / deps.err so tests can capture it. */
export const RULE = "────────────────────────────────";

export function ok(text) {
  return `✓ ${text}`;
}

export function fail(text) {
  return `✗ ${text}`;
}

export function warn(text) {
  return `! ${text}`;
}

export function banner(out, subtitle) {
  out("");
  out("CUNY AI Lab × Pi");
  out(subtitle);
  out(RULE);
}

export function indentLines(text, prefix = "  ") {
  return String(text)
    .split("\n")
    .map((line) => (line === "" ? "" : `${prefix}${line}`))
    .join("\n");
}
