"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import Logo from "@/components/brand/Logo";
import { getLenis } from "./SmoothScroll";

let bootedOnce = false;

/**
 * Full-screen loader. With `waitFor="scene"` it stays until the 3D hero has
 * compiled and drawn its first frame (Hero dispatches "cocoon:ready");
 * otherwise it waits for fonts. Scroll is locked while it is up.
 */
export default function Loader({ waitFor = "fonts" }: { waitFor?: "scene" | "fonts" }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const root = rootRef.current!;
    const minTime = bootedOnce ? 350 : 1100;
    const start = performance.now();
    let target = 0.86; // creep toward this until the real signal arrives
    let shown = 0;
    let done = false;
    let raf = 0;

    document.documentElement.classList.add("is-loading");
    const lock = window.setTimeout(() => getLenis()?.stop(), 0);

    const finish = () => {
      if (done) return;
      done = true;
      target = 1;
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      shown += (target - shown) * (target === 1 ? 0.18 : 0.035);
      if (barRef.current) barRef.current.style.transform = `scaleX(${shown})`;
      if (numRef.current) numRef.current.textContent = String(Math.round(shown * 100)).padStart(3, "0");
      if (target === 1 && shown > 0.995 && performance.now() - start > minTime) {
        cancelAnimationFrame(raf);
        exit();
      }
    };
    raf = requestAnimationFrame(tick);

    const exit = () => {
      bootedOnce = true;
      const tl = gsap.timeline({
        onComplete: () => {
          document.documentElement.classList.remove("is-loading");
          getLenis()?.start();
          setGone(true);
        },
      });
      tl.to(root.querySelector(".loader-inner"), { autoAlpha: 0, y: -24, duration: 0.5, ease: "power2.in" })
        .to(root, { yPercent: -100, duration: 1.0, ease: "power4.inOut" }, "-=0.1");
    };

    const onReady = () => finish();
    if (waitFor === "scene") window.addEventListener("cocoon:ready", onReady);
    else document.fonts.ready.then(finish);
    const failsafe = window.setTimeout(finish, 9000);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(lock);
      window.clearTimeout(failsafe);
      window.removeEventListener("cocoon:ready", onReady);
      document.documentElement.classList.remove("is-loading");
    };
  }, [waitFor]);

  if (gone) return null;
  return (
    <div ref={rootRef} className="loader" role="status" aria-label="Loading">
      <div className="loader-inner">
        <Logo variant="full" className="loader-logo" />
        <div className="loader-meter">
          <div className="loader-track">
            <div ref={barRef} className="loader-bar" />
          </div>
          <span ref={numRef} className="loader-num">
            000
          </span>
        </div>
      </div>
    </div>
  );
}
