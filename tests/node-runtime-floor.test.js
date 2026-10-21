const assert = require("node:assert/strict");
const { nodeRuntimeOk } = require("../node-runtime-floor");

assert.equal(nodeRuntimeOk("20.19.5"), false);
assert.equal(nodeRuntimeOk("22.23.3"), false);
assert.equal(nodeRuntimeOk("22.23.4"), true);
assert.equal(nodeRuntimeOk("24.22.0"), false);
assert.equal(nodeRuntimeOk("24.22.1"), true);
assert.equal(nodeRuntimeOk("26.12.0"), false);
assert.equal(nodeRuntimeOk("26.12.1"), true);
assert.equal(nodeRuntimeOk("27.0.0"), true);
assert.equal(nodeRuntimeOk("18.20.0"), false);

console.log("node-runtime-floor ok");
