// que as a crossbar switch. Rows are packages, columns are runs. A marker reads
// the agent's card and the user's key, tilts the select bars both allow, and the
// run's hold magnet closes the contacts where they cross. Build: node crossbar.mjs [--light]
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL = join(homedir(), ".claude/skills/anatomy");
const k = await import(join(SKILL, "kit/iso-kit.mjs"));
const { kitScript } = await import(join(SKILL, "scripts/inline-kit.mjs"));

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

// ---------------------------------------------------------------------------
// The model: an example environment run by que's real rules.
// access: a package with a credential is loaded for a user only if they hold it.
// narrow: an agent's `packages` takes packages out; with none named, it keeps all.
// A run gets the packages that pass both. Ops reach the model on demand.
// ---------------------------------------------------------------------------
const PACKAGES = [
  { name: "odoo", ops: 6, credential: true, outside: true },
  { name: "shopify", ops: 5, credential: true, outside: true },
  { name: "klaviyo", ops: 4, credential: true, outside: true },
  { name: "orders", ops: 3, credential: false, outside: false },
  { name: "notes", ops: 0, credential: false, outside: false },
  { name: "docs", ops: 0, credential: false, outside: false },
];
const USERS = { mkultra: ["odoo", "shopify"], ana: ["shopify", "klaviyo"] };
const AGENTS = { chat: null, sales: ["orders", "odoo", "klaviyo"], "deep-chat": null };
const AGENT_NAMES = Object.keys(AGENTS);
const USER_NAMES = Object.keys(USERS);
const RUNS = [
  { user: "mkultra", agent: "chat" },
  { user: "mkultra", agent: "sales" },
  { user: "ana", agent: "sales" },
  { user: "ana", agent: "deep-chat" },
].map((run) => {
  const reach = PACKAGES.map((p) => !p.credential || USERS[run.user].includes(p.name));
  const named = PACKAGES.map((p) => AGENTS[run.agent] === null || AGENTS[run.agent].includes(p.name));
  const closed = PACKAGES.map((_, i) => reach[i] && named[i]);
  const ops = PACKAGES.reduce((sum, p, i) => sum + (closed[i] ? p.ops : 0), 0);
  return { ...run, reach, named, closed, ops, count: closed.filter(Boolean).length };
});

// ---------------------------------------------------------------------------
// The world: a relay rack facing +y on a cabinet. x across, z up.
// ---------------------------------------------------------------------------
const WIDTH = 600;
const HEIGHT = 440;
const ROWS = [156, 134, 112, 90, 68, 46];
const COLS = [-46, -14, 18, 50];
const BAR_X0 = -62;
const BAR_X1 = 72;
const BAR_Y = 4;
const TILT = 1.6;

const BASE = { x: -140, y: -62, w: 256, d: 112, r: 6 };
const BASE_Z = -30;
const FOOT_H = 6;
const MARKER = { x: -128, y: -16, w: 30, d: 32, r: 2 };
const MARKER_H = 64;
const TRUNK = { x: 92, y: -54, w: 18, d: 22, r: 2 };

const P = k.fitProjection(
  [...k.boxCorners(BASE, BASE_Z - FOOT_H, 0), [-84, -3, 186], [84, 5, 186], [-118, 0, 92]],
  WIDTH,
  HEIGHT,
  { pad: 26, azimuth: 60 },
);

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const poly = (pts) => k.pathOf(pts.map(at));
const depth = (p) => k.depthOf(p, P);
const slab = (plan, z, h, style, steps = 2, bevel = 0.4) => S(k.slabOf(plan, z, h, P, steps, bevel), style);
const byDepth = (list, of) => [...list].sort((a, b) => depth(of(a)) - depth(of(b)));
const wire = (pts, tone = "lo", ends = "both") => k.wireSvg(at(pts[0]), at(pts[pts.length - 1]), { via: pts.slice(1, -1).map(at), tone, ends, size: 0.7 });
const lamp = (x, y, z, id) =>
  S(k.cylinder(x, y, 1.5, z, 1.4, P, 14), { tone: "lo" }) + `<g data-lamp="${id}" style="opacity:0">${S(k.cylinder(x, y, 1.5, z, 1.4, P, 14), { tone: "hi", lit: true })}</g>`;

const layers = [];
const add = (svg) => layers.push(svg);

// --- cabinet: the backend --------------------------------------------------
function cabinet() {
  add(`<path class="iso-halo" d="${k.haloOf(BASE, BASE_Z - FOOT_H, -BASE_Z, P)}"/>`);
  for (const [x, y] of byDepth(k.corners(BASE, 16), (c) => [...c, 0])) {
    add(S(k.cylinder(x, y, 7, BASE_Z - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    add(S(k.cylinder(x, y, 5.2, BASE_Z - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  add(S(k.slabOf(BASE, BASE_Z, -BASE_Z, P, 8, 1.4), { tone: "mid", inner: L(k.sideSeam(BASE, -6, P, 8), { tone: "faint" }) }));
  add(L(k.planOutline(k.insetPlan(BASE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(BASE, 9);
  add(L(screws.map(([x, y]) => k.ring(x, y, 2, 0, P, 16)).join(""), { tone: "lo" }) + D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // ruler strip and maker's plate along the front
  const strip = { x: -120, y: BASE.y + BASE.d - 11, w: 150, d: 6, r: 1 };
  add(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const t = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, 0.6, [1.8, 3.2], P);
  add(L(t.minor, { tone: "lo" }) + L(t.major, { tone: "mid" }));
  const plate = { x: 54, y: BASE.y + BASE.d - 16, w: 40, d: 10, r: 1.2 };
  add(S(k.slabOf(plate, 0, 0.8, P, 4), { tone: "lo" }) + L(k.planOutline(k.insetPlan(plate, 1.4), 0.8, P, 4), { tone: "faint" }));
  add(L([0, 1, 2].map((r) => k.lineOnTop([plate.x + 4, plate.y + 3 + r * 2], [plate.x + 4 + [26, 18, 22][r], plate.y + 3 + r * 2], 0.8, P)).join(""), { tone: "lo", free: true }));
  add(D([at([plate.x + 2.2, plate.y + 5, 0.8]), at([plate.x + plate.w - 2.2, plate.y + 5, 0.8])], { size: 0.4 }));
  // drawers: identity, credentials, state
  [-122, -46, 30].forEach((x, i) => {
    const y = BASE.y + BASE.d, fy = y + 2.4, o = [];
    o.push(slab({ x, y, w: 60, d: 2.4, r: 0.8 }, -26, 18, { tone: "mid" }, 2, 0.4));
    o.push(L(poly([[x + 6, fy, -12], [x + 22, fy, -12], [x + 22, fy, -18], [x + 6, fy, -18]]) + "Z", { tone: "lo" }));
    for (const px of [x + 34, x + 50]) o.push(slab({ x: px - 1, y: fy, w: 2, d: 2.6, r: 0.4 }, -16.5, 3, { tone: "mid", crease: "none" }, 2, 0));
    o.push(slab({ x: x + 32, y: fy + 2.6, w: 20, d: 1.8, r: 0.8 }, -17, 4, { tone: "mid" }, 2, 0.3));
    o.push(D([[x + 3, fy, -9], [x + 57, fy, -9], [x + 3, fy, -23], [x + 57, fy, -23]].map(at), { size: 0.42 }));
    add(`<g data-drawer="${i}">${o.join("")}</g>`);
  });
}

// --- trunk block at the back: where connector packages leave for their services
function trunkBlock() {
  add(slab(TRUNK, 0, 30, { tone: "mid" }, 3, 0.6));
  add(L(k.planOutline(k.insetPlan(TRUNK, 2.5), 30, P, 3), { tone: "faint" }));
  // three binding posts, and a cable leaving each through the back
  [-48, -43, -38].forEach((y) => {
    add(S(k.cylinder(TRUNK.x + 6, y, 1.6, 30, 3, P, 14), { tone: "mid" }) + D([at([TRUNK.x + 6, y, 33])], { size: 0.45 }));
  });
  [-48, -43, -38].forEach((y, i) => add(wire([[TRUNK.x + TRUNK.w, y, 8 + i * 6], [TRUNK.x + TRUNK.w + 14, y, 8 + i * 6]], "lo", "both")));
}

// --- the marker: reads the card and the key, drives the bars ---------------
const CARD_Y = MARKER.y + MARKER.d - 6;
function marker() {
  add(S(k.slabOf(MARKER, 0, MARKER_H, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(MARKER, 40, P, 3), { tone: "faint" }) }));
  add(L(k.planOutline(k.insetPlan(MARKER, 3), MARKER_H, P, 3), { tone: "faint" }));
  // card slot on top, and the agent's card standing in it
  const slot = { x: MARKER.x + 5, y: CARD_Y - 1.5, w: 20, d: 3, r: 0.6 };
  add(L(k.planOutline(slot, MARKER_H, P, 2), { tone: "lo" }));
  AGENT_NAMES.forEach((name, a) => {
    const holes = PACKAGES.map((p, i) => (AGENTS[name] === null || AGENTS[name].includes(p.name) ? k.sideRing([MARKER.x + 8 + i * 2.8, CARD_Y + 0.6, MARKER_H + 14], 0.9, "y", P, 12) : "")).join("");
    const notch = name === "deep-chat" ? L(k.sideRing([MARKER.x + 22, CARD_Y + 0.6, MARKER_H + 19], 0.9, "y", P, 12), { tone: "lo" }) : "";
    add(`<g data-card="${a}" style="opacity:0">${slab({ x: MARKER.x + 6, y: CARD_Y - 0.6, w: 18, d: 1.2, r: 0.4 }, MARKER_H - 4, 26, { tone: "hi", crease: "lo" }, 1, 0)}${L(holes, { tone: "lo" })}${notch}</g>`);
  });
  // key lock on the front, and the user's key in it
  const fy = MARKER.y + MARKER.d;
  add(L(k.sideRing([MARKER.x + 10, fy, 24], 3.2, "y", P, 24), { tone: "lo" }) + L(k.sideRing([MARKER.x + 10, fy, 24], 1.6, "y", P, 16), { tone: "faint" }));
  USER_NAMES.forEach((name, u) => {
    const teeth = u === 0 ? [0] : [0, 4];
    const bow = slab({ x: MARKER.x + 6, y: fy, w: 8, d: 1.4, r: 1.5 }, 14, 7, { tone: "hi", crease: "lo" }, 3, 0);
    const blade = teeth.map((dx) => slab({ x: MARKER.x + 8 + dx, y: fy, w: 2, d: 1.4, r: 0.3 }, 21, 3, { tone: "hi" }, 1, 0)).join("");
    add(`<g data-key="${u}" style="opacity:0">${bow}${blade}</g>`);
  });
  // the marker's own lamp row: one per package it may select
  PACKAGES.forEach((_, i) => add(lamp(MARKER.x + 4 + i * 4.4, fy - 2, MARKER_H, `mk-${i}`)));
  add(D([[MARKER.x + 2.5, fy, 4], [MARKER.x + MARKER.w - 2.5, fy, 4], [MARKER.x + 2.5, fy, MARKER_H - 4], [MARKER.x + MARKER.w - 2.5, fy, MARKER_H - 4]].map(at), { size: 0.45 }));
}

// --- the rack --------------------------------------------------------------
function rack() {
  const upright = (x) => slab({ x: x - 3, y: -3, w: 6, d: 8, r: 1 }, 0, 176, { tone: "mid" }, 2, 0.6);
  const channel = (z) => slab({ x: -84, y: -3, w: 168, d: 8, r: 1 }, z, 6, { tone: "mid" }, 2, 0.6);
  add(slab({ x: -75, y: -4, w: 150, d: 1.5, r: 0 }, 26, 150, { tone: "lo" }, 1, 0));
  add(upright(-78));
  add(channel(20));
  // hold bars: one per column, with its hold magnet under the top channel
  COLS.forEach((cx, c) => {
    add(slab({ x: cx - 1.6, y: -2.5, w: 3.2, d: 2.5, r: 0.4 }, 34, 132, { tone: "mid" }, 1, 0));
    add(slab({ x: cx - 5, y: -2.5, w: 10, d: 6, r: 1.2 }, 162, 12, { tone: "mid" }, 3, 0.4) + L(k.sideSeam({ x: cx - 5, y: -2.5, w: 10, d: 6, r: 1.2 }, 168, P, 3), { tone: "faint" }));
    add(`<g data-hold="${c}">${slab({ x: cx - 4, y: 3.5, w: 8, d: 1, r: 0.3 }, 156, 5, { tone: "hi", crease: "lo" }, 1, 0)}</g>`);
  });
  // contact stacks at every crossing, with a contact that closes
  ROWS.forEach((z, r) => COLS.forEach((cx, c) => {
    const o = [slab({ x: cx + 2, y: -2.5, w: 9, d: 3.5, r: 0.5 }, z - 7, 9, { tone: "mid" }, 1, 0.3)];
    o.push(L([z - 5, z - 3, z - 1].map((zz) => k.segment([cx + 3, 1, zz], [cx + 10, 1, zz], P)).join(""), { tone: "faint" }));
    o.push(D([z - 5, z - 3, z - 1].flatMap((zz) => [at([cx + 3, 1, zz]), at([cx + 10, 1, zz])]), { size: 0.35, tone: "lo" }));
    o.push(`<g data-contact="${r}-${c}" style="opacity:0">${slab({ x: cx + 2.4, y: 1, w: 8.2, d: 1.6, r: 0.4 }, z - 6.4, 7.6, { tone: "hi", lit: true }, 2, 0)}</g>`);
    add(o.join(""));
  }));
  // select bars, each with its magnet on the left and its fingers at the columns
  ROWS.forEach((z, r) => {
    const o = [];
    o.push(slab({ x: BAR_X0, y: BAR_Y, w: BAR_X1 - BAR_X0, d: 2.4, r: 1 }, z + 2, 2.4, { tone: "hi", crease: "lo" }, 3, 0.3));
    COLS.forEach((cx) => o.push(slab({ x: cx + 6, y: BAR_Y - 0.4, w: 1, d: 1, r: 0.2 }, z - 2, 4, { tone: "mid", crease: "none" }, 1, 0)));
    add(`<g data-bar="${r}">${o.join("")}</g>`);
    add(slab({ x: -75, y: 1, w: 12, d: 8, r: 1.6 }, z - 1, 8, { tone: "mid" }, 3, 0.4) + L(k.sideSeam({ x: -75, y: 1, w: 12, d: 8, r: 1.6 }, z + 3, P, 3), { tone: "faint" }));
    add(lamp(-69, 5, z + 7, `row-${r}`));
    // bar end bracket on the right upright
    add(slab({ x: BAR_X1, y: 1, w: 3, d: 7, r: 0.5 }, z, 6.8, { tone: "mid" }, 1, 0.3) + D([at([BAR_X1 + 1.5, 8, z + 3.4])], { size: 0.4 }));
  });
  add(upright(78));
  add(channel(176));
  // column terminal blocks on the bottom channel, each with its run lamp
  COLS.forEach((cx, c) => {
    add(slab({ x: cx - 6, y: 5, w: 12, d: 3, r: 0.6 }, 26, 7, { tone: "mid" }, 2, 0.3) + D([at([cx - 4, 8, 29.5]), at([cx + 4, 8, 29.5])], { size: 0.4 }));
    add(lamp(cx, 6.5, 33, `run-${c}`));
  });
  add(k.faceTextSvg(k.sideMatrix([0, 5], 179, P, "left"), "que", { size: 2.8, tone: "lo", anchor: "middle" }));
}

// --- wiring ----------------------------------------------------------------
function wiring() {
  const fy = MARKER.y + MARKER.d;
  // marker to each select magnet, fanning up the left side
  ROWS.forEach((z, r) => add(wire([[MARKER.x + MARKER.w, -8 + r * 3, 20 + r * 7], [-86, 6.5 + r * 0.01, 20 + r * 7], [-86, 6.5, z + 3], [-75, 6.5, z + 3]])));
  // marker to the hold magnets: a bus along the top channel's face
  add(wire([[MARKER.x + MARKER.w, 10, MARKER_H - 6], [-90, 10, MARKER_H - 6], [-90, 10, 179], [-84, 5.2, 179]], "lo"));
  add(L(poly([[-84, 5.2, 179], [COLS[COLS.length - 1], 5.2, 179]]), { tone: "lo" }));
  COLS.forEach((cx) => add(wire([[cx, 5.2, 179], [cx, 3.5, 174]], "lo")));
  // connector packages leave for their services: bar end to the trunk block
  [0, 1, 2].forEach((r) => add(wire([[BAR_X1 + 3, 4.5, ROWS[r] + 3.4], [84 + r * 2, 4.5, ROWS[r] + 3.4], [84 + r * 2, 4.5 - r * 2, 1], [84 + r * 2, -48 + r * 5, 1], [TRUNK.x, -48 + r * 5, 4]], "mid")));
  // each run's line down to the state drawer
  const strip = { x: -54, y: 7, w: 116, d: 6, r: 1 };
  add(slab(strip, 0, 3, { tone: "mid" }, 2, 0.3) + L(k.planOutline(k.insetPlan(strip, 1.2), 3, P, 2), { tone: "faint" }));
  COLS.forEach((cx) => add(wire([[cx + 4, 9.5, 26], [cx + 4, 9.5, 3]], "lo")));
  add(wire([[strip.x + strip.w, 10, 1.5], [60, 10, 1.5], [60, BASE.y + BASE.d, 0], [60, BASE.y + BASE.d, -8]], "lo"));
  // the credentials drawer to the key lock
  add(wire([[-16, BASE.y + BASE.d, -8], [-16, BASE.y + BASE.d, 0], [-16, fy + 8, 0], [MARKER.x + 10, fy + 8, 0], [MARKER.x + 10, fy, 0.5]], "lo"));
}

cabinet();
trunkBlock();
marker();
rack();
wiring();

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "que drawn as a telephone crossbar switch on a cabinet. Six horizontal select bars are the packages of an environment; four vertical hold bars are runs. A marker on the left reads the agent's punched card and the user's key and tilts only the bars both allow; the run's hold magnet then closes the contacts where they cross. Connector packages leave by cable to a trunk block for their outside services. The cabinet's drawers are the backend: identity, credentials and state.",
  body: layers,
});

// ---------------------------------------------------------------------------
const live = `
const P = ${JSON.stringify(P)};
const RUNS = ${JSON.stringify(RUNS)};
const PACKAGES = ${JSON.stringify(PACKAGES)};
const AGENT_NAMES = ${JSON.stringify(AGENT_NAMES)}, USER_NAMES = ${JSON.stringify(USER_NAMES)};
const TILT = ${TILT};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const $ = (s) => svg.querySelector(s);
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const share = (t, a, b) => ease((t - a) / (b - a));
const opacity = (el, v) => { const s = v.toFixed(3); if (el.style.opacity !== s) el.style.opacity = s; };

// One clock. mount 0-2; each run sets up in 3 s from 2 + 3j: marker 0-0.8,
// select 0.8-1.4, hold 1.4-2.0, release select 2.0-2.6. All four hold 14-16,
// then runs 1 and 3 finish and release. The tour loops at 19.
const MOUNT = 2, SETUP = 3, END = 2 + SETUP * RUNS.length, LOOP = 19;
const finish = [16, 99, 16.6, 99];
const start = (j) => MOUNT + SETUP * j;
function stateAt(t) {
  const active = RUNS.findIndex((_, j) => t >= start(j) && t < start(j) + SETUP);
  const sel = PACKAGES.map((_, i) => {
    if (active < 0) return 0;
    const u = t - start(active);
    return RUNS[active].closed[i] ? share(u, 0.8 + i * 0.05, 1.3 + i * 0.05) * (1 - share(u, 2.0, 2.6)) : 0;
  });
  const held = RUNS.map((_, j) => share(t, start(j) + 1.4, start(j) + 1.9) * (1 - share(t, finish[j], finish[j] + 0.5)));
  const marker = active < 0 ? 0 : share(t - start(active), 0, 0.5) * (1 - share(t - start(active), 2.4, 2.9));
  return { active, sel, held, marker, mount: PACKAGES.map((_, i) => share(t, 0.2 + i * 0.25, 0.6 + i * 0.25)) };
}
let lastRun = 0;
function draw(t) {
  const s = stateAt(t);
  if (s.active >= 0) lastRun = s.active;
  const run = RUNS[lastRun];
  PACKAGES.forEach((_, i) => {
    opacity($('[data-lamp="row-' + i + '"]'), s.mount[i]);
    $('[data-bar="' + i + '"]').setAttribute("transform", translateAlong(P, [0, TILT * s.sel[i], -TILT * 0.6 * s.sel[i]]));
    opacity($('[data-lamp="mk-' + i + '"]'), s.active >= 0 && RUNS[s.active].closed[i] ? s.marker : 0);
  });
  RUNS.forEach((r, j) => {
    opacity($('[data-lamp="run-' + j + '"]'), s.held[j]);
    $('[data-hold="' + j + '"]').setAttribute("transform", translateAlong(P, [0, -1.2 * s.held[j], 0]));
    r.closed.forEach((c, i) => opacity($('[data-contact="' + i + '-' + j + '"]'), c ? s.held[j] : 0));
  });
  svg.querySelectorAll("[data-card]").forEach((g) => opacity(g, Number(g.dataset.card) === AGENT_NAMES.indexOf(run.agent) ? s.marker : 0));
  svg.querySelectorAll("[data-key]").forEach((g) => opacity(g, Number(g.dataset.key) === USER_NAMES.indexOf(run.user) ? s.marker : 0));
  [0, 1, 2].forEach((d) => {
    const open = d === 1 ? s.marker : d === 0 ? s.marker * 0.6 : 0;
    $('[data-drawer="' + d + '"]').setAttribute("transform", translateAlong(P, [0, 5 * open, 0]));
  });
  const holding = RUNS.filter((_, j) => s.held[j] > 0.5);
  const crossings = RUNS.reduce((sum, r, j) => sum + (s.held[j] > 0.5 ? r.count : 0), 0);
  let text;
  if (t < MOUNT) text = "mount · " + s.mount.filter((m) => m >= 1).length + " of " + PACKAGES.length + " packages on the frame";
  else if (s.active >= 0) { const r = RUNS[s.active]; text = "run " + (s.active + 1) + " · " + r.user + " · " + r.agent + " · " + r.count + " of " + PACKAGES.length + " close · " + r.ops + " ops"; }
  else text = holding.length + " runs held · " + crossings + " crosspoints closed";
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuetext", text);
}
let clock = 0, shown = 0, target = null, touring = !still.matches, frame = 0, last = 0, visible = false, idle = 0;
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  if (touring) { clock = (clock + dt) % LOOP; shown = clock; }
  else if (target !== null) { shown += (target - shown) * (1 - Math.exp(-dt / 0.35)); if (Math.abs(target - shown) < 0.01) shown = target; }
  draw(shown);
  const settled = !touring && (target === null || shown === target);
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const go = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const steer = (t) => {
  touring = false; target = t; clearTimeout(idle);
  idle = setTimeout(() => { if (!still.matches) { touring = true; clock = shown; go(); } }, 4000);
  go();
};
new IntersectionObserver((e) => { visible = e[e.length - 1].isIntersecting; if (visible) go(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("pointermove", (event) => {
  const box = svg.getBoundingClientRect();
  steer(clamp((event.clientX - box.left) / box.width) * 17);
});
const STOPS = [1.9, ...RUNS.map((_, j) => start(j) + 2.2), 15, 17.2];
stage.addEventListener("keydown", (event) => {
  const now = target ?? shown;
  let to = null;
  if (event.key === "ArrowRight") to = STOPS.find((x) => x > now + 0.05) ?? STOPS[STOPS.length - 1];
  if (event.key === "ArrowLeft") to = [...STOPS].reverse().find((x) => x < now - 0.05) ?? STOPS[0];
  if (to === null) return;
  event.preventDefault();
  steer(to);
});
if (still.matches) { shown = target = 15; }
draw(still.matches ? 15 : 0);
`;

const body = k.plateHtml({
  fig: "Fig 2",
  title: "que, a crossbar switch",
  hint: "Hover to set up runs · arrows step",
  readout: "mount · 0 of 6 packages on the frame",
  keys: [
    { mark: "raised", label: "Select bars, one per package. Its lamp lights when mount passes it" },
    { mark: "raised", label: "Marker: reads the agent's card and the user's key, and tilts only the bars both allow" },
    { mark: "lit", label: "Contacts: closed where a tilted bar crosses a held run" },
    { mark: "edge", label: "Trunk cables: connector packages out to their services" },
    { mark: "raised", label: "Cabinet drawers: the backend's identity, credentials and state" },
  ],
  caption:
    "The switch knows no call; the marker decides each one. Six example packages are on the frame. mkultra holds odoo and shopify credentials, ana holds shopify and klaviyo. The chat and deep-chat cards name every package, the sales card names orders, odoo and klaviyo. Each run closes only the crossings both allow, then holds them while the next run is set up on the same bars: four runs share one environment at once.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="que as a crossbar switch: arrow keys step through mount and four runs" aria-valuemin="0" aria-valuemax="6">${svg}</div>`,
});

const file = theme === "light" ? "que-crossbar-light.html" : "que-crossbar.html";
writeFileSync(join(HERE, file), k.pageHtml({ title: "que crossbar", theme, body, script: kitScript() + live, width: 760 }));
console.log("wrote", file, "·", RUNS.map((r) => `${r.user}/${r.agent}:${r.count}`).join(" "));
