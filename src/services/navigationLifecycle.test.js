import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const layout = readFileSync(join(repoRoot, "src", "components", "Layout.jsx"), "utf8");
const layoutCss = readFileSync(join(repoRoot, "src", "styles", "layout.css"), "utf8");

test("route wrapper must not use AnimatePresence presence choreography", () => {
  assert.ok(
    !layout.includes("AnimatePresence"),
    "AnimatePresence on the route wrapper can wedge the exiting child at " +
      "exit-final opacity:0 with the next route already rendered inside it " +
      "(framer-motion stuck-exit class: motiondivision/motion #3541, #3243, " +
      "#2673, #2554), leaving every page invisible until a full reload"
  );
  assert.ok(
    !layout.includes("framer-motion"),
    "Layout must stay free of framer-motion so route rendering can never " +
      "depend on animation-library state machines"
  );
});

test("route wrapper is keyed by pathname with a CSS enter class", () => {
  assert.ok(
    /key=\{location\.pathname\}/.test(layout),
    "the route div must be keyed by pathname so the enter animation restarts " +
      "on every navigation"
  );
  assert.ok(
    layout.includes('className="page-route"'),
    "route div must carry the page-route class that drives the enter animation"
  );
});

test("page-route CSS enter animation exists and fails visible", () => {
  assert.ok(
    layoutCss.includes(".page-stage > .page-route"),
    "layout.css must style the route wrapper"
  );
  assert.ok(
    layoutCss.includes("animation: page-route-enter 0.22s"),
    "layout.css must define the enter animation (if the animation never runs, " +
      "natural styles leave the page at opacity 1 — fail visible)"
  );
  assert.ok(
    layoutCss.includes("@keyframes page-route-enter"),
    "layout.css must define the keyframes"
  );
});
