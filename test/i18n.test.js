// String-table test. The extension ships ONE language (Simplified Chinese), so
// this checks every key carries a non-empty `zh` value (no locale can fall back
// to a missing string) and that interpolation works.
"use strict";

const test = require("node:test");
const assert = require("node:assert");

const { STRINGS, interpolate } = require("../out/i18nStrings.js");

test("every i18n key has a non-empty Chinese value", () => {
  const keys = Object.keys(STRINGS);
  assert.ok(keys.length >= 20, `expected a substantial table, got ${keys.length}`);
  for (const key of keys) {
    const value = STRINGS[key].zh;
    assert.ok(typeof value === "string" && value.trim().length > 0, `${key}.zh is empty`);
  }
});

test("the table carries no leftover translation columns", () => {
  // Guard against a merge re-introducing the dropped locales.
  for (const key of Object.keys(STRINGS)) {
    assert.deepEqual(
      Object.keys(STRINGS[key]),
      ["zh"],
      `${key} carries extra columns: ${Object.keys(STRINGS[key]).join(", ")}`
    );
  }
});

test("interpolate replaces {placeholders}", () => {
  assert.equal(interpolate("Running {url}", { url: "http://127.0.0.1:1" }), "Running http://127.0.0.1:1");
  assert.equal(interpolate("Error: {message}", { message: "boom" }), "Error: boom");
  assert.equal(interpolate("No vars", {}), "No vars");
});
