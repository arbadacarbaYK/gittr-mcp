"use strict";

// October 2026 Node security release. Older lines are end of life and still
// trust the compromised eMudhra intermediates and the Brotli decoder bug.
const FLOORS = [
  { major: 22, version: "22.23.4" },
  { major: 24, version: "24.22.1" },
  { major: 26, version: "26.12.1" },
];

function parse(version) {
  return String(version)
    .replace(/^v/, "")
    .split(".")
    .map((part) => Number(part) || 0);
}

function atLeast(actual, minimum) {
  const left = parse(actual);
  const right = parse(minimum);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] > right[i]) return true;
    if (left[i] < right[i]) return false;
  }
  return true;
}

function nodeRuntimeOk(version) {
  const [major] = parse(version);
  if (major > 26) return true;
  const floor = FLOORS.find((item) => item.major === major);
  return floor ? atLeast(version, floor.version) : false;
}

function assertNodeRuntime(version = process.versions.node) {
  if (nodeRuntimeOk(version)) return;
  console.error(
    `gittr-mcp needs Node 22.23.4, 24.22.1, or 26.12.1 (or newer on those lines). This process is Node ${version}. Node 18 and 20 are not patched.`
  );
  process.exit(1);
}

module.exports = { nodeRuntimeOk, assertNodeRuntime };
