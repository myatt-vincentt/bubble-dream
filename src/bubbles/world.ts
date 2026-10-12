// The bubbles — pure, unit-tested (world.test.ts). No drawing here.
//
// Bubbles drift on a slow breeze (a gentle rise in it), bounce softly off the
// screen edges and each other (a bump squashes them for a moment), and pop
// when touched. A kiss blows a new one at a free spot; past BUBBLE.max the
// oldest pops to make room. When the last one has popped, a fresh bubble
// rises from below the screen after a moment, so the sky is never empty.
import { BUBBLE, FLOAT, POP, RISE } from "./config";

export type Pt = { x: number; y: number };

export type Bubble = {
  id: number;
  pos: Pt;
  vel: Pt;
  /** Full radius (px); it grows into it after birth. */
  r: number;
  /** Seconds alive, and seconds left safe from popping. */
  age: number;
  immune: number;
  /** A per-bubble phase for the breeze and the film's swirl. */
  phase: number;
  /** Squash from a bump 0..1, and its direction (unit). */
  squash: number;
  squashDir: Pt;
  /** Rising in from below the screen (the edges don't hold it yet). */
  rising: boolean;
  /** Seconds since it popped (−1: whole). */
  pop: number;
};

export type World = {
  bubbles: Bubble[];
  nextId: number;
  /** Seconds until a new bubble rises (−1: none due). */
  respawnIn: number;
  /** Counters, for the HUD's walkthrough. */
  kisses: number;
  pops: number;
};

/**
 * A bump this much (px/s) faster than SQUASH_MIN squashes a bubble fully;
 * slower nudges (the breeze leaning it on an edge) don't squash at all.
 */
const SQUASH_SPEED = 120 / FLOAT.squash;
const SQUASH_MIN = 30;

const between = ([a, b]: readonly [number, number], random: () => number) =>
  a + (b - a) * random();

/** How far it has grown in, 0 → 1 with an elastic overshoot. */
export const grown = (b: Bubble) => {
  const u = Math.min(1, b.age / BUBBLE.grow);
  if (u >= 1) return 1;
  // Ease-out-elastic, gentle.
  return 1 - Math.cos(u * Math.PI * 2.5) * (1 - u) ** 2.2;
};

/** The radius it shows now. */
export const radius = (b: Bubble) => b.r * grown(b);

const whole = (b: Bubble) => b.pop < 0;

const make = (
  w: World,
  pos: Pt,
  r: number,
  random: () => number,
  rising = false,
): Bubble => {
  const b: Bubble = {
    id: w.nextId++,
    pos,
    vel: { x: 0, y: rising ? -RISE.speed : 0 },
    r,
    age: rising ? BUBBLE.grow : 0,
    immune: BUBBLE.immune,
    phase: random() * Math.PI * 2,
    squash: 0,
    squashDir: { x: 1, y: 0 },
    rising,
    pop: -1,
  };
  w.bubbles.push(b);
  return b;
};

/** A new world: one big bubble growing in, a little above the middle. */
export const createWorld = (
  width: number,
  height: number,
  random: () => number,
): World => {
  const w: World = {
    bubbles: [],
    nextId: 1,
    respawnIn: -1,
    kisses: 0,
    pops: 0,
  };
  make(w, { x: width / 2, y: height * 0.42 }, BUBBLE.first, random);
  return w;
};

/**
 * The freest spot for a bubble of radius `r`: of a few random candidates, the
 * one furthest from the other bubbles' edges and from `avoid` (hands).
 */
export const freeSpot = (
  w: World,
  r: number,
  width: number,
  height: number,
  random: () => number,
  avoid: readonly Pt[] = [],
): Pt => {
  const m = r + BUBBLE.margin;
  let best: Pt = { x: width / 2, y: height / 2 };
  let bestScore = -Infinity;
  for (let i = 0; i < 24; i++) {
    const p = {
      x: m + random() * Math.max(1, width - 2 * m),
      y: m + random() * Math.max(1, height - 2 * m),
    };
    let score = Infinity;
    for (const b of w.bubbles)
      if (whole(b))
        score = Math.min(
          score,
          Math.hypot(p.x - b.pos.x, p.y - b.pos.y) - b.r - r,
        );
    for (const a of avoid)
      score = Math.min(score, Math.hypot(p.x - a.x, p.y - a.y) - r);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
};

/** Start a bubble popping (if it's whole). */
export const popBubble = (w: World, b: Bubble) => {
  if (!whole(b)) return false;
  b.pop = 0;
  w.pops++;
  return true;
};

/**
 * A kiss: blow a new bubble at a free spot. Past BUBBLE.max, the oldest pops
 * first. Returns the new bubble and any it popped.
 */
export const blowBubble = (
  w: World,
  width: number,
  height: number,
  random: () => number,
  avoid: readonly Pt[] = [],
): { bubble: Bubble; popped: Bubble[] } => {
  const popped: Bubble[] = [];
  const alive = w.bubbles.filter(whole);
  if (alive.length >= BUBBLE.max && popBubble(w, alive[0]))
    popped.push(alive[0]);
  const r = between(BUBBLE.radius, random);
  const pos = freeSpot(w, r, width, height, random, avoid);
  w.kisses++;
  w.respawnIn = -1;
  return { bubble: make(w, pos, r, random), popped };
};

/**
 * Pop every whole, grown-in bubble that `p` touches (within `slack` px of its
 * edge). Returns those popped.
 */
export const popAt = (w: World, p: Pt, slack = 0): Bubble[] => {
  const out: Bubble[] = [];
  for (const b of w.bubbles) {
    if (!whole(b) || b.immune > 0) continue;
    if (Math.hypot(p.x - b.pos.x, p.y - b.pos.y) <= radius(b) + slack)
      if (popBubble(w, b)) out.push(b);
  }
  return out;
};

export type WorldEvents = {
  /** A bubble rose in to keep the sky from being empty. */
  risen?: Bubble;
};

/** Advance one frame on a `width` × `height` screen; `t`: the clock. */
export const stepWorld = (
  w: World,
  dt: number,
  t: number,
  width: number,
  height: number,
  random: () => number,
): WorldEvents => {
  const ev: WorldEvents = {};
  const k = 1 - Math.exp(-FLOAT.follow * dt);
  for (const b of w.bubbles) {
    if (!whole(b)) {
      b.pop += dt;
      continue;
    }
    b.age += dt;
    b.immune = Math.max(0, b.immune - dt);
    b.squash *= Math.exp(-FLOAT.settle * dt);
    if (b.rising) {
      // Rising in: straight up until it's fully on screen.
      if (b.pos.y + b.r < height - BUBBLE.margin) b.rising = false;
    } else {
      // The breeze: a slow, smooth field, different for each bubble.
      const bx =
        Math.sin(t * 0.21 + b.phase) +
        0.6 * Math.sin(t * 0.47 + b.pos.y * 0.004);
      const by =
        Math.cos(t * 0.17 + b.phase * 1.3) +
        0.5 * Math.sin(t * 0.38 + b.pos.x * 0.005);
      b.vel.x += (bx * FLOAT.breeze - b.vel.x) * k;
      b.vel.y += (by * FLOAT.breeze * 0.8 - FLOAT.lift - b.vel.y) * k;
    }
    b.pos.x += b.vel.x * dt;
    b.pos.y += b.vel.y * dt;
    // Soft walls: a bounce squashes it by how hard it hit (resting against
    // an edge doesn't).
    const r = radius(b);
    const bounce = (n: Pt, speed: number) => {
      const hard = Math.max(0, speed - SQUASH_MIN);
      b.squash = Math.min(1, b.squash + Math.min(0.6, hard / SQUASH_SPEED));
      b.squashDir = n;
    };
    if (b.pos.x - r < 0) {
      b.pos.x = r;
      if (b.vel.x < 0) {
        bounce({ x: 1, y: 0 }, -b.vel.x);
        b.vel.x = -b.vel.x * FLOAT.restitution;
      }
    } else if (b.pos.x + r > width) {
      b.pos.x = width - r;
      if (b.vel.x > 0) {
        bounce({ x: -1, y: 0 }, b.vel.x);
        b.vel.x = -b.vel.x * FLOAT.restitution;
      }
    }
    if (b.pos.y - r < 0) {
      b.pos.y = r;
      if (b.vel.y < 0) {
        bounce({ x: 0, y: 1 }, -b.vel.y);
        b.vel.y = -b.vel.y * FLOAT.restitution;
      }
    } else if (!b.rising && b.pos.y + r > height) {
      b.pos.y = height - r;
      if (b.vel.y > 0) {
        bounce({ x: 0, y: -1 }, b.vel.y);
        b.vel.y = -b.vel.y * FLOAT.restitution;
      }
    }
  }
  // Bumps: push overlapping bubbles apart and bounce them off each other.
  const alive = w.bubbles.filter(whole);
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i];
      const b = alive[j];
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const d = Math.max(1e-6, Math.hypot(dx, dy));
      const overlap = radius(a) + radius(b) - d;
      if (overlap <= 0) continue;
      const n = { x: dx / d, y: dy / d };
      // Bigger bubbles move less.
      const ma = a.r * a.r;
      const mb = b.r * b.r;
      const sa = mb / (ma + mb);
      const sb = ma / (ma + mb);
      a.pos.x -= n.x * overlap * sa;
      a.pos.y -= n.y * overlap * sa;
      b.pos.x += n.x * overlap * sb;
      b.pos.y += n.y * overlap * sb;
      const closing = (a.vel.x - b.vel.x) * n.x + (a.vel.y - b.vel.y) * n.y;
      if (closing > 0) {
        const j2 = (1 + FLOAT.restitution) * closing;
        a.vel.x -= n.x * j2 * sa;
        a.vel.y -= n.y * j2 * sa;
        b.vel.x += n.x * j2 * sb;
        b.vel.y += n.y * j2 * sb;
      }
      const hit = Math.min(
        0.6,
        Math.max(0, closing - SQUASH_MIN) / SQUASH_SPEED,
      );
      a.squash = Math.min(1, a.squash + hit);
      a.squashDir = { x: -n.x, y: -n.y };
      b.squash = Math.min(1, b.squash + hit);
      b.squashDir = n;
    }
  }
  w.bubbles = w.bubbles.filter((b) => b.pop < POP.time);
  // Never an empty sky: once the last one has gone, a new one rises.
  if (!w.bubbles.some(whole)) {
    if (w.respawnIn < 0) w.respawnIn = RISE.delay;
    w.respawnIn -= dt;
    if (w.respawnIn <= 0) {
      w.respawnIn = -1;
      const r = between(BUBBLE.radius, random);
      const x =
        r +
        BUBBLE.margin +
        random() * Math.max(1, width - 2 * (r + BUBBLE.margin));
      ev.risen = make(w, { x, y: height + r }, r, random, true);
    }
  }
  return ev;
};
