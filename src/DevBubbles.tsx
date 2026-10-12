// DevBubbles.tsx — dev-only keys for the built-in preview, where no sample
// video blows a kiss:
//   K   blow a kiss (a new bubble)
// (Clicking a bubble pops it in every build — that's a tap.) Never reaches
// production: Scene.tsx lazy-imports this behind an inline
// `process.env.NODE_ENV` check, which esbuild folds.
import { useEffect } from "react";

import { requestKiss } from "./bubbles/state";

const DevBubbles = () => {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "k" || e.key === "K") requestKiss();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return null;
};

export default DevBubbles;
