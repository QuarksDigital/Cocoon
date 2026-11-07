"use client";

import { useEffect, useState } from "react";
import { fallbackProducts } from "@/lib/products";

type Status = "idle" | "sending" | "sent" | "error";

export default function Contact() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [product, setProduct] = useState("");

  // "Enquire about this drain" in the collection pre-fills the product
  useEffect(() => {
    // arriving from the products page with ?product=<slug>
    const slug = new URLSearchParams(window.location.search).get("product");
    const preset =
      slug === "custom"
        ? "Custom size"
        : (() => {
            const p = fallbackProducts.find((x) => x.slug === slug);
            return p ? `${p.name} - ${p.variant}` : "";
          })();
    const raf = preset ? requestAnimationFrame(() => setProduct(preset)) : 0;
    const on = (e: Event) => setProduct((e as CustomEvent<string>).detail);
    window.addEventListener("cocoon:enquire", on);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("cocoon:enquire", on);
    };
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Something went wrong. Please call us instead.");
      setStatus("sent");
      form.reset();
      setProduct("");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <section id="contact" className="section section--contact">
      <div className="wrap split">
        <div className="split-left">
          <p className="eyebrow" data-reveal>
            05 - Contact
          </p>
          <h2 className="display" data-reveal="line">
            <span data-rise-wrap>
              <span data-rise>Request a quote</span>
            </span>
            <span data-rise-wrap>
              <span data-rise>or ask a question.</span>
            </span>
          </h2>
          <div className="contact-lines" data-reveal>
            <a href="tel:+919911516708">+91 99115 16708</a>
            <a href="tel:+919625842952">+91 96258 42952</a>
            <a href="mailto:goelsinks@gmail.com">goelsinks@gmail.com</a>
          </div>
          <p className="fine" data-reveal>
            For architects, contractors, dealers and homeowners. Trade pricing on request.
          </p>
        </div>

        <form className="form" onSubmit={submit} data-reveal>
          {status === "sent" ? (
            <div className="form-done">
              <p className="form-done-title">Thank you.</p>
              <p>We&apos;ll get back to you within one working day.</p>
              <button type="button" className="link-arrow" onClick={() => setStatus("idle")}>
                Send another <span aria-hidden>→</span>
              </button>
            </div>
          ) : (
            <>
              <div className="field-row">
                <label className="field">
                  <span>Name</span>
                  <input name="name" required autoComplete="name" />
                </label>
                <label className="field">
                  <span>Phone</span>
                  <input name="phone" required type="tel" autoComplete="tel" />
                </label>
              </div>
              <div className="field-row">
                <label className="field">
                  <span>Email</span>
                  <input name="email" type="email" autoComplete="email" />
                </label>
                <label className="field">
                  <span>City</span>
                  <input name="city" autoComplete="address-level2" />
                </label>
              </div>
              <label className="field">
                <span>Product</span>
                <select name="product" value={product} onChange={(e) => setProduct(e.target.value)}>
                  <option value="">Not sure yet</option>
                  {fallbackProducts.map((p) => (
                    <option key={p.slug} value={`${p.name} - ${p.variant}`}>
                      {p.name} - {p.variant}
                    </option>
                  ))}
                  <option value="Custom size">Custom size</option>
                </select>
              </label>
              <label className="field">
                <span>Message</span>
                <textarea name="message" rows={3} placeholder="Quantities, sizes, site details…" />
              </label>
              <div className="form-foot">
                <button className="btn" disabled={status === "sending"}>
                  {status === "sending" ? "Sending…" : "Send enquiry"}
                  <span aria-hidden>→</span>
                </button>
                {status === "error" && <p className="form-error">{error}</p>}
              </div>
            </>
          )}
        </form>
      </div>
    </section>
  );
}
