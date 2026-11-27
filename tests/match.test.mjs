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

import { ordered, bonus, age, reflogTime } from "../mods/trailhead/match.js";

const row = (name, extra = {}) => ({ name, path: `/home/sam/code/${name}`, ...extra });

test("with nothing typed: open spaces, then recent picks, then the rest by name", () => {
  const rows = [row("zinnia"), row("maple", { space: { id: "s1" } }), row("birch"), row("cedar"), row("aspen")];
  const recent = ["/home/sam/code/cedar", "/home/sam/code/zinnia"];
  assert.deepEqual(ordered(rows, recent).map((r) => r.name), ["maple", "cedar", "zinnia", "aspen", "birch"]);
});

test("an open space or a recent pick wins a tie, newer picks more", () => {
  const recent = ["/home/sam/code/two", "/home/sam/code/one"];
  assert.equal(bonus(row("x"), recent), 0);
  assert.equal(bonus(row("x", { space: {} }), recent), 10);
  assert.ok(bonus(row("two"), recent) > bonus(row("one"), recent));
  const rows = [row("harbor-a"), row("harbor-b")];
  assert.equal(best(rows, "harbor", 12, (p) => p, ["/home/sam/code/harbor-b"])[0].name, "harbor-b");
});

test("ages read in a few letters", () => {
  assert.equal(age(5), "now");
  assert.equal(age(5 * 60), "5m");
  assert.equal(age(3 * 3600), "3h");
  assert.equal(age(2 * 86400), "2d");
  assert.equal(age(21 * 86400), "3w");
  assert.equal(age(120 * 86400), "4mo");
  assert.equal(age(800 * 86400), "2y");
  assert.equal(age(-10), "now");
});

test("reads the time of a reflog's last entry", () => {
  const z = "0".repeat(40), a = "a".repeat(40), b = "b".repeat(40);
  const text = `${z} ${a} Sam <sam@example.com> 1700000000 +0100\tcommit (initial): start\n${a} ${b} Sam <sam@example.com> 1700000500 -0500\tcheckout: moving from main to next\n`;
  assert.equal(reflogTime(text), 1700000500);
  assert.equal(reflogTime(""), null);
});
