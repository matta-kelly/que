// que as a Jacquard loom. The loom knows no pattern: the punched card (the
// agent config) picks which threads (packages) lift. Build: node build.mjs [--light]
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
// mount: every listed package is checked against the contract (a bad one stops the mount).
// access: a package whose credential the user lacks is not loaded for that user.
// narrow: the agent's `packages` can only take packages out.
// assemble (on-demand): the prompt lists the reachable packages; the base tools are
// open_package, load_operation and read_skill; an op goes out only once loaded.
// ---------------------------------------------------------------------------
const PACKAGES = [
  { name: "odoo", ops: 6, credential: true },
  { name: "shopify", ops: 5, credential: true },
  { name: "klaviyo", ops: 4, credential: true },
  { name: "orders", ops: 3, credential: false },
  { name: "notes", ops: 0, credential: false },
  { name: "docs", ops: 0, credential: false },
];
const USER = { name: "mkultra", has: ["odoo", "shopify"] };
const BASE_TOOLS = ["open_package", "load_operation", "read_skill"];
const CARDS = [
  { name: "chat", packages: null, loads: "odoo" },
  { name: "sales", packages: ["orders", "odoo", "klaviyo"], loads: "orders" },
];
const reachable = PACKAGES.map((p) => !p.credential || USER.has.includes(p.name));
const named = (card) => PACKAGES.map((p) => card.packages === null || card.packages.includes(p.name));
const MODEL = CARDS.map((card) => {
  const holes = named(card);
  const lifted = holes.map((h, i) => h && reachable[i]);
  const ops = PACKAGES.reduce((sum, p, i) => sum + (lifted[i] ? p.ops : 0), 0);
  return { name: card.name, holes, lifted, ops, loads: PACKAGES.findIndex((p) => p.name === card.loads) };
});

// ---------------------------------------------------------------------------
// The world. Threads run along +x; one lane per package along y.
// ---------------------------------------------------------------------------
const WIDTH = 600;
const HEIGHT = 400;
const LANES = [-40, -24, -8, 8, 24, 40];
const ZT = 44.5;
const LIFT = 10;

const BASE = { x: -178, y: -64, w: 330, d: 128, r: 6 };
const BASE_Z = -30;
const FOOT_H = 6;

const CREEL = { x: -168, y: -54, w: 30, d: 108, r: 2 };
const CREEL_Z = 22;
const SPOOL_X = -153;
const SPOOL_Z = CREEL_Z + 4;

const GATE_X = -112;
const COMB_X = -72;
const COMB_DROP = 8;
const HOOK_X = -19;
const HEDDLES = [22, 40, 58];
const RACE_X = 74;
const FELL_X = 88;
const BEAM = { x: 100, y: -58, w: 12, d: 116, r: 2 };
const ROLL = { x: 120, y: -56, w: 16, d: 112, r: 6 };

const P = k.fitProjection(
  [...k.boxCorners(BASE, BASE_Z - FOOT_H, 0), [-20, -60, 132], [-20, 60, 132], [-72, 60, 100]],
  WIDTH,
  HEIGHT,
  { pad: 26, azimuth: 52 },
);

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const poly = (pts) => k.pathOf(pts.map(at));
const depth = (p) => k.depthOf(p, P);

// Every drawn item has a depth key; the page paints them in key order.
const items = [];
const put = (key, svg) => items.push({ key, svg });
const slab = (plan, z, h, style, steps = 3, bevel = 0.5) => S(k.slabOf(plan, z, h, P, steps, bevel), style);
const centre = (plan, z) => [plan.x + plan.w / 2, plan.y + plan.d / 2, z];

// --- base cabinet: the backend --------------------------------------------
function cabinet() {
  const out = [`<path class="iso-halo" d="${k.haloOf(BASE, BASE_Z - FOOT_H, -BASE_Z, P)}"/>`];
  const feet = k.corners(BASE, 16).sort((a, b) => depth([...a, 0]) - depth([...b, 0]));
  for (const [x, y] of feet) {
    out.push(S(k.cylinder(x, y, 7, BASE_Z - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.2, BASE_Z - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  const seam = k.sideSeam(BASE, -6, P, 8);
  out.push(S(k.slabOf(BASE, BASE_Z, -BASE_Z, P, 8, 1.4), { tone: "mid", inner: L(seam, { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(BASE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(BASE, 9);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // ruler strip along the front edge
  const strip = { x: -150, y: BASE.y + BASE.d - 12, w: 240, d: 6, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const t = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, 0.6, [1.8, 3.2], P);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 3, 0.6]), at([strip.x + strip.w - 2, strip.y + 3, 0.6])], { size: 0.45 }));
  // label plate (the maker's plate) at the front right
  const plate = { x: 98, y: BASE.y + BASE.d - 16, w: 40, d: 10, r: 1.2 };
  out.push(S(k.slabOf(plate, 0, 0.8, P, 4), { tone: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(plate, 1.4), 0.8, P, 4), { tone: "faint" }));
  out.push(L([0, 1, 2].map((r) => k.lineOnTop([plate.x + 4, plate.y + 3 + r * 2], [plate.x + 4 + [26, 18, 22][r], plate.y + 3 + r * 2], 0.8, P)).join(""), { tone: "lo", free: true }));
  out.push(D([at([plate.x + 2.2, plate.y + 5, 0.8]), at([plate.x + plate.w - 2.2, plate.y + 5, 0.8])], { size: 0.4 }));
  return out.join("");
}

// The backend's three drawers on the front face: identity, credentials, state.
const DRAWERS = [
  { name: "identity", x: -150 },
  { name: "credentials", x: -64 },
  { name: "state", x: 22 },
];
function drawer({ x }) {
  const y = BASE.y + BASE.d;
  const front = { x, y, w: 60, d: 2.4, r: 0.8 };
  const out = [];
  out.push(slab(front, -26, 18, { tone: "mid" }, 2, 0.4));
  const fy = y + 2.4;
  // label holder: a closed outline on the front, with a card inside
  out.push(L(poly([[x + 6, fy, -12], [x + 22, fy, -12], [x + 22, fy, -18], [x + 6, fy, -18]]) + "Z", { tone: "lo" }));
  out.push(L(k.segment([x + 8, fy, -14.5], [x + 18, fy, -14.5], P), { tone: "faint", free: true }));
  // pull: two posts and a bar
  for (const px of [x + 34, x + 50]) out.push(slab({ x: px - 1, y: fy, w: 2, d: 2.6, r: 0.4 }, -16.5, 3, { tone: "mid", crease: "none" }, 2, 0));
  out.push(slab({ x: x + 32, y: fy + 2.6, w: 20, d: 1.8, r: 0.8 }, -17, 4, { tone: "mid" }, 2, 0.3));
  out.push(D([[x + 3, fy, -9], [x + 57, fy, -9], [x + 3, fy, -23], [x + 57, fy, -23]].map(at), { size: 0.42 }));
  return out.join("");
}

// --- creel and spools: the environment ------------------------------------
function creel() {
  const out = [];
  const posts = k.corners(CREEL, 3);
  const back = posts.filter(([, y]) => y < 0), front = posts.filter(([, y]) => y > 0);
  for (const [x, y] of back) out.push(S(k.cylinder(x, y, 2.2, 0, CREEL_Z, P, 18), { tone: "mid", crease: "none" }));
  out.push(slab(CREEL, CREEL_Z, 4, { tone: "mid" }, 4, 0.6));
  out.push(L(k.planOutline(k.insetPlan(CREEL, 2.5), CREEL_Z + 4, P, 4), { tone: "faint" }));
  put(depth(centre(CREEL, 0)) - 30, out.join(""));
  for (const [x, y] of front) put(depth([x, y, 0]) + 2, S(k.cylinder(x, y, 2.2, 0, CREEL_Z, P, 18), { tone: "mid", crease: "none" }));
  LANES.forEach((y) => {
    const o = [];
    o.push(S(k.cylinder(SPOOL_X, y, 6.4, SPOOL_Z, 1.4, P, 32), { tone: "mid" }));
    o.push(S(k.cylinder(SPOOL_X, y, 4.6, SPOOL_Z + 1.4, 12, P, 32), { tone: "hi", crease: "none" }));
    o.push(L([3, 5, 7, 9].map((z) => k.sideArc(SPOOL_X, y, 4.6, SPOOL_Z + 1.4 + z, P, 20)).join(""), { tone: "faint" }));
    o.push(S(k.cylinder(SPOOL_X, y, 6.4, SPOOL_Z + 13.4, 1.4, P, 32), { tone: "mid" }));
    o.push(S(k.cylinder(SPOOL_X, y, 1.2, SPOOL_Z + 14.8, 2, P, 12), { tone: "mid" }));
    o.push(D([at([SPOOL_X, y, SPOOL_Z + 16.8])], { size: 0.45 }));
    put(depth([SPOOL_X, y, 30]), o.join(""));
  });
}

// --- mount gate: a guide bar with an eyelet and a tell-tale per lane -------
function gate() {
  const bar = { x: GATE_X - 4, y: -54, w: 8, d: 108, r: 1.5 };
  put(depth([GATE_X, -50, 0]) - 1, S(k.cylinder(GATE_X, -50, 2.6, 0, 34, P, 18), { tone: "mid", crease: "none" }));
  put(depth([GATE_X, 50, 0]) + 30, S(k.cylinder(GATE_X, 50, 2.6, 0, 34, P, 18), { tone: "mid", crease: "none" }));
  put(depth(centre(bar, 34)) - 20, slab(bar, 34, 6, { tone: "mid" }, 3, 0.5) + D([-50, 50].map((y) => at([GATE_X, y, 40])), { size: 0.45 }));
  LANES.forEach((y, i) => {
    const o = [];
    o.push(S(k.cylinder(GATE_X, y, 1, 40, 3, P, 12), { tone: "mid", crease: "none" }));
    o.push(S(k.cylinder(GATE_X, y, 2, 43, 1, P, 16), { tone: "mid" }));
    o.push(L(k.ring(GATE_X, y, 1, 44, P, 12), { tone: "lo" }));
    // tell-tale: off and on, the live code fades between them
    o.push(S(k.cylinder(GATE_X - 1, y + 6, 1.6, 40, 2.4, P, 16), { tone: "lo" }));
    o.push(`<g data-tell="${i}" style="opacity:0">${S(k.cylinder(GATE_X - 1, y + 6, 1.6, 40, 2.4, P, 16), { tone: "hi", lit: true })}</g>`);
    put(depth([GATE_X, y, 40]), o.join(""));
  });
}

// --- access comb: drops over the lanes this user cannot reach --------------
function comb() {
  const post = (y) => slab({ x: COMB_X - 2, y: y - 2, w: 4, d: 4, r: 0.8 }, 0, 96, { tone: "mid" }, 2, 0.4);
  put(depth([COMB_X, -56, 0]) - 1, post(-56));
  put(depth([COMB_X, 56, 0]) + 40, post(56));
  const beam = { x: COMB_X - 2.5, y: -59, w: 5, d: 118, r: 1 };
  put(depth(centre(beam, 96)) + 40, slab(beam, 96, 4, { tone: "mid" }, 2, 0.5) + D([-56, 56].map((y) => at([COMB_X, y, 100])), { size: 0.45 }));
  const plate = { x: COMB_X - 1.5, y: -50, w: 3, d: 100, r: 0.8 };
  const o = [slab(plate, 76, 8, { tone: "hi", crease: "lo" }, 2, 0.4)];
  o.push(D([-46, -16, 16, 46].map((y) => at([COMB_X + 1.5, y, 82])), { size: 0.42 }));
  // the user's key tab on top
  o.push(slab({ x: COMB_X - 1.5, y: -6, w: 3, d: 12, r: 0.8 }, 84, 4, { tone: "mid" }, 2, 0.3));
  o.push(D([at([COMB_X + 1.5, 0, 86])], { size: 0.45 }));
  // a tooth over each lane the user cannot reach
  LANES.forEach((y, i) => {
    if (!reachable[i]) o.push(slab({ x: COMB_X - 1.2, y: y - 2, w: 2.4, d: 4, r: 0.5 }, ZT + COMB_DROP, 76 - ZT - COMB_DROP, { tone: "hi", lit: true }, 2, 0.3));
  });
  // the comb is drawn in front of the lanes behind it; its own thread crossing is short
  put(depth([COMB_X, 0, 80]) + 6, `<g data-part="comb">${o.join("")}</g>`);
}

// --- Jacquard head: card prism on top, a hook per lane ---------------------
function head() {
  const posts = [[-30, -57], [-8, -57], [-30, 57], [-8, 57]];
  for (const [x, y] of posts) put(depth([x, y, 0]) + (y > 0 ? 60 : -1), slab({ x: x - 2, y: y - 2, w: 4, d: 4, r: 0.8 }, 0, 100, { tone: "mid" }, 2, 0.4));
  for (const y of [-57, 57]) {
    put(depth([-19, y, 100]) + (y > 0 ? 60 : -2), slab({ x: -32, y: y - 2.5, w: 26, d: 5, r: 1 }, 100, 5, { tone: "mid" }, 2, 0.5) + D([-28, -10].map((x) => at([x, y, 105])), { size: 0.45 }));
  }
  // needle board the hooks pass under, spanning the side frames
  const board = { x: -26, y: -54.5, w: 14, d: 109, r: 1 };
  put(depth(centre(board, 100)) + 40, slab(board, 96, 4, { tone: "mid" }, 2, 0.5) + L(LANES.map((y) => k.ring(HOOK_X, y, 1, 100, P, 10)).join(""), { tone: "lo" }) + k.faceTextSvg(k.sideMatrix([0, 54.5], 98.6, P, "left"), "que", { size: 2.6, tone: "lo", anchor: "middle" }));
  // card prism with its bearings, and the card that presses down
  const prism = { x: -26, y: -50, w: 14, d: 100, r: 1.5 };
  const bearings = [-53, 53].map((y) => S(k.cylinder(-19, y, 3.2, 100, 12, P, 20), { tone: "mid" }) + L(k.ring(-19, y, 1.2, 112, P, 10), { tone: "lo" }));
  put(depth([-19, -53, 106]) + 40, bearings[0]);
  const card = (m, index) => {
    const plan = { x: -27.5, y: -47, w: 17, d: 94, r: 0.8 };
    const holes = LANES.map((y, i) => (m.holes[i] ? k.ring(HOOK_X, y, 1.6, 113.4, P, 14) : "")).join("");
    const lacing = k.lineOnTop([plan.x + 2, -47], [plan.x + 2, 47], 113.4, P) + k.lineOnTop([plan.x + plan.w - 2, -47], [plan.x + plan.w - 2, 47], 113.4, P);
    return `<g data-card="${index}" style="opacity:${index === 0 ? 1 : 0}">${slab(plan, 112, 1.4, { tone: "hi", crease: "lo" }, 2, 0)}${L(lacing, { tone: "faint" })}${L(holes, { tone: "lo" })}</g>`;
  };
  put(depth([-19, 0, 112]) + 41, `<g data-part="press">${slab(prism, 104, 8, { tone: "mid" }, 2, 0.6)}${MODEL.map(card).join("")}</g>`);
  put(depth([-19, 53, 106]) + 61, bearings[1]);
  // hooks: one rod per lane, lifted when its card hole is punched
  LANES.forEach((y, i) => {
    const o = [];
    o.push(slab({ x: HOOK_X - 0.6, y: y - 0.6, w: 1.2, d: 1.2, r: 0.3 }, ZT + 2.5, 86 - ZT - 2.5, { tone: "mid", crease: "none" }, 1, 0));
    o.push(slab({ x: HOOK_X - 1.4, y: y - 1.6, w: 2.8, d: 3.2, r: 0.6 }, ZT - 1.5, 4, { tone: "hi", crease: "lo" }, 2, 0.2));
    o.push(slab({ x: HOOK_X - 1.6, y: y - 1.6, w: 3.2, d: 3.2, r: 0.6 }, 86, 2, { tone: "mid" }, 2, 0));
    put(depth([HOOK_X, y, 60]) + 0.5, `<g data-hook="${i}">${o.join("")}</g>`);
  });
}

// --- heddle banks: prompt, tools, middleware -------------------------------
function heddles() {
  HEDDLES.forEach((x, b) => {
    const post = (y) => slab({ x: x - 1.5, y: y - 1.5, w: 3, d: 3, r: 0.6 }, 0, 76, { tone: "mid" }, 2, 0.3);
    put(depth([x, -62, 0]) - 1, post(-62));
    put(depth([x, 62, 0]) + 50, post(62));
    const bar = (z) => slab({ x: x - 1.5, y: -63.5, w: 3, d: 127, r: 0.6 }, z, 3, { tone: "mid" }, 2, 0.3);
    put(depth([x, 0, 30]) - 30, bar(30));
    const wires = LANES.map((y) => k.segment([x, y, 33], [x, y, 70], P)).join("");
    const eyes = LANES.map((y) => at([x, y, ZT + LIFT]));
    const ends = LANES.flatMap((y) => [at([x, y, 33]), at([x, y, 70])]);
    put(depth([x, 0, 50]) - 0.5, L(wires, { tone: "faint" }) + D(eyes, { size: 0.55, tone: "lo" }) + D(ends, { size: 0.4, tone: "lo" }));
    // lamps on the top bar: prompt lists packages, tools carries the three base tools
    // plus an op per loaded package, middleware has one: OperationsInReach
    const lamps = [];
    if (b === 0) LANES.forEach((y, i) => lamps.push({ y, id: `prompt-${i}` }));
    if (b === 1) {
      [-58, -53, -48].forEach((y, j) => lamps.push({ y, id: `base-${j}` }));
      LANES.forEach((y, i) => lamps.push({ y, id: `op-${i}` }));
    }
    if (b === 2) lamps.push({ y: -53, id: "middleware" });
    const o = [bar(70)];
    for (const { y, id } of lamps) {
      o.push(S(k.cylinder(x, y, 1.5, 73, 1.6, P, 14), { tone: "lo" }));
      o.push(`<g data-lamp="${id}" style="opacity:0">${S(k.cylinder(x, y, 1.5, 73, 1.6, P, 14), { tone: "hi", lit: true })}</g>`);
    }
    put(depth([x, 0, 70]) + 30, o.join(""));
  });
}

// --- run: race, shuttle, beater, cloth ------------------------------------
function loomFront() {
  const race = { x: RACE_X - 4, y: -66, w: 10, d: 132, r: 1 };
  for (const y of [-62, 62]) put(depth([RACE_X, y, 0]) + (y > 0 ? 30 : -1), slab({ x: RACE_X - 2, y: y - 2, w: 4, d: 4, r: 0.8 }, 0, 48, { tone: "mid" }, 2, 0.4));
  put(depth(centre(race, 48)) - 20, slab(race, 48, 3.5, { tone: "mid" }, 2, 0.5) + L(k.lineOnTop([RACE_X + 4, -66], [RACE_X + 4, 66], 51.5, P), { tone: "faint" }));
  // shuttle boxes at both ends
  for (const y of [-66, 58]) put(depth([RACE_X, y + 4, 52]) + (y > 0 ? 30 : -1), slab({ x: RACE_X - 4, y, w: 10, d: 8, r: 1 }, 51.5, 6, { tone: "mid" }, 2, 0.4));
  // the shuttle: the run, carrying the weft across
  const shuttle = slab({ x: RACE_X - 2, y: -6, w: 4, d: 12, r: 1.9 }, 51.5, 3.2, { tone: "hi", lit: true }, 4, 0.3) + L(k.lineOnTop([RACE_X, -3], [RACE_X, 3], 54.7, P), { tone: "lo" });
  put(depth([RACE_X, 0, 53]) + 20, `<g data-part="shuttle">${shuttle}</g>`);
  // breast beam on standards, and the cloth
  for (const y of [-56, 56]) put(depth([106, y, 0]) + (y > 0 ? 30 : -1), slab({ x: 103, y: y - 2.5, w: 6, d: 5, r: 1 }, 0, 40, { tone: "mid" }, 2, 0.4));
  put(depth(centre(BEAM, 40)) - 5, slab(BEAM, 40, 12, { tone: "mid" }, 3, 0.6) + D([-54, 54].map((y) => at([106, y, 52])), { size: 0.45 }));
  const cloth = { x: FELL_X, y: -46, w: BEAM.x + BEAM.w - FELL_X, d: 92, r: 0 };
  put(depth(centre(cloth, 54)) + 1, `${slab(cloth, ZT + LIFT - 1.4, 1.4, { tone: "hi", crease: "lo" }, 1, 0)}<g data-part="weft"></g>`);
  // take-up roll below, with its brackets
  for (const y of [-56, 56]) put(depth([128, y, 0]) + (y > 0 ? 30 : -1), slab({ x: 125, y: y - 2.5, w: 6, d: 5, r: 1 }, 0, 26, { tone: "mid" }, 2, 0.4));
  put(depth(centre(ROLL, 20)) - 4, slab(ROLL, 16, 14, { tone: "hi", crease: "lo" }, 6, 0.5) + L([4, 8, 12].map((z) => k.sideSeam(ROLL, 16 + z, P, 6)).join(""), { tone: "faint" }));
  // cloth runs from the beam down to the roll
  put(depth([116, 0, 40]) + 1, L(poly([[BEAM.x + BEAM.w, -46, 52], [ROLL.x, -46, 30]]) + poly([[BEAM.x + BEAM.w, 46, 52], [ROLL.x, 46, 30]]), { tone: "lo" }));
}

// --- threads: one per lane, drawn live -------------------------------------
const route = (y, lift) => {
  const z = ZT + lift;
  return {
    feed: [[SPOOL_X + 4.6, y, SPOOL_Z + 8], [GATE_X, y, ZT], [COMB_X, y, ZT]],
    hook: [[COMB_X, y, ZT], [HOOK_X, y, z]],
    shed: [[HOOK_X, y, z], [FELL_X, y, z]],
  };
};
function threads() {
  LANES.forEach((y, i) => {
    const r = route(y, 0);
    put(depth([-130, y, ZT]), `<path data-thread="feed-${i}" class="iso-line" data-tone="hi" style="stroke-width:1.1" d="${poly(r.feed)}"/>`);
    put(depth([-45, y, ZT]), `<path data-thread="hook-${i}" class="iso-line" data-tone="hi" style="stroke-width:1.1" d="${poly(r.hook)}"/>`);
    put(depth([35, y, ZT]), `<path data-thread="shed-${i}" class="iso-line" data-tone="hi" style="stroke-width:1.1" d="${poly(r.shed)}"/>`);
  });
}

const cabinetSvg = cabinet();
creel();
gate();
comb();
head();
heddles();
loomFront();
threads();
items.sort((a, b) => a.key - b.key);

const drawers = DRAWERS.map((d, i) => `<g data-drawer="${i}">${drawer(d)}</g>`).join("");

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "que drawn as a Jacquard loom on a cabinet. Six spools of thread on a creel are the packages of an environment. Each thread passes an eyelet with a tell-tale (mount), then a comb that drops over the threads the user has no credential for (access), then a hook that a punched card lifts (the agent config), through three heddle banks (prompt, tools, middleware) to the shuttle and the cloth (run). Three drawers in the cabinet are the backend: identity, credentials and state.",
  body: [cabinetSvg, drawers, ...items.map((item) => item.svg)],
});

const live = `
const P = ${JSON.stringify(P)};
const LANES = ${JSON.stringify(LANES)};
const ZT = ${ZT}, LIFT = ${LIFT}, COMB_DROP = ${COMB_DROP}, RACE_X = ${RACE_X}, FELL_X = ${FELL_X}, CLOTH_END = ${BEAM.x + BEAM.w};
const PACKAGES = ${JSON.stringify(PACKAGES)};
const USER = ${JSON.stringify(USER)};
const BASE_TOOLS = ${JSON.stringify(BASE_TOOLS)};
const MODEL = ${JSON.stringify(MODEL)};
const reachable = ${JSON.stringify(reachable)};
const ROUTE = ${route.toString()};
const SPOOL_X = ${SPOOL_X}, SPOOL_Z = ${SPOOL_Z}, GATE_X = ${GATE_X}, COMB_X = ${COMB_X}, HOOK_X = ${HOOK_X};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const $ = (s) => svg.querySelector(s);
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const poly = (pts) => pathOf(pts.map((p) => iso(p, P)));
const partial = (pts, t) => {
  if (t >= 1) return pts;
  const len = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(...pts[i].map((v, j) => v - pts[i - 1][j])); len.push(d); total += d; }
  let left = total * t; const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (left >= len[i - 1]) { out.push(pts[i]); left -= len[i - 1]; continue; }
    const f = left / len[i - 1]; out.push(pts[i].map((v, j) => pts[i - 1][j] + (v - pts[i - 1][j]) * f)); break;
  }
  return out;
};

// Phases on one clock: mount, access, assemble, run. A tour plays them and swaps the card.
const PHASES = [
  { name: "mount", from: 0, to: 4.2 },
  { name: "access", from: 4.2, to: 6.8 },
  { name: "assemble", from: 6.8, to: 9.6 },
  { name: "run", from: 9.6, to: 15.6 },
];
const LOOP = 18;
let clock = 0, shown = 0, card = 0, touring = !still.matches, frame = 0, last = 0, visible = false, idle = 0;
let target = null;
const share = (t, a, b) => ease((t - a) / (b - a));
function stateAt(t) {
  const m = MODEL[card];
  return {
    mount: LANES.map((_, i) => share(t, 0.3 + i * 0.6, 0.3 + i * 0.6 + 0.9)),
    access: share(t, 4.4, 6.0),
    press: Math.sin(Math.PI * clamp((t - 6.9) / 1.0)),
    lift: m.lifted.map((l, i) => (m.holes[i] ? share(t, 7.5 + i * 0.12, 8.5 + i * 0.12) : 0)),
    fade: share(t, 7.6, 8.8),
    shuttle: clamp((t - 10.0) / 2.2),
    loaded: share(t, 12.4, 13.0),
    weave: clamp((t - 10.0) / 5.6),
    mw: share(t, 9.7, 10.2),
    drawers: [share(t, 4.4, 5.0) * (1 - share(t, 6.0, 6.6)), share(t, 4.6, 5.2) * (1 - share(t, 6.2, 6.8)), share(t, 13.0, 13.6) * (1 - share(t, 15.0, 15.6))],
  };
}
const opacity = (el, v) => { const s = v.toFixed(3); if (el.style.opacity !== s) el.style.opacity = s; };
const weft = $('[data-part="weft"]');
function draw(t) {
  const s = stateAt(t), m = MODEL[card];
  LANES.forEach((y, i) => {
    const r = ROUTE(y, s.lift[i] * LIFT);
    const grown = s.mount[i];
    const full = [...r.feed, ...r.hook.slice(1), ...r.shed.slice(1)];
    const shown = partial(full, grown);
    const nFeed = r.feed.length, nHook = nFeed + 1;
    const feed = shown.slice(0, nFeed), hook = shown.length > nFeed ? shown.slice(nFeed - 1, nHook) : [], shed = shown.length > nHook ? shown.slice(nHook - 1) : [];
    const blocked = !reachable[i];
    const unnamed = !m.holes[i] || blocked;
    const el = (n) => $('[data-thread="' + n + '-' + i + '"]');
    el("feed").setAttribute("d", feed.length > 1 ? poly(feed) : "");
    el("hook").setAttribute("d", hook.length > 1 ? poly(hook) : "");
    el("shed").setAttribute("d", shed.length > 1 ? poly(shed) : "");
    opacity(el("hook"), blocked ? 1 - s.access : 1);
    opacity(el("shed"), blocked ? 1 - s.access : unnamed ? 1 - s.fade : 1);
    opacity($('[data-tell="' + i + '"]'), clamp(grown * 3 - 2));
    $('[data-hook="' + i + '"]').setAttribute("transform", translateAlong(P, [0, 0, s.lift[i] * LIFT]));
    opacity($('[data-lamp="prompt-' + i + '"]'), m.lifted[i] ? s.fade : 0);
    opacity($('[data-lamp="op-' + i + '"]'), i === m.loads ? s.loaded : 0);
  });
  [0, 1, 2].forEach((j) => opacity($('[data-lamp="base-' + j + '"]'), s.fade));
  opacity($('[data-lamp="middleware"]'), s.mw);
  $('[data-part="comb"]').setAttribute("transform", translateAlong(P, [0, 0, -COMB_DROP * s.access]));
  $('[data-part="press"]').setAttribute("transform", translateAlong(P, [0, 0, -2.5 * s.press]));
  svg.querySelectorAll("[data-card]").forEach((g) => opacity(g, Number(g.dataset.card) === card ? 1 : 0));
  // the shuttle crosses twice, then rests in its box
  const pass = s.shuttle * 2, leg = pass % 1, dir = Math.floor(pass) % 2 === 0;
  const y = s.shuttle >= 1 ? -60 : (dir ? -60 + 120 * ease(leg) : 60 - 120 * ease(leg));
  $('[data-part="shuttle"]').setAttribute("transform", translateAlong(P, [0, y, 0]));
  s.drawers.forEach((v, j) => $('[data-drawer="' + j + '"]').setAttribute("transform", translateAlong(P, [0, 5 * v, 0])));
  // woven rows on the cloth: one more each pass, drifting toward the beam
  const rows = [];
  const zc = ZT + LIFT;
  const lifted = m.lifted.map((l, i) => l && s.lift[i] > 0.5);
  const any = lifted.some(Boolean);
  if (any) {
    const advance = s.weave * 6;
    for (let x = FELL_X + 1 + (advance % 2); x < CLOTH_END - 0.5; x += 2) rows.push(pathOf([iso([x, -46, zc], P), iso([x, 46, zc], P)]));
  }
  weft.innerHTML = rows.length ? '<path class="iso-line" data-tone="faint" d="' + rows.join("") + '"/>' : "";
  // the readout comes from the same model
  const phase = PHASES.findLastIndex((p) => t >= p.from) ;
  const reach = reachable.filter(Boolean).length;
  const inPrompt = m.lifted.filter(Boolean).length;
  const ops = s.loaded > 0.5 ? 1 : 0;
  const texts = [
    "mount · " + LANES.filter((_, i) => s.mount[i] >= 1).length + " of " + PACKAGES.length + " packages pass",
    "access · " + USER.name + " reaches " + reach + " of " + PACKAGES.length,
    "assemble · " + m.name + " · " + inPrompt + " in prompt · " + BASE_TOOLS.length + " tools",
    "run · " + m.name + " · " + (BASE_TOOLS.length + ops) + " tools sent, " + ops + " of " + m.ops + " ops",
  ];
  const text = texts[Math.max(0, phase)];
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuetext", text);
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  if (touring) {
    clock += dt;
    if (clock >= LOOP) { clock = 0; card = (card + 1) % MODEL.length; }
    shown = clock;
  } else if (target !== null) {
    shown += (target - shown) * (1 - Math.exp(-dt / 0.35));
    if (Math.abs(target - shown) < 0.01) shown = target;
  }
  draw(shown);
  const settled = !touring && (target === null || shown === target);
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const steer = (t) => {
  touring = false; target = t; clearTimeout(idle);
  idle = setTimeout(() => { if (!still.matches) { touring = true; clock = shown; run(); } }, 4000);
  run();
};
new IntersectionObserver((e) => { visible = e[e.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("pointermove", (event) => {
  const box = svg.getBoundingClientRect();
  steer(clamp((event.clientX - box.left) / box.width) * 15.6);
});
stage.addEventListener("click", () => { card = (card + 1) % MODEL.length; steer(target ?? shown); });
stage.addEventListener("keydown", (event) => {
  const ends = PHASES.map((p) => p.to);
  const here = ends.findIndex((e) => (target ?? shown) < e - 0.01);
  let to = null;
  if (event.key === "ArrowRight") to = ends[Math.min(ends.length - 1, here < 0 ? ends.length - 1 : here)];
  if (event.key === "ArrowLeft") to = here <= 0 ? 0 : ends[here - 2] ?? 0;
  if (event.key === "c" || event.key === "C" || event.key === " ") { card = (card + 1) % MODEL.length; to = target ?? shown; }
  if (to === null) return;
  event.preventDefault();
  steer(to);
});
if (still.matches) { shown = 15.6; target = 15.6; }
draw(still.matches ? 15.6 : 0);
`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: "que, a Jacquard loom",
  hint: "Hover to run it · click to swap the card",
  readout: "mount · 0 of 6 packages pass",
  keys: [
    { mark: "raised", label: "Spools on the creel: the environment's packages" },
    { mark: "lit", label: "Tell-tales: mount checks each package. Comb teeth: access stops what the user has no credential for" },
    { mark: "flat", label: "Punched card: the agent config. Hooks lift only what it names, and only from what reached them" },
    { mark: "raised", label: "Heddle banks: prompt, tools (three base tools plus loaded ops), middleware" },
    { mark: "lit", label: "Shuttle and cloth: run. Drawers below: the backend's identity, credentials and state" },
  ],
  caption:
    "The loom knows no pattern; the card does. Six example packages are mounted. mkultra has no klaviyo credential, so the comb stops that thread. The chat card names every package and lifts five; the sales card names orders, odoo and klaviyo and lifts two, because a config narrows and never widens. On-demand loading sends three base tools, and an operation only after the model loads it.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="que as a loom: arrow keys step through mount, access, assemble and run; C swaps the card" aria-valuemin="0" aria-valuemax="4">${svg}</div>`,
});

const file = theme === "light" ? "que-loom-light.html" : "que-loom.html";
writeFileSync(join(HERE, file), k.pageHtml({ title: "que loom", theme, body, script: kitScript() + live, width: 760 }));
console.log("wrote", file, "·", items.length, "items");
