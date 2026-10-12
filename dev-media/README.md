# dev-media

Optional dev-only preview media. Nothing here ships: only
`src/DevMediaSwitcher.tsx` reads this folder, and it is stripped from
production builds.

You don't need anything here. Without a webcam, `pnpm dev` starts on the SDK's
built-in "Person ThumbUp" video (a face and hands in view) and lists every SDK
sample video and image.

To preview with your own clip, add a portrait video of someone blowing kisses
and reaching for bubbles at `dev-media/portrait.mp4` (H.264 MP4); it is listed
first and used as the start. Clips here are git-ignored. Restart `pnpm dev`
after adding or removing one.

No sample blows a kiss, so the dev-only key K (see `src/DevBubbles.tsx`) blows
one. Clicking a bubble pops it (a tap, in every build).
