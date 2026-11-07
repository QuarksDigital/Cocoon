const POINTS = [
  ["Durable", "Heavy-gauge 304 stainless, formed and welded - not pressed tin. Built to carry foot traffic for decades."],
  ["Hygienic", "Non-porous, smooth-finished steel. Nothing to harbour mould, nothing to stain. A rinse is enough."],
  ["Rust resistant", "18% chromium, 8% nickel. The passive oxide layer heals itself, even in constant moisture."],
  ["Fast flow", "Open-area ratios engineered per grate, so water clears before it pools - no blockage, no standing water."],
  ["Easy install", "Adjustable bodies and tile-ready flanges for a flush finish on any screed depth."],
];

export default function Material() {
  return (
    <section id="material" className="section section--split">
      <div className="wrap split">
        <div className="split-left">
          <p className="eyebrow" data-reveal>
            02 - Material
          </p>
          <p className="giant" data-reveal="line" aria-label="304">
            <span data-rise-wrap>
              <span data-rise>304</span>
            </span>
          </p>
          <h2 className="split-title" data-reveal>
            Made from grade 304 stainless steel
          </h2>
          <p className="lede" data-reveal>
            Food-grade austenitic stainless steel. The same alloy used in surgical trays and commercial kitchens - on
            your bathroom floor.
          </p>
        </div>
        <ul className="points">
          {POINTS.map(([title, body], i) => (
            <li key={title} data-reveal>
              <span className="points-num">{String(i + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
