import { Check } from "lucide-react"

/**
 * HOW FAR THROUGH A COURSE, AS A RING (round 29). One ring for the library's course cards and the player's header.
 *
 * The owner: "100%" ran over the circle. The ring is now drawn thinner on a larger radius (an inner edge of 31 of its
 * 40 units), the number is 11px with a smaller per cent sign, and a finished course shows a check instead of "100%",
 * so even the widest label, "99%", keeps clear of the stroke (scripts/check-courses-round29.mjs measures it).
 *
 * Ink, not a colour: the stroke and the track read --sl-course-ink and --sl-course-track, which the dark look sets to
 * light ink on a faint line (scripts/gen-theme-dark.mjs).
 */
export function CourseRing({
  percent,
  label,
  size = 40,
  probe = "course",
}: {
  percent: number
  label: string
  size?: number
  /** Which data attribute the probes find it by: a card's ring or the player's. */
  probe?: "course" | "player"
}) {
  const p = Math.max(0, Math.min(100, Math.round(percent)))
  const r = 17
  const c = 2 * Math.PI * r
  const done = p >= 100
  return (
    <span
      className="relative inline-flex shrink-0 select-none"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={p}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      data-course-ring={probe === "course" ? "" : undefined}
      data-progress-ring={probe === "player" ? "" : undefined}
    >
      <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="3" style={{ stroke: "var(--sl-course-track, #e8eaee)" }} />
        {p > 0 ? (
          <circle
            cx="20"
            cy="20"
            r={r}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - p / 100)}
            style={{ stroke: "var(--sl-course-ink, #1a1a2e)" }}
            className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-[520ms] motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]"
          />
        ) : null}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
        {done ? (
          <span data-ring-label="" className="flex text-[#1a1a2e]">
            <Check className="h-[15px] w-[15px]" strokeWidth={2.75} />
          </span>
        ) : (
          <span data-ring-label="" className={`text-[11px] font-semibold leading-none tabular-nums tracking-[-0.02em] ${p === 0 ? "text-[#9ca3af]" : "text-[#1a1a2e]"}`}>
            {p}
            <span className="text-[8px] font-semibold">%</span>
          </span>
        )}
      </span>
    </span>
  )
}
