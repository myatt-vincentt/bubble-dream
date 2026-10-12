import { describe, expect, it } from "vitest";

import { BUBBLE, KISS, POP, RISE } from "./config";
import { createKiss, stepKiss } from "./kiss";
import {
  blowBubble,
  createWorld,
  popAt,
  radius,
  stepWorld,
  type World,
} from "./world";

const W = 720;
const H = 1280;
const random = (() => {
  let s = 7;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
})();

const run = (w: World, seconds: number, from = 0) => {
  const risen = [];
  for (let t = from; t < from + seconds; t += 1 / 30) {
    const ev = stepWorld(w, 1 / 30, t, W, H, random);
    if (ev.risen) risen.push(ev.risen);
  }
  return risen;
};
const whole = (w: World) => w.bubbles.filter((b) => b.pop < 0);

describe("bubbles", () => {
  it("starts with one bubble that grows in", () => {
    const w = createWorld(W, H, random);
    expect(w.bubbles.length).toBe(1);
    expect(radius(w.bubbles[0])).toBe(0);
    run(w, BUBBLE.grow + 0.1);
    expect(radius(w.bubbles[0])).toBeCloseTo(BUBBLE.first);
  });

  it("a kiss blows a new bubble at a free spot, inside the screen", () => {
    const w = createWorld(W, H, random);
    run(w, 1);
    for (let i = 0; i < 3; i++) {
      const { bubble } = blowBubble(w, W, H, random);
      expect(bubble.pos.x - bubble.r).toBeGreaterThanOrEqual(0);
      expect(bubble.pos.x + bubble.r).toBeLessThanOrEqual(W);
      expect(bubble.pos.y - bubble.r).toBeGreaterThanOrEqual(0);
      expect(bubble.pos.y + bubble.r).toBeLessThanOrEqual(H);
      // Not on top of another.
      for (const o of whole(w))
        if (o !== bubble)
          expect(
            Math.hypot(o.pos.x - bubble.pos.x, o.pos.y - bubble.pos.y),
          ).toBeGreaterThan(Math.max(o.r, bubble.r));
    }
    expect(whole(w).length).toBe(4);
  });

  it("past the cap, the oldest pops to make room", () => {
    const w = createWorld(W, H, random);
    const first = w.bubbles[0];
    for (let i = 0; i < BUBBLE.max; i++) blowBubble(w, W, H, random);
    expect(first.pop).toBeGreaterThanOrEqual(0);
    expect(whole(w).length).toBe(BUBBLE.max);
  });

  it("drifts but stays on screen, and bumping bubbles don't overlap for long", () => {
    const w = createWorld(W, H, random);
    for (let i = 0; i < BUBBLE.max - 1; i++) blowBubble(w, W, H, random);
    run(w, 20);
    const alive = whole(w);
    for (const b of alive) {
      expect(b.pos.x - b.r).toBeGreaterThanOrEqual(-1);
      expect(b.pos.x + b.r).toBeLessThanOrEqual(W + 1);
      expect(b.pos.y - b.r).toBeGreaterThanOrEqual(-1);
      expect(b.pos.y + b.r).toBeLessThanOrEqual(H + 1);
    }
    for (let i = 0; i < alive.length; i++)
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i];
        const b = alive[j];
        expect(
          Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y),
        ).toBeGreaterThan((a.r + b.r) * 0.9);
      }
  });
});

describe("squash", () => {
  it("a bubble resting against an edge settles round (only impacts squash)", () => {
    const w = createWorld(W, H, random);
    const b = w.bubbles[0];
    run(w, 1);
    // Pinned to the top edge, drifting up into it.
    for (let t = 0; t < 6; t += 1 / 30) {
      b.pos.y = b.r;
      b.vel.y = -4;
      stepWorld(w, 1 / 30, t, W, H, random);
    }
    expect(b.squash).toBeLessThan(0.1);
  });
});

describe("popping", () => {
  it("a touch pops the bubble under it (not one just born)", () => {
    const w = createWorld(W, H, random);
    const b = w.bubbles[0];
    expect(popAt(w, b.pos).length).toBe(0); // still immune, growing in
    run(w, BUBBLE.immune + 0.1);
    expect(popAt(w, { x: b.pos.x + b.r * 2, y: b.pos.y }).length).toBe(0);
    expect(popAt(w, b.pos)).toEqual([b]);
    expect(w.pops).toBe(1);
    run(w, POP.time + 0.05, 1);
    expect(w.bubbles.includes(b)).toBe(false);
  });

  it("when the last one pops, a new one rises from below", () => {
    const w = createWorld(W, H, random);
    run(w, 1);
    popAt(w, w.bubbles[0].pos);
    const risen = run(w, POP.time + RISE.delay + 0.2, 1);
    expect(risen.length).toBe(1);
    expect(risen[0].pos.y).toBeGreaterThan(H - risen[0].r * 1.2);
    run(w, 4, 3);
    const b = whole(w)[0];
    expect(b.rising).toBe(false);
    expect(b.pos.y + b.r).toBeLessThanOrEqual(H + 1);
  });
});

describe("kiss", () => {
  const feed = (values: (number | null)[]) => {
    const k = createKiss();
    return values.map((v) => stepKiss(k, v, 1 / 30));
  };

  it("a held pucker fires once", () => {
    const frames = Math.ceil(KISS.hold * 30) + 20;
    const fired = feed(Array(frames).fill(0.9)).filter(Boolean);
    expect(fired.length).toBe(1);
  });

  it("a flicker (talking) doesn't fire", () => {
    const fired = feed(
      Array.from({ length: 60 }, (_, i) => (i % 3 === 0 ? 0.9 : 0.2)),
    );
    expect(fired.some(Boolean)).toBe(false);
  });

  it("relax, wait out the cooldown, kiss again: fires again", () => {
    const k = createKiss();
    const pucker = (s: number) => {
      let n = 0;
      for (let t = 0; t < s; t += 1 / 30) if (stepKiss(k, 0.9, 1 / 30)) n++;
      return n;
    };
    expect(pucker(0.5)).toBe(1);
    for (let t = 0; t < KISS.cooldown + 0.1; t += 1 / 30)
      stepKiss(k, 0.1, 1 / 30);
    expect(pucker(0.5)).toBe(1);
  });
});
