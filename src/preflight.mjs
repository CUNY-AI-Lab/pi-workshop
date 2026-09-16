/** Node.js version preflight. Uses process.version / process.execPath, never a global `node`. */
export const MIN_NODE_VERSION = "22.19.0";

function parseVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(version));
  if (!match) return null;
  return match.slice(1, 4).map(Number);
}

export function versionAtLeast(version, minimum) {
  const a = parseVersion(version);
  const b = parseVersion(minimum);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return true;
}

export function checkNodeVersion(version = process.version, execPath = process.execPath) {
  const ok = versionAtLeast(version, MIN_NODE_VERSION);
  const message = ok
    ? `Node ${version}`
    : [
        `CUNY AI Lab × Pi requires Node.js ${MIN_NODE_VERSION} or newer.`,
        "",
        "Detected:",
        `  Node ${version}`,
        `  ${execPath}`,
        "",
        "If you have several Node installations (nvm, Homebrew, conda, winget),",
        "make sure the one above is the version you expect, then run this again.",
      ].join("\n");
  return { ok, version, execPath, message };
}
