// Every tunable in one place. Units: design px (the 1280-tall design screen,
// x right, y down), seconds, unless noted.

/** Bubbles: how big, how many, how they're born. */
export const BUBBLE = {
  /** Radius range (px) for a new bubble; the first one is the biggest. */
  radius: [105, 150] as const,
  first: 170,
  /** At most this many; a kiss past it pops the oldest. */
  max: 7,
  /** Seconds to grow in (with a wobbly overshoot), and safe from popping after birth. */
  grow: 0.7,
  immune: 0.7,
  /** Keep this far (px) from the screen edges when choosing where to appear. */
  margin: 18,
};

/** Floating: a slow breeze, soft walls, soft bumps. */
export const FLOAT = {
  /** Breeze speed (px/s) and how quickly bubbles follow it (per second). */
  breeze: 34,
  follow: 0.6,
  /** A gentle rise (px/s; bubbles are a little lighter than air). */
  lift: 5,
  /** Bounce off the edges and each other: how much speed is kept. */
  restitution: 0.75,
  /** How far a bump squashes a bubble (wobble), and how fast it settles (per second). */
  squash: 0.9,
  settle: 3.5,
};

/** When the last bubble pops, a new one rises from below after this long, at this speed. */
export const RISE = { delay: 1.0, speed: 230 };

/** Popping: how long the burst lasts, and the splash. */
export const POP = {
  time: 0.4,
  droplets: 30,
  speed: [180, 520] as const,
  life: [0.45, 0.9] as const,
  size: [7, 17] as const,
};

/** Blowing a kiss (the SDK's mouthPout value): on above, off below, held this long, then a rest. */
export const KISS = { on: 0.6, off: 0.35, hold: 0.15, cooldown: 0.8 };

/** Each bubble frames you: head and shoulders, the face this share of the bubble's height. */
export const FRAME = {
  /** Crop radius = face height × this. */
  zoom: 1.45,
  /** The crop centre sits this many face heights below the face centre (shoulders in). */
  down: 0.35,
  /** Follows the face this quickly (per second); with no face, this crop (share of the screen). */
  follow: 5,
  /** The crop's top stays inside the frame (share of its radius above the centre). */
  topRoom: 0.92,
  fallback: { x: 0.5, y: 0.42, r: 0.3 },
};

/**
 * The cut-out: the blurred mask's levels for the soft edge (above ½ erodes it
 * a little), and the blur radius (share of the screen height).
 */
export const PERSON = { edge: [0.5, 0.82] as const, erode: 0.007 };

/** The dreamy sky, top to bottom (sRGB hex), and cloud colour. */
export const SKY = {
  top: "#9f8cff",
  mid: "#ffb8d9",
  bottom: "#ffe1c2",
  cloud: "#fff6fb",
};

/** Hand dots: every landmark a small light, the fingertips bigger. */
export const HAND_DOTS = { size: 14, tip: 32 };
