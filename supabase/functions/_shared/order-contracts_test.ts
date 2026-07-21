import assert from "node:assert/strict";
import {
  ORDER_TOOL_CONTRACTS,
  ORDER_TOOL_NAMES,
  realtimeOrderTools,
  replaceSharedOrderTools,
} from "./order-contracts.ts";

Deno.test("shared order tool names are unique and every schema is closed", () => {
  assert.equal(new Set(ORDER_TOOL_NAMES).size, ORDER_TOOL_NAMES.length);
  assert.ok(ORDER_TOOL_NAMES.includes("preview_order"));
  assert.ok(ORDER_TOOL_NAMES.includes("submit_order"));
  assert.ok(ORDER_TOOL_NAMES.includes("handoff_to_human"));
  for (const tool of ORDER_TOOL_CONTRACTS) {
    assert.equal(tool.parameters.type, "object");
    assert.equal(tool.parameters.additionalProperties, false, tool.name);
  }
});

Deno.test("Realtime adapter uses the flat official function-tool shape", () => {
  const realtime = realtimeOrderTools();
  assert.deepEqual(
    realtime.map((tool) => tool.name),
    ORDER_TOOL_NAMES,
  );
  assert.equal(realtime[0].type, "function");
  assert.equal("function" in realtime[0], false);
  assert.equal(realtime[0].parameters.additionalProperties, false);
});

Deno.test("chat adapter replaces shared contracts without reordering channel tools", () => {
  const existing = [
    {
      type: "function" as const,
      function: {
        name: "search_menu",
        description: "stale",
        parameters: {
          type: "object" as const,
          properties: {},
          additionalProperties: false as const,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "channel_only",
        description: "keep me",
        parameters: {
          type: "object" as const,
          properties: {},
          additionalProperties: false as const,
        },
      },
    },
  ];

  const merged = replaceSharedOrderTools(existing);
  assert.equal(merged[0].function.name, "search_menu");
  assert.notEqual(merged[0].function.description, "stale");
  assert.equal(merged[1], existing[1]);
  assert.equal(
    merged.filter((tool) => tool.function.name === "search_menu").length,
    1,
  );
  assert.equal(merged.length, ORDER_TOOL_CONTRACTS.length + 1);
});
