import { test } from "node:test";
import assert from "node:assert/strict";
import { makePaths } from "../mods/trailhead/paths.js";

const mac = makePaths("/Users/sam");
const win = makePaths("C:\\Users\\sam");

test("uses the home folder's separator", () => {
  assert.equal(mac.sep, "/");
  assert.equal(win.sep, "\\");
  assert.equal(mac.join("/Users/sam/code", "app"), "/Users/sam/code/app");
  assert.equal(win.join("C:\\code\\", "app"), "C:\\code\\app");
});

test("expands ~ and trims trailing separators but keeps roots", () => {
  assert.equal(mac.expand("~"), "/Users/sam");
  assert.equal(mac.expand("~/code/app"), "/Users/sam/code/app");
  assert.equal(win.expand("~\\code"), "C:\\Users\\sam\\code");
  assert.equal(mac.trim("/Users/sam/code/"), "/Users/sam/code");
  assert.equal(mac.trim("/"), "/");
  assert.equal(win.trim("C:\\"), "C:\\");
});

test("recognises typed paths", () => {
  for (const p of ["~", "~/notes", "/tmp", "\\\\server", "C:\\code", "d:/code"]) assert.ok(mac.isPath(p), p);
  for (const p of ["app", "code/app", "c:app"]) assert.ok(!mac.isPath(p), p);
});

test("shortens paths under home and finds the base name", () => {
  assert.equal(mac.short("/Users/sam"), "~");
  assert.equal(mac.short("/Users/sam/code/app"), "~/code/app");
  assert.equal(mac.short("/Users/samuel/app"), "/Users/samuel/app");
  assert.equal(mac.inHome("/Users/sam/code"), true);
  assert.equal(mac.inHome("/Users/samuel"), false);
  assert.equal(win.base("C:\\code\\app\\"), "app");
});
