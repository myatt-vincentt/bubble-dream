# Plan — Bubble Dream

You live inside soap bubbles floating on a dreamy sky. Blow a kiss for another bubble; touch one
and it pops. Endless. Built 2026-10-12.

## Decisions (the user's)

- The camera shows only inside the bubbles; the rest is a cloudy, dreamy gradient sky.
- Inside each bubble: you, cut out by person segmentation, on the sky — never your room.
- Kiss clones are live mirrors: every bubble shows you now.
- Never an empty sky: when the last bubble pops, a new one floats up from below.
- Extras: bubbles drift and bump, sounds, a pop splash.

## How it works

- **Sky** (`shaders.ts`): a full-screen shader at renderOrder 0, opaque (it covers the camera
  background): a lavender → pink → peach gradient, a soft glow, two layers of fbm clouds
  drifting at different speeds, twinkles.
- **Bubbles** (`world.ts`, pure): up to 7. A kiss blows one at the freest of a few random spots
  (away from other bubbles and your hands), growing in with a wobbly overshoot, safe from
  popping for 0.7 s. Past the cap the oldest pops. They follow a slow breeze field (a gentle
  rise in it), bounce off the edges and each other (mass by area, restitution 0.75), and squash
  on impacts faster than 30 px/s (slower nudges don't, or a bubble the breeze leans on an edge
  stays squashed). Popped bubbles burst for 0.4 s. With none left, one rises from below after
  1 s.
- **Drawing a bubble** (`shaders.ts`, `Dream.tsx`): a pool of clip-space quads, one per bubble.
  The fragment shader bulges what's behind (a sphere lens), draws the sky through it, then you:
  the camera and person mask sampled around a head-and-shoulders crop (face bounds: centre a
  third of a face height below the face, radius 1.45 face heights, its top kept inside the
  frame; smoothed), the mask's stepped edge rounded by a 13-tap disc blur thresholded above
  ½, faded softly where the crop runs past the frame's sides. Over that: a swirling rainbow
  film toward the rim (lighter over you), a bright rim, two highlights; wobble and squash bend
  the outline. A pop flashes, then a thin rainbow ring spreads and fades, and droplets spray out.
- **Kiss** (`kiss.ts`, pure): the SDK's `mouthPout` value above 0.6 for 0.15 s fires once; it
  re-arms below 0.35 after a 0.8 s rest. (The SDK default, 0.5, also fires while talking.)
- **Touch**: a tap, or any of the 21 landmarks of either hand over a bubble, pops it. Your hands
  show as violet dots (the room — and so your real hands — is hidden).
- **HUD** (`Hud.tsx`): a frosted hint pill (look at the camera → blow a kiss → touch a bubble;
  gone once you've done both) and the speaker.
- **Sound** (`sound.ts`): synthesised — a 16 s seamless dreamy pad (music loop), a bloop for a
  new bubble, pops at three pitches.

## Notes

- Face bounds are in the tracker's input frame, which here matches the screen: uv x = centerX,
  uv y = 1 − centerY (checked against the camera image).
- The SDK's person mask comes up from a small model in steps; magnified in a bubble, a
  min-erosion looked blocky — hence the blur.
