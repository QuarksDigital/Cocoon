"use client";

import { useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Scroll reveals for anything outside the hero:
 *  [data-reveal]        fades + lifts in
 *  [data-reveal="line"] child [data-rise] spans slide up from a mask
 *  [data-reveal="rule"] hairlines draw from the left
 */
export default function Reveal() {
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        const kind = el.dataset.reveal;
        const trigger = { trigger: el, start: "top 86%", once: true };
        if (kind === "line") {
          gsap.from(el.querySelectorAll("[data-rise]"), {
            yPercent: 110,
            duration: 1.1,
            ease: "power4.out",
            stagger: 0.08,
            scrollTrigger: trigger,
          });
        } else if (kind === "rule") {
          gsap.from(el, { scaleX: 0, transformOrigin: "left center", duration: 1.4, ease: "power3.inOut", scrollTrigger: trigger });
        } else {
          gsap.from(el, { autoAlpha: 0, y: 40, duration: 1.1, ease: "power3.out", scrollTrigger: trigger });
        }
      });
    });
    // fonts/images can shift layout after mount
    const r = window.setTimeout(() => ScrollTrigger.refresh(), 600);
    return () => {
      window.clearTimeout(r);
      ctx.revert();
    };
  }, []);
  return null;
}
