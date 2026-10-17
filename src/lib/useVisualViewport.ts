"use client";

import { useEffect, useState } from "react";

export interface VisualViewportBox {
  height: number;
  top: number;
}

// The part of the screen that is actually visible. On iPhone the on-screen
// keyboard shrinks (and pans) this "visual viewport" without touching the
// layout viewport — so something pinned to the bottom of the layout ends up
// hidden behind the keyboard unless it is sized to this box instead.
export function useVisualViewport(active: boolean): VisualViewportBox | null {
  const [box, setBox] = useState<VisualViewportBox | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    const update = () => setBox({ height: vv.height, top: vv.offsetTop });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setBox(null);
    };
  }, [active]);
  return box;
}
