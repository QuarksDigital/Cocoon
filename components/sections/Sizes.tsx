const ROWS = [
  ["4″ × 4″", "100 × 100 mm", "Powder rooms, utility floors"],
  ["5″ × 5″", "125 × 125 mm", "Standard shower enclosures"],
  ["6″ × 4″", "150 × 100 mm", "Balconies, narrow wet zones"],
  ["6″ × 6″", "150 × 150 mm", "Walk-in showers, terraces"],
  ["8″ × 6″", "200 × 150 mm", "Rooftops, high-volume runoff"],
  ["8″ × 8″", "200 × 200 mm", "Commercial & industrial"],
  ["12″ - 36″", "Linear channels", "Level-access showers, wet rooms"],
];

export default function Sizes() {
  return (
    <section id="sizes" className="section">
      <div className="wrap">
        <div className="section-head section-head--row">
          <div>
            <p className="eyebrow" data-reveal>
              03 - Sizes
            </p>
            <h2 className="display" data-reveal="line">
              <span data-rise-wrap>
                <span data-rise>Standard and</span>
              </span>
              <span data-rise-wrap>
                <span data-rise>custom sizes.</span>
              </span>
            </h2>
          </div>
          <p className="lede" data-reveal>
            Standard sizes ship from stock. Anything else, we cut to order - tell us the opening and we&apos;ll build the
            drain around it.
          </p>
        </div>

        <div className="spec" role="table" aria-label="Available sizes">
          <div className="spec-row spec-row--head" role="row">
            <span role="columnheader">Size</span>
            <span role="columnheader">Metric</span>
            <span role="columnheader">Best for</span>
          </div>
          {ROWS.map(([a, b, c]) => (
            <div className="spec-row" role="row" key={a} data-reveal>
              <span role="cell" className="spec-size">
                {a}
              </span>
              <span role="cell">{b}</span>
              <span role="cell">{c}</span>
            </div>
          ))}
          <div className="spec-row spec-row--custom" role="row" data-reveal>
            <span role="cell" className="spec-size">
              Custom
            </span>
            <span role="cell">Any dimension</span>
            <span role="cell">
              <a href="#contact" className="link-arrow">
                Request a custom size <span aria-hidden>→</span>
              </a>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
