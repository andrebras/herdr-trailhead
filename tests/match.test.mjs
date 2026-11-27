import { test } from "node:test";
import assert from "node:assert/strict";
import { score, inOrder, best } from "../mods/trailhead/match.js";

test("ranks a name prefix over a substring over letters in order over the path", () => {
  const prefix = score("app", "apple", "~/code/apple");
  const inside = score("app", "my-app", "~/code/my-app");
  const letters = score("app", "a-pipe-p", "~/code/a-pipe-p");
  const path = score("app", "web", "~/apps/web");
  assert.ok(prefix > inside && inside > letters && letters > path && path > 0);
  assert.equal(score("xyz", "web", "~/code/web"), 0);
});

test("shorter names win among equal kinds of match", () => {
  assert.ok(score("api", "api", "~/api") > score("api", "api-gateway", "~/api-gateway"));
});

test("letters in order", () => {
  assert.ok(inOrder("hda", "herdr-app"));
  assert.ok(!inOrder("pah", "herdr-app"));
});

test("best keeps the top rows, best first, and drops non-matches", () => {
  const rows = ["orchard", "harbor", "harbor-docs", "pinecone"].map((name) => ({ name, path: `/home/sam/code/${name}` }));
  const shown = (p) => p.replace("/home/sam", "~");
  assert.deepEqual(best(rows, "harb", 12, shown).map((r) => r.name), ["harbor", "harbor-docs"]);
  assert.deepEqual(best(rows, "harb", 1, shown).map((r) => r.name), ["harbor"]);
  assert.deepEqual(best(rows, "zzz", 12, shown), []);
});
