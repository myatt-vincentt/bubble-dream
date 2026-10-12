// Scene.tsx — Bubble Dream: you live inside soap bubbles floating on a dreamy
// sky. Blow a kiss for another bubble; touch one and it pops. See PLAN.md.
import { lazy, Suspense } from "react";

import { DreamScene } from "./bubbles/Dream";
import { ExperienceStatus } from "./bubbles/ExperienceStatus";
import { Hud } from "./bubbles/Hud";

// Dev-only tools (media switcher; kiss key) for previewing without a camera.
// Lazy and behind a constant esbuild folds to false in production. Two rules:
// `process.env.NODE_ENV`, not `import.meta.env.DEV`
// (vincentt-xr/v2-template#112); and write the check INSIDE each ternary —
// hoisted into a `const`, esbuild keeps the dead branch.
const DevMediaSwitcher =
  process.env.NODE_ENV !== "production"
    ? lazy(() => import("./DevMediaSwitcher"))
    : null;
const DevBubbles =
  process.env.NODE_ENV !== "production"
    ? lazy(() => import("./DevBubbles"))
    : null;

export const Scene = () => (
  <>
    <ExperienceStatus />
    <DreamScene />
    <Hud />
    {DevMediaSwitcher ? (
      <Suspense fallback={null}>
        <DevMediaSwitcher />
      </Suspense>
    ) : null}
    {DevBubbles ? (
      <Suspense fallback={null}>
        <DevBubbles />
      </Suspense>
    ) : null}
  </>
);
