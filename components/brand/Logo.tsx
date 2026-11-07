import { MARK, TAGLINE } from "./logo-paths";

type Props = {
  /** "mark" = swoosh + COCOON wordmark; "full" adds the NEW AGE BATH CONCEPT line */
  variant?: "mark" | "full";
  className?: string;
  title?: string;
};

/**
 * The Cocoon logo, vectorised from the client's own artwork.
 * Colour comes from CSS `color` (currentColor), so it can be burgundy on white
 * and white over the dark hero.
 */
export default function Logo({ variant = "mark", className, title = "Cocoon" }: Props) {
  if (variant === "mark") {
    return (
      <svg
        className={className}
        viewBox={`0 0 ${MARK.w} ${MARK.h}`}
        role="img"
        aria-label={title}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path fill="currentColor" fillRule="evenodd" d={MARK.d} />
      </svg>
    );
  }
  // stack: mark on top, tagline centred beneath with the poster's spacing
  const gap = 14;
  const w = Math.max(MARK.w, TAGLINE.w);
  const h = MARK.h + gap + TAGLINE.h;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={`${title} - New Age Bath Concept`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path fill="currentColor" fillRule="evenodd" transform={`translate(${(w - MARK.w) / 2} 0)`} d={MARK.d} />
      <path
        fill="currentColor"
        fillRule="evenodd"
        transform={`translate(${(w - TAGLINE.w) / 2} ${MARK.h + gap})`}
        d={TAGLINE.d}
      />
    </svg>
  );
}
