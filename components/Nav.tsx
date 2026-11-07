"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Logo from "@/components/brand/Logo";

/**
 * Frosted nav bar. Dark glass while it sits over the 3D hero, white glass over
 * everything else. On the home page section links are in-page anchors
 * (smooth-scrolled by Lenis); elsewhere they point back to the home sections.
 */
export default function Nav({ home = true }: { home?: boolean }) {
  const base = home ? "" : "/";
  const [dark, setDark] = useState(home);

  useEffect(() => {
    if (!home) return;
    const hero = document.querySelector<HTMLElement>(".hero");
    if (!hero) return;
    let raf = 0;
    const check = () => {
      raf = 0;
      const range = hero.offsetHeight - window.innerHeight;
      const p = range > 0 ? (window.scrollY - hero.offsetTop) / range : 1;
      // the black curtain starts sliding away at ~0.88 to reveal the white intro
      setDark(p < 0.89);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [home]);

  return (
    <header className={`nav ${dark ? "is-dark" : ""}`}>
      <a href={home ? "#top" : "/"} className="nav-mark" aria-label="Cocoon home">
        <Logo />
      </a>
      <nav className="nav-links" aria-label="Primary">
        <Link href="/products">Products</Link>
        <a href={`${base}#material`}>Material</a>
        <a href={`${base}#sizes`}>Sizes</a>
        <a href={`${base}#range`}>Range</a>
      </nav>
      <a href={`${base}#contact`} className="nav-cta">
        Enquire <span aria-hidden>→</span>
      </a>
    </header>
  );
}
