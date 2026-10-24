import { AnimateOnScroll } from "./bento-grid"

const BADGES = [
  {
    label: "Launch in minutes",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.16" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
  },
  {
    label: "Cancel anytime",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.16" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    ),
  },
  {
    label: "No coding",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.16" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="m18 16 4-4-4-4M6 8l-4 4 4 4M14.5 4l-5 16" />
      </svg>
    ),
  },
  {
    label: "Get paid directly",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.16" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
]

export function FeaturesBadgesSection() {
  return (
    <section className="pt-6 pb-12 sm:pt-10 sm:pb-20 bg-white">
      <div className="max-w-[860px] mx-auto px-6">
        <AnimateOnScroll variant="fade-up">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8">
            {BADGES.map((badge) => (
              <div key={badge.label} className="flex flex-col items-center text-center gap-3">
                {/* Circle icon */}
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-700 shrink-0">
                  {badge.icon}
                </div>
                <span className="text-[13px] sm:text-[14px] font-semibold text-neutral-800 leading-tight">
                  {badge.label}
                </span>
              </div>
            ))}
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  )
}
