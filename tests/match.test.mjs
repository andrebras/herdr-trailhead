import { test } from "node:test";
import assert from "node:assert/strict";
import {
  score,
  inOrder,
  best,
  ordered,
  bonus,
  age,
  reflogTime,
  positions,
  pieces,
  uniqueNames,
  worktreeRepo,
  zoxideBonus,
} from "../mods/trailhead/match.js";

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
  const rows = ["orchard", "harbor", "harbor-docs", "pinecone"].map((name) => ({
    name,
    path: `/home/sam/code/${name}`,
  }));
  const shown = (p) => p.replace("/home/sam", "~");
  assert.deepEqual(
    best(rows, "harb", 12, shown).map((r) => r.name),
    ["harbor", "harbor-docs"],
  );
  assert.deepEqual(
    best(rows, "harb", 1, shown).map((r) => r.name),
    ["harbor"],
  );
  assert.deepEqual(best(rows, "zzz", 12, shown), []);
});

const row = (name, extra = {}) => ({ name, path: `/home/sam/code/${name}`, ...extra });

const at = (name) => `/home/sam/code/${name}`;

test("with nothing typed: the previous pick, open spaces, other recent picks, then the rest", () => {
  const rows = [row("zinnia"), row("maple", { space: { id: "s1" } }), row("birch"), row("cedar"), row("aspen")];
  assert.deepEqual(
    ordered(rows, [at("cedar"), at("zinnia")]).map((r) => r.name),
    ["cedar", "maple", "zinnia", "aspen", "birch"],
  );
});

test("the rest are ordered by last change, newest first, then the unknown ones by name", () => {
  const rows = [
    row("old", { touched: 100 }),
    row("zed"),
    row("new", { touched: 300 }),
    row("abe"),
    row("mid", { touched: 200 }),
  ];
  assert.deepEqual(
    ordered(rows, []).map((r) => r.name),
    ["new", "mid", "old", "abe", "zed"],
  );
});

test("jump back: A to B in Trailhead, then C in the sidebar, puts B first and C last", () => {
  const space = (name) => row(name, { space: { id: name } });
  const rows = [space("a"), space("b"), space("c"), row("d")];
  // Opening Trailhead in A saves A; picking B saves B; opening it again in C saves C.
  const recent = [at("c"), at("b"), at("a")];
  assert.deepEqual(
    ordered(rows, recent, at("c")).map((r) => r.name),
    ["b", "a", "d", "c"],
  );
});

test("jump back twice: going back to B then opening again offers C", () => {
  const space = (name) => row(name, { space: { id: name } });
  const rows = [space("a"), space("b"), space("c")];
  const recent = [at("b"), at("c"), at("a")];
  assert.equal(ordered(rows, recent, at("b"))[0].name, "c");
  assert.equal(ordered(rows, recent, at("b")).at(-1)?.name, "b");
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
  const z = "0".repeat(40),
    a = "a".repeat(40),
    b = "b".repeat(40);
  const text = `${z} ${a} Sam <sam@example.com> 1700000000 +0100\tcommit (initial): start\n${a} ${b} Sam <sam@example.com> 1700000500 -0500\tcheckout: moving from main to next\n`;
  assert.equal(reflogTime(text), 1700000500);
  assert.equal(reflogTime(""), null);
});

test("positions finds the whole query first, then its letters in order", () => {
  assert.deepEqual(positions("web", "acme-web"), [5, 6, 7]);
  assert.deepEqual(positions("aw", "acme-web"), [0, 5]);
  assert.deepEqual(positions("WEB".toLowerCase(), "Acme-Web"), [5, 6, 7]);
  assert.deepEqual(positions("xyz", "acme-web"), []);
  assert.deepEqual(positions("", "acme-web"), []);
});

test("pieces alternates matched and unmatched runs", () => {
  assert.deepEqual(pieces("acme-web", [0, 5]), [
    { text: "a", hit: true },
    { text: "cme-", hit: false },
    { text: "w", hit: true },
    { text: "eb", hit: false },
  ]);
  assert.deepEqual(pieces("abc", []), [{ text: "abc", hit: false }]);
});

test("uniqueNames keeps unique labels and lengthens clashing ones", () => {
  const names = uniqueNames([
    { path: "/h/work/api", label: "api" },
    { path: "/h/home/api", label: "api" },
    { path: "/h/notes", label: "notes" },
  ]);
  assert.deepEqual(names, ["work/api", "home/api", "notes"]);
});

test("worktreeRepo reads the repo folder from a worktree's gitdir", () => {
  assert.equal(worktreeRepo("/h/code/acme/.git/worktrees/login"), "/h/code/acme");
  assert.equal(worktreeRepo("C:\\code\\acme\\.git\\worktrees\\login"), "C:\\code\\acme");
  assert.equal(worktreeRepo("/h/elsewhere/gitdir"), null);
});

test("a space where an agent is blocked ranks above other open spaces", () => {
  const open = { name: "a", path: "/a", space: { status: "working" } };
  const blocked = { name: "b", path: "/b", space: { status: "blocked" } };
  assert.ok(bonus(blocked, []) > bonus(open, []));
});

test("zoxideBonus gives the best-ranked paths the most, and stops after 100", () => {
  const lines = Array.from({ length: 120 }, (_, i) => `  ${200 - i}.0 /p/${i}`).join("\n");
  const z = zoxideBonus(lines);
  assert.equal(z.get("/p/0"), 5);
  assert.equal(z.get("/p/99"), 1);
  assert.equal(z.has("/p/100"), false);
  assert.equal(zoxideBonus("").size, 0);
});

test("zoxide only breaks ties between similar matches", () => {
  const rows = [
    { name: "acme-a", path: "/a" },
    { name: "acme-b", path: "/b" },
  ];
  const z = new Map([["/b", 5]]);
  assert.deepEqual(
    best(rows, "acme", 12, (p) => p, [], z).map((r) => r.path),
    ["/b", "/a"],
  );
});
