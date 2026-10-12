// Blowing a kiss — pure, unit-tested (kiss.test.ts). The pout value (the SDK's
// mouthPout face action, from the mouthPucker blendshape) must rise above
// KISS.on and stay there KISS.hold seconds; then it fires once, and only fires
// again after the lips relax below KISS.off and KISS.cooldown has passed. (The
// SDK default, 0.5, also fires while talking.)
import { KISS } from "./config";

export type Kiss = {
  /** Seconds the pout has been held; puckered right now; seconds since it last fired. */
  held: number;
  on: boolean;
  since: number;
};

export const createKiss = (): Kiss => ({ held: 0, on: false, since: Infinity });

/** Advance one frame with this pout value (null: no face). True when a kiss fires. */
export const stepKiss = (k: Kiss, pout: number | null, dt: number): boolean => {
  k.since += dt;
  if (pout === null) {
    k.held = 0;
    k.on = false;
    return false;
  }
  if (k.on) {
    if (pout < KISS.off) k.on = false;
    return false;
  }
  k.held = pout > KISS.on ? k.held + dt : 0;
  if (k.held >= KISS.hold && k.since >= KISS.cooldown) {
    k.on = true;
    k.held = 0;
    k.since = 0;
    return true;
  }
  return false;
};
