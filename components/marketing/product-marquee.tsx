"use client"

const PRODUCTS_ROW1 = [
  { emoji: "📚", label: "E-books" },
  { emoji: "🎵", label: "Music" },
  { emoji: "🎨", label: "Design Templates" },
  { emoji: "📸", label: "Photography" },
  { emoji: "🎓", label: "Online Courses" },
  { emoji: "🛍️", label: "Merch" },
  { emoji: "📋", label: "Notion Templates" },
  { emoji: "🎙️", label: "Podcasts" },
  { emoji: "💻", label: "Software" },
  { emoji: "🖼️", label: "Digital Art" },
]

const PRODUCTS_ROW2 = [
  { emoji: "📦", label: "Memberships" },
  { emoji: "🎹", label: "Beat Packs" },
  { emoji: "📄", label: "Worksheets" },
  { emoji: "🎥", label: "Video Tutorials" },
  { emoji: "🔗", label: "Link-in-bio" },
  { emoji: "🏋️", label: "Fitness Plans" },
  { emoji: "📊", label: "Spreadsheets" },
  { emoji: "🎮", label: "Game Assets" },
  { emoji: "✏️", label: "Fonts" },
  { emoji: "🧩", label: "Plugins" },
  { emoji: "🤝", label: "1:1 Coaching" },
]

function MarqueeRow({ items, direction = "left", duration = 30 }: { items: typeof PRODUCTS_ROW1; direction?: "left" | "right"; duration?: number }) {
  const tripled = [...items, ...items, ...items]
  const animName = direction === "left" ? "marquee-left" : "marquee-right"

  return (
    <div className="overflow-hidden py-2">
      <div
        className="flex gap-3 w-max"
        style={{
          animation: `${animName} ${duration}s linear infinite`,
          willChange: "transform",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
        }}
      >
        {tripled.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white border-[1.5px] border-neutral-200 shadow-sm whitespace-nowrap transition-[border-color,box-shadow,transform,background-color] duration-700 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] hover:border-violet-300 hover:shadow-md hover:bg-violet-50/40 hover:scale-[1.04]"
          >
            <span className="text-base">{item.emoji}</span>
            <span className="text-sm font-medium text-neutral-700">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ProductMarquee() {
  return (
    <section className="py-14 sm:py-18 bg-white overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes marquee-left {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-33.333%, 0, 0); }
        }
        @keyframes marquee-right {
          0% { transform: translate3d(-33.333%, 0, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }
      `}} />

      <div className="max-w-[1200px] mx-auto px-6 mb-10 text-center">
        <h2 className="text-[clamp(26px,3.5vw,40px)] font-semibold tracking-tight leading-[1.15] mb-3">
          Unlimited possibilities
        </h2>
        <p className="text-[15px] text-neutral-500 max-w-[460px] mx-auto">
          Whatever you create, there&apos;s a place for it on Storelib.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <MarqueeRow items={PRODUCTS_ROW1} direction="left" duration={54} />
        <MarqueeRow items={PRODUCTS_ROW2} direction="right" duration={62} />
      </div>
    </section>
  )
}
