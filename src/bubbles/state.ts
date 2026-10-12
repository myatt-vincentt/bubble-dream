// Shared live state: the scene writes it, the HUD and the dev keys read and
// poke it. Plain mutable fields, read every frame (no React state).
import type { Pt, World } from "./world";

export const dreamState = {
  /** The bubbles (created by the scene once the screen size is known). */
  world: null as World | null,
  /** A face is in view; the latest pout value (0..1). */
  face: false,
  pout: 0,
  /** Taps on the screen (design px) and dev kisses, for the next frame. */
  taps: [] as Pt[],
  kissRequested: false,
};

/** Blow a bubble as if kissed (dev key). */
export const requestKiss = () => {
  dreamState.kissRequested = true;
};
