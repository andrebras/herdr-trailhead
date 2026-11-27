// Times Trailhead's ranking inside Herdr's JavaScript engine (QuickJS), which is slower than
// Node.js. Not a real mod and never installed: bin/bench-herdr copies it with match.js and
// rows.js into a scratch Herdr home, writes case.js, and loads it with `herdr-app check` once
// per case. The time comes back in the error the check prints, the only output it shows.
import { View, div } from "gpui-kit";
import { rankIndex, bestIn, ordered } from "./match.js";
import { benchRows } from "./rows.js";
import { CASE } from "./case.js";

const SHOWN = 12;
const { rows, recent } = benchRows();
const show = (/** @type {string} */ p) => p;

// Milliseconds the case takes: one key on a fresh list ("a" matches every row, "zzzz" none),
// the slowest key while typing a name, the order with nothing typed, or building the index.
function measure() {
  const start = Date.now();
  if (CASE === "ordered") ordered(rows, recent, null, SHOWN);
  else if (CASE === "index") rankIndex(rows, show, recent);
  else if (CASE === "typing") {
    const index = rankIndex(rows, show, recent);
    const typed = "acme-web-12";
    let worst = 0;
    for (let n = 1; n <= typed.length; n++) {
      const t = Date.now();
      bestIn(index, typed.slice(0, n), SHOWN);
      worst = Math.max(worst, Date.now() - t);
    }
    return worst;
  } else {
    const index = rankIndex(rows, show, recent);
    const t = Date.now();
    bestIn(index, CASE, SHOWN);
    return Date.now() - t;
  }
  return Date.now() - start;
}

export default class Bench extends View {
  init() {
    throw new Error(`BENCH ${CASE} ${measure()}`);
  }

  render() {
    return div();
  }
}
