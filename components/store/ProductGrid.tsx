"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CATEGORIES, fallbackProducts, fetchProducts, type Category, type Product } from "@/lib/products";

type Props = {
  /** show only the first N products (home page) */
  limit?: number;
  /** category filter bar (products page) */
  filters?: boolean;
  /** "event" pre-fills the contact form on this page; "link" sends the visitor to the home contact form */
  enquire?: "event" | "link";
};

const CAT_LABEL: Record<Category, string> = {
  linear: "Linear",
  square: "Square",
  round: "Round",
  rooftop: "Rooftop",
};

export default function ProductGrid({ limit, filters = false, enquire = "event" }: Props) {
  const [products, setProducts] = useState<Product[]>(fallbackProducts);
  const [filter, setFilter] = useState<Category | "all">("all");
  const gridRef = useRef<HTMLUListElement>(null);
  const first = useRef(true);

  useEffect(() => {
    const ac = new AbortController();
    fetchProducts(ac.signal)
      .then(setProducts)
      .catch(() => {
        /* API offline: bundled catalogue is already showing */
      });
    return () => ac.abort();
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: products.length };
    products.forEach((p) => (c[p.category] = (c[p.category] ?? 0) + 1));
    return c;
  }, [products]);

  const visible = useMemo(() => {
    const list = products.filter((p) => filter === "all" || p.category === filter);
    return limit ? list.slice(0, limit) : list;
  }, [products, filter, limit]);

  // tiles rise in on first view, and re-flow on filter change
  useEffect(() => {
    const tiles = gridRef.current?.querySelectorAll(".tile");
    if (!tiles?.length) return;
    if (first.current) {
      first.current = false;
      // each row rises in as it reaches the viewport
      gsap.set(tiles, { autoAlpha: 0, y: 60 });
      const triggers = ScrollTrigger.batch(tiles, {
        start: "top 90%",
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, { autoAlpha: 1, y: 0, duration: 1.1, ease: "power3.out", stagger: 0.09, overwrite: true }),
      });
      return () => {
        triggers.forEach((t) => t.kill());
        gsap.set(tiles, { clearProps: "all" });
      };
    }
    gsap.fromTo(tiles, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.05, ease: "power3.out" });
    ScrollTrigger.refresh();
  }, [visible]);

  const onEnquire = (p: Product) => {
    window.dispatchEvent(new CustomEvent("cocoon:enquire", { detail: `${p.name} - ${p.variant}` }));
  };

  return (
    <div className="store">
      {filters && (
        <div className="store-bar">
          <div className="filters" role="tablist" aria-label="Filter by type">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                role="tab"
                aria-selected={filter === c.key}
                className={filter === c.key ? "is-active" : ""}
                onClick={() => setFilter(c.key)}
              >
                {c.label}
                <sup>{String(counts[c.key] ?? 0).padStart(2, "0")}</sup>
              </button>
            ))}
          </div>
          <p className="store-count">
            {visible.length} {visible.length === 1 ? "product" : "products"}
          </p>
        </div>
      )}

      <ul ref={gridRef} className="tiles">
        {visible.map((p) => (
          <li key={p.slug} className="tile">
            <div className={`tile-media ${p.photo ? "is-photo" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.image} alt={`${p.name} ${p.variant}`} loading="lazy" />
              {p.featured && <span className="tile-flag">Signature</span>}
            </div>
            <div className="tile-body">
              <p className="tile-cat">
                {CAT_LABEL[p.category]} <span aria-hidden>·</span> {p.material}
              </p>
              <h3 className="tile-name">
                {p.name}
                <span>{p.variant}</span>
              </h3>
              <p className="tile-summary">{p.summary}</p>
              <ul className="tile-sizes" aria-label="Available sizes">
                {p.sizes.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <div className="tile-foot">
                <span className="tile-size-count">
                  {p.sizes.length} sizes <span className="tile-custom">+ custom</span>
                </span>
                {enquire === "link" ? (
                  <a href={`/?product=${p.slug}#contact`} className="tile-cta">
                    Enquire <span aria-hidden>→</span>
                  </a>
                ) : (
                  <a href="#contact" className="tile-cta" onClick={() => onEnquire(p)}>
                    Enquire <span aria-hidden>→</span>
                  </a>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {limit && products.length > limit && (
        <div className="store-more">
          <Link href="/products" className="btn btn--ghost">
            View all {products.length} products <span aria-hidden>→</span>
          </Link>
        </div>
      )}
    </div>
  );
}
