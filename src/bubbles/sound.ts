// Sound, through the SDK's sound engine (silent-switch safe, muted by default;
// the speaker button's tap is the gesture that unlocks iOS audio): a looping
// dreamy pad, a bloop when a bubble is born, a pop when one bursts. The clips
// are synthesised for this project (public/sounds/*.m4a).
import {
  playOneShot,
  prefetchMusic,
  registerSound,
  startMusic,
} from "@vincentt-xr/sdk";

export const MUSIC = "/sounds/dream.m4a";

export const SOUNDS = {
  bloop: "/sounds/bloop.m4a",
  pop1: "/sounds/pop1.m4a",
  pop2: "/sounds/pop2.m4a",
  pop3: "/sounds/pop3.m4a",
} as const;

export type SoundName = keyof typeof SOUNDS;

/** Buffer everything and ask for the music (it plays once unmuted). */
export const loadSounds = async () => {
  await Promise.all([
    prefetchMusic(MUSIC),
    ...Object.values(SOUNDS).map((url) => registerSound(url)),
  ]);
  startMusic(MUSIC);
};

/** Play a clip (a no-op while muted). */
export const play = (name: SoundName) => {
  playOneShot(SOUNDS[name]);
};

const POPS = ["pop1", "pop2", "pop3"] as const;

/** A pop, at one of three pitches so a run of pops isn't samey. */
export const playPop = () => {
  play(POPS[Math.floor(Math.random() * POPS.length) % POPS.length]);
};
