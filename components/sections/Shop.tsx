import Link from "next/link";
import ProductGrid from "@/components/store/ProductGrid";

export default function Shop() {
  return (
    <section id="collection" className="section">
      <div className="wrap">
        <div className="section-head section-head--row">
          <div>
            <p className="eyebrow" data-reveal>
              01 - Collection
            </p>
            <h2 className="display" data-reveal="line">
              <span data-rise-wrap>
                <span data-rise>Linear, square, round</span>
              </span>
              <span data-rise-wrap>
                <span data-rise>and rooftop drains.</span>
              </span>
            </h2>
          </div>
          <Link href="/products" className="link-arrow" data-reveal>
            Shop all products <span aria-hidden>→</span>
          </Link>
        </div>
        <ProductGrid limit={6} enquire="event" />
      </div>
    </section>
  );
}
