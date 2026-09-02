"use strict";

const assert = require("assert");
const { semanticTools } = require("../src/tools.cjs");

const seen = new Set();
for (const tool of semanticTools) {
  assert.match(tool.name, /^[A-Za-z0-9_-]{1,128}$/);
  assert(!seen.has(tool.name), `duplicate tool ${tool.name}`);
  seen.add(tool.name);
  assert.strictEqual(typeof tool.description, "string", `${tool.name} missing description`);
  assert.strictEqual(tool.inputSchema.type, "object", `${tool.name} schema must be object`);
  JSON.stringify(tool);
}

console.log(JSON.stringify({
  success: true,
  tool_count: semanticTools.length,
  tools: semanticTools.map(tool => tool.name)
}, null, 2));
