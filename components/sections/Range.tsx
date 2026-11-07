const LINES = [
  { name: "Drains", status: "Available", live: true },
  { name: "Shower channels", status: "Soon" },
  { name: "Towel rails", status: "Soon" },
  { name: "Grab bars", status: "Soon" },
  { name: "Shower niches", status: "Soon" },
  { name: "Soap & shelf systems", status: "Soon" },
];

export default function Range() {
  return (
    <section id="range" className="section">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow" data-reveal>
            04 - Range
          </p>
          <h2 className="display" data-reveal="line">
            <span data-rise-wrap>
              <span data-rise>Our product range.</span>
            </span>
          </h2>
        </div>
        <ul className="range">
          {LINES.map((l) => (
            <li key={l.name} className={l.live ? "is-live" : ""} data-reveal>
              <span className="range-name">{l.name}</span>
              <span className="range-status">{l.status}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
