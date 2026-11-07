"use client";

import { useEffect, useRef } from "react";

const INTERACTIVE = "a, button, [role='tab'], [data-cursor='hover']";
const TEXT = "input, textarea, select, [contenteditable='true']";

/**
 * Custom cursor: a precise dot plus a water droplet that trails behind with a
 * little inertia. The droplet's tip points back along the direction of travel
 * and it stretches with speed; at rest it settles upright. Over links it
 * swells into a lens; over text fields it steps aside for the native caret.
 */
export default function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dot = dotRef.current!;
    const drop = dropRef.current!;
    const root = document.documentElement;
    root.classList.add("has-cursor");

    let mx = -100;
    let my = -100;
    let x = mx;
    let y = my;
    let angle = 0;
    let stretch = 0;
    let scale = 1;
    let visible = false;
    let state: "idle" | "hover" | "text" | "dive" = "idle";
    let dive = false;
    let raf = 0;

    const setState = (s: typeof state) => {
      if (s === state) return;
      state = s;
      drop.dataset.state = s;
      dot.dataset.state = s;
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      mx = e.clientX;
      my = e.clientY;
      if (!visible) {
        visible = true;
        x = mx;
        y = my;
        root.classList.add("cursor-on");
      }
      const t = e.target as Element | null;
      if (t?.closest(TEXT)) setState("text");
      else if (dive) setState("dive");
      else if (t?.closest(INTERACTIVE)) setState("hover");
      else setState("idle");
    };
    const onLeave = () => {
      visible = false;
      root.classList.remove("cursor-on");
    };
    const onDown = () => drop.classList.add("is-down");
    const onUp = () => drop.classList.remove("is-down");
    const onDive = (e: Event) => {
      dive = (e as CustomEvent<boolean>).detail;
      if (state !== "text") setState(dive ? "dive" : "idle");
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const k = reduce ? 1 : 0.17; // inertia: just a little
      const px = x;
      const py = y;
      x += (mx - x) * k;
      y += (my - y) * k;
      const vx = x - px;
      const vy = y - py;
      const speed = Math.hypot(vx, vy);

      // tip trails motion; upright (0) when resting
      const want = speed > 0.6 ? Math.atan2(-vx, vy) : 0;
      let delta = want - angle;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      angle += delta * (speed > 0.6 ? 0.25 : 0.08);
      stretch += (Math.min(speed / 26, 0.45) - stretch) * 0.2;

      const targetScale = state === "hover" ? 1.9 : state === "dive" ? 2.4 : state === "text" ? 0 : 1;
      scale += (targetScale - scale) * 0.18;

      dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
      drop.style.transform =
        `translate3d(${x}px, ${y}px, 0) rotate(${angle}rad) ` +
        `scale(${scale * (1 - stretch * 0.35)}, ${scale * (1 + stretch)})`;
    };
    raf = requestAnimationFrame(loop);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("cocoon:dive-hover", onDive);
    document.addEventListener("mouseleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("cocoon:dive-hover", onDive);
      document.removeEventListener("mouseleave", onLeave);
      root.classList.remove("has-cursor", "cursor-on");
    };
  }, []);

  return (
    <>
      <div ref={dropRef} className="cursor-drop" aria-hidden>
        <svg viewBox="0 0 40 52" width="40" height="52">
          {/* teardrop: tip at top, round belly below; origin sits at the belly's centre */}
          <path d="M20 1.5 C 27 12 37 22 37 33 A 17 17 0 0 1 3 33 C 3 22 13 12 20 1.5 Z" />
          <path className="cursor-glint" d="M11.5 33 a 8.5 8.5 0 0 0 5 8" />
        </svg>
      </div>
      <div ref={dotRef} className="cursor-dot" aria-hidden />
    </>
  );
}
