import Link from "next/link";
import Logo from "@/components/brand/Logo";

export default function Footer({ home = true }: { home?: boolean }) {
  const base = home ? "" : "/";
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-grid">
          <div className="footer-brand">
            <Logo variant="full" className="footer-logo" />
            <p>
              Premium 304 stainless steel bathroom drains.
              <br />A quality product by Goel Sinks India Pvt. Ltd.
            </p>
          </div>

          <nav className="footer-col" aria-label="Footer">
            <p className="footer-head">Explore</p>
            <Link href="/products">Products</Link>
            <a href={`${base}#material`}>Material</a>
            <a href={`${base}#sizes`}>Sizes</a>
            <a href={`${base}#range`}>Range</a>
          </nav>

          <div className="footer-col">
            <p className="footer-head">Contact</p>
            <a href="tel:+919911516708">+91 99115 16708</a>
            <a href="tel:+919625842952">+91 96258 42952</a>
            <a href="mailto:goelsinks@gmail.com">goelsinks@gmail.com</a>
            <a href={`${base}#contact`}>Send an enquiry</a>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© 2026 Cocoon. All rights reserved.</p>
          <a href="https://www.cocoonbathconcept.com" target="_blank" rel="noreferrer">
            cocoonbathconcept.com
          </a>
        </div>
      </div>
    </footer>
  );
}
