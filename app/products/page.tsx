import type { Metadata } from "next";
import Nav from "@/components/Nav";
import Reveal from "@/components/Reveal";
import SmoothScroll from "@/components/SmoothScroll";
import Loader from "@/components/Loader";
import ProductGrid from "@/components/store/ProductGrid";
import Footer from "@/components/sections/Footer";

export const metadata: Metadata = {
  title: "Products - Cocoon 304 Stainless Steel Drains",
  description:
    "Linear, square, round and rooftop drains in 304-grade stainless steel. Browse the full Cocoon catalogue and enquire for trade pricing.",
};

export default function ProductsPage() {
  return (
    <>
      <SmoothScroll />
      <Loader />
      <Reveal />
      <Nav home={false} />
      <main className="products-page">
        <header className="wrap products-head">
          <p className="eyebrow" data-reveal>
            Catalogue
          </p>
          <h1 className="display" data-reveal="line">
            <span data-rise-wrap>
              <span data-rise>All products.</span>
            </span>
          </h1>
          <p className="lede" data-reveal>
            Every Cocoon drain is cut, formed and welded from 304-grade stainless steel. Standard sizes ship from stock;
            anything else we make to order.
          </p>
        </header>

        <section className="wrap products-grid" aria-label="Product list">
          <ProductGrid filters enquire="link" />
        </section>

        <section className="wrap products-cta">
          <p className="display products-cta-title" data-reveal="line">
            <span data-rise-wrap>
              <span data-rise>Need a custom</span>
            </span>
            <span data-rise-wrap>
              <span data-rise className="muted">size?</span>
            </span>
          </p>
          {/* full load on purpose: the home page's pinned 3D hero initialises cleanly */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/?product=custom#contact" className="btn" data-reveal>
            Request a custom size <span aria-hidden>→</span>
          </a>
        </section>
      </main>
      <Footer home={false} />
    </>
  );
}
