"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { getLenis } from "../SmoothScroll";
import type { DrainScene } from "./scene/DrainScene";

gsap.registerPlugin(ScrollTrigger);

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Pinned hero. Scroll progress (0 → 1) drives:
 *  0.00-0.32  drain rises out of the floor
 *  0.30-0.52  grate swings open
 *  0.48-0.86  camera dives into the channel and down the outlet
 *  0.72-0.86  image fades to black
 *  0.86-1.00  black curtain slides down, revealing the intro
 * Scrolling back runs the whole thing in reverse.
 */
export default function Hero() {
  const wrapRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const blackRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const stage = stageRef.current!;
    let scene: DrainScene | null = null;
    let disposed = false;
    let autoTween = false;

    const endScroll = () => wrap.offsetTop + wrap.offsetHeight - window.innerHeight;
    const goTo = (y: number, duration: number) => {
      const lenis = getLenis();
      autoTween = true;
      const done = () => {
        autoTween = false;
      };
      if (lenis) lenis.scrollTo(y, { duration, easing: easeInOutCubic, lock: true, onComplete: done });
      else {
        window.scrollTo({ top: y, behavior: "smooth" });
        window.setTimeout(done, duration * 1000);
      }
    };
    const dive = () => goTo(endScroll(), 2.8);

    // cursor pill that follows the pointer while over the drain
    const cursor = cursorRef.current!;
    const moveCursor = (e: PointerEvent) => {
      cursor.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
    };
    window.addEventListener("pointermove", moveCursor, { passive: true });

    import("./scene/DrainScene")
      .then(({ DrainScene }) => {
        if (disposed) return;
        try {
          scene = new DrainScene(stage, {
            onReady: () => {
              setReady(true);
              window.dispatchEvent(new Event("cocoon:ready"));
            },
            onDiveRequest: dive,
            onHoverChange: (h) => {
              cursor.classList.toggle("is-on", h);
              window.dispatchEvent(new CustomEvent("cocoon:dive-hover", { detail: h }));
            },
          });
          scene.setProgress(st.progress);
        } catch (err) {
          console.warn("WebGL unavailable, showing still image.", err);
          setFallback(true);
          window.dispatchEvent(new Event("cocoon:ready"));
        }
      })
      .catch(() => {
        setFallback(true);
        window.dispatchEvent(new Event("cocoon:ready"));
      });

    // DOM choreography, mapped 1:1 onto the same progress value
    const tl = gsap.timeline({ paused: true, defaults: { ease: "none" } });
    tl.to(hintRef.current, { autoAlpha: 0, y: 12, duration: 0.08 }, 0.02)
      .to(copyRef.current, { autoAlpha: 0, y: -40, duration: 0.14 }, 0.3)
      .fromTo(blackRef.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.14 }, 0.72)
      .set(stage, { autoAlpha: 0 }, 0.865)
      .set(introRef.current, { autoAlpha: 1 }, 0.865)
      .fromTo(
        blackRef.current,
        { yPercent: 0 },
        { yPercent: 101, duration: 0.12, ease: "power2.inOut" },
        0.88,
      )
      .fromTo(
        introRef.current!.querySelectorAll("[data-rise]"),
        { yPercent: 110 },
        { yPercent: 0, duration: 0.1, stagger: 0.012, ease: "power3.out" },
        0.9,
      )
      .set({}, {}, 1);

    let direction = 1;
    const st = ScrollTrigger.create({
      trigger: wrap,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => {
        direction = self.direction;
        tl.progress(self.progress);
        scene?.setProgress(self.progress);
        scene?.setActive(self.progress < 0.875);
      },
    });

    // "Scrolled enough" → finish the move on its own, in whichever direction.
    const onScrollEnd = () => {
      if (autoTween) return;
      const p = st.progress;
      if (p > 0.38 && p < 0.985) {
        if (direction > 0) dive();
        else goTo(wrap.offsetTop, 2.2);
      }
    };
    ScrollTrigger.addEventListener("scrollEnd", onScrollEnd);

    return () => {
      disposed = true;
      ScrollTrigger.removeEventListener("scrollEnd", onScrollEnd);
      window.removeEventListener("pointermove", moveCursor);
      st.kill();
      tl.kill();
      scene?.dispose();
    };
  }, []);

  return (
    <section ref={wrapRef} className="hero" aria-label="Cocoon linear drain">
      <div className="hero-sticky">
        <div ref={stageRef} className={`hero-stage ${ready ? "is-ready" : ""}`}>
          {fallback && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="hero-fallback" src="/hero-fallback.jpg" alt="Cocoon wave linear drain on a wet stone floor" />
          )}
        </div>

        <div ref={copyRef} className="hero-copy">
          <h1 className="hero-title">
            New age
            <br />
            bath concepts.
          </h1>
        </div>

        <div ref={hintRef} className="hero-hint">
          <span>Scroll</span>
          <i aria-hidden />
        </div>

        <div ref={blackRef} className="hero-black" aria-hidden />

        <div ref={introRef} className="hero-intro">
          <div className="wrap intro-grid">
            <p className="eyebrow">
              <span data-rise-wrap>
                <span data-rise>Cocoon - New Age Bath Concept</span>
              </span>
            </p>
            <h2 className="intro-title">
              <span data-rise-wrap>
                <span data-rise>Bathroom drains</span>
              </span>
              <span data-rise-wrap>
                <span data-rise>made from 304</span>
              </span>
              <span data-rise-wrap>
                <span data-rise className="accent">stainless steel.</span>
              </span>
            </h2>
            <div className="intro-foot">
              <p className="lede">
                <span data-rise-wrap>
                  <span data-rise>
                    Laser-cut grates, welded channels and a finish that outlives the tiles around it - for walk-in
                    showers, wet rooms, balconies and rooftops.
                  </span>
                </span>
              </p>
              <dl className="stats">
                {[
                  ["304", "Grade stainless"],
                  ["3 mm", "Rooftop body"],
                  ["14", "Designs"],
                ].map(([k, v]) => (
                  <div key={v}>
                    <dt>
                      <span data-rise-wrap>
                        <span data-rise>{k}</span>
                      </span>
                    </dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </div>

      <div ref={cursorRef} className="drain-cursor" aria-hidden>
        <span>Dive in</span>
      </div>
    </section>
  );
}
