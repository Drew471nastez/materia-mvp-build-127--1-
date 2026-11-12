"use client"

import { useEffect, useRef, type ComponentType, type CSSProperties } from "react"
import {
  AudioLines,
  BookOpen,
  Box,
  Brush,
  CalendarCheck,
  Camera,
  ChefHat,
  Clapperboard,
  CodeXml,
  Disc3,
  Dumbbell,
  Film,
  Frame,
  Gamepad2,
  GraduationCap,
  Languages,
  LayoutTemplate,
  Link as LinkIcon,
  Mail,
  Map as MapIcon,
  MessagesSquare,
  Mic,
  Music,
  NotebookPen,
  Palette,
  PenTool,
  Presentation,
  Puzzle,
  Scissors,
  Shapes,
  Sheet,
  Shirt,
  SlidersHorizontal,
  SwatchBook,
  Ticket,
  Type,
  Users,
} from "lucide-react"
import { StoryHeading } from "./story-heading"

type Chip = { label: string; Icon: ComponentType<{ strokeWidth?: number; "aria-hidden"?: boolean }>; tint: string }

/*
  WHAT CREATORS SELL, IN THREE ROWS (wave 12, the owner: "Unlimited
  possibilities", edge to edge, three rows, more of them). Communities, never
  Memberships: memberships were folded into communities
  (tests/memberships-folded).
*/
const ROW_1: Chip[] = [
  { label: "Presets", Icon: SlidersHorizontal, tint: "#7c3aed" },
  { label: "Beats", Icon: AudioLines, tint: "#2563eb" },
  { label: "Merch", Icon: Shirt, tint: "#db2777" },
  { label: "Online courses", Icon: GraduationCap, tint: "#7c3aed" },
  { label: "Communities", Icon: Users, tint: "#0891b2" },
  { label: "1:1 coaching", Icon: MessagesSquare, tint: "#4f46e5" },
  { label: "Ebooks", Icon: BookOpen, tint: "#c2410c" },
  { label: "Fonts", Icon: Type, tint: "#3f3f46" },
  { label: "Templates", Icon: LayoutTemplate, tint: "#7c3aed" },
  { label: "Notion templates", Icon: NotebookPen, tint: "#3f3f46" },
  { label: "Photography", Icon: Camera, tint: "#0f766e" },
  { label: "Podcasts", Icon: Mic, tint: "#9333ea" },
]
const ROW_2: Chip[] = [
  { label: "Music", Icon: Music, tint: "#db2777" },
  { label: "Software", Icon: CodeXml, tint: "#2563eb" },
  { label: "Workshops", Icon: Presentation, tint: "#c2410c" },
  { label: "Event tickets", Icon: Ticket, tint: "#7c3aed" },
  { label: "Art prints", Icon: Frame, tint: "#b45309" },
  { label: "Digital art", Icon: Palette, tint: "#db2777" },
  { label: "Video tutorials", Icon: Clapperboard, tint: "#4f46e5" },
  { label: "Fitness plans", Icon: Dumbbell, tint: "#16a34a" },
  { label: "Game assets", Icon: Gamepad2, tint: "#7c3aed" },
  { label: "Plugins", Icon: Puzzle, tint: "#0891b2" },
  { label: "Spreadsheets", Icon: Sheet, tint: "#15803d" },
  { label: "Procreate brushes", Icon: Brush, tint: "#9333ea" },
]
const ROW_3: Chip[] = [
  { label: "Sample packs", Icon: Disc3, tint: "#3f3f46" },
  { label: "3D models", Icon: Box, tint: "#2563eb" },
  { label: "Recipes", Icon: ChefHat, tint: "#c2410c" },
  { label: "Travel guides", Icon: MapIcon, tint: "#0f766e" },
  { label: "Bookings", Icon: CalendarCheck, tint: "#7c3aed" },
  { label: "Newsletters", Icon: Mail, tint: "#4f46e5" },
  { label: "Stock footage", Icon: Film, tint: "#3f3f46" },
  { label: "Color palettes", Icon: SwatchBook, tint: "#db2777" },
  { label: "Icon packs", Icon: Shapes, tint: "#0891b2" },
  { label: "Sewing patterns", Icon: Scissors, tint: "#b45309" },
  { label: "Language lessons", Icon: Languages, tint: "#16a34a" },
  { label: "Design assets", Icon: PenTool, tint: "#9333ea" },
  { label: "Link-in-bio", Icon: LinkIcon, tint: "#7c3aed" },
]

export const MARQUEE_ROWS = [
  { items: ROW_1, direction: "left", seconds: 64 },
  { items: ROW_2, direction: "right", seconds: 72 },
  { items: ROW_3, direction: "left", seconds: 60 },
] as const

/*
  THE LOOP. Each row is one track holding the same list three times; the
  track slides by exactly one copy (a third of itself) and starts over, so
  the seam is never seen. Each chip carries its own right margin instead of
  the track having a gap, so the three copies are the same width to the
  pixel. Three copies, not two: the two still on screen at the end of a lap
  are over 4,000px, wider than any screen. Only `transform` moves, on the
  compositor (no layout or paint per frame). A row stops under the pointer,
  and all three stop off screen and in a background tab. With reduced
  motion the rows stand still: one copy each, wrapped and centred.
*/
const CSS = `
.um{position:relative;background:#fff;color:#18181b;overflow:clip;padding-block:clamp(64px,8vw,120px)}
.um-head{max-width:1400px;margin:0 auto clamp(36px,4vw,56px);padding-inline:clamp(22px,6vw,96px);text-align:center}
.um-head .story-heading{margin-inline:auto}
.um-sub{margin:20px auto 0;max-width:46ch;font-size:clamp(16px,1.4vw,19px);line-height:1.6;color:#6b6874;text-wrap:pretty}
[data-landing-story] [data-story-section] > .um-rows,.um-rows{max-width:none;margin:0;padding:0;display:flex;flex-direction:column;gap:clamp(10px,1.1vw,14px)}
.um-row{position:relative;width:100%;overflow:hidden;padding-block:6px 10px}
.um-track{display:flex;width:max-content;will-change:transform;backface-visibility:hidden;animation:um-left var(--um-s,64s) linear infinite}
.um-row[data-dir="right"] .um-track{animation-name:um-right}
.um-copy{display:flex;margin:0;padding:0;list-style:none;flex:none}
.um-chip{flex:none;display:inline-flex;align-items:center;gap:10px;height:52px;margin-right:12px;padding:0 22px 0 8px;border-radius:999px;background:#fff;border:1px solid #e8e6ee;box-shadow:0 1px 2px rgba(24,24,27,.04),0 6px 18px -12px rgba(24,24,27,.18);white-space:nowrap;font-size:16px;font-weight:500;letter-spacing:-.01em;color:#232129;transition:border-color .25s ease,box-shadow .25s ease}
.um-chip:hover{border-color:#d6c8fb;box-shadow:0 1px 2px rgba(24,24,27,.04),0 10px 24px -12px rgba(124,58,237,.4)}
.um-icon{display:grid;place-items:center;width:36px;height:36px;border-radius:999px;color:var(--um-tint);background:color-mix(in srgb,var(--um-tint) 10%,#fff)}
.um-icon svg{width:18px;height:18px}
.um-row:hover .um-track,.um[data-um-paused] .um-track,[data-story-paused] .um-track{animation-play-state:paused}
@keyframes um-left{from{transform:translate3d(0,0,0)}to{transform:translate3d(calc(-100% / 3),0,0)}}
@keyframes um-right{from{transform:translate3d(calc(-100% / 3),0,0)}to{transform:translate3d(0,0,0)}}
@media(max-width:767px){
  .um-chip{height:44px;gap:8px;margin-right:10px;padding:0 16px 0 6px;font-size:14.5px}
  .um-icon{width:32px;height:32px}
  .um-icon svg{width:16px;height:16px}
}
@media(prefers-reduced-motion:reduce){
  .um-track{animation:none;width:auto;will-change:auto;padding-inline:clamp(16px,4vw,48px)}
  .um-copy{flex:1 1 auto;flex-wrap:wrap;justify-content:center;gap:10px}
  .um-copy[aria-hidden]{display:none}
  .um-chip{margin:0;transition:none}
}
`

function Row({ items, direction, seconds }: (typeof MARQUEE_ROWS)[number]) {
  const copy = (k: number) => (
    <ul key={k} className="um-copy" aria-hidden={k > 0 || undefined}>
      {items.map(({ label, Icon, tint }) => (
        <li key={label} className="um-chip" style={{ "--um-tint": tint } as CSSProperties}>
          <span className="um-icon">
            <Icon aria-hidden strokeWidth={1.9} />
          </span>
          {label}
        </li>
      ))}
    </ul>
  )
  return (
    <div className="um-row" data-dir={direction}>
      <div className="um-track" data-story-continuous="" style={{ "--um-s": `${seconds}s` } as CSSProperties}>
        {[0, 1, 2].map(copy)}
      </div>
    </div>
  )
}

/** "Unlimited possibilities": what creators sell, three edge-to-edge rows moving left, right, left. */
export function ProductMarquee() {
  const ref = useRef<HTMLElement>(null)
  /* Off screen or in a background tab the rows stop, on /pricing too, where no LandingStory watches them. */
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver !== "function") return
    let visible = true
    const sync = () => el.toggleAttribute("data-um-paused", !visible || document.hidden)
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting
        sync()
      },
      { rootMargin: "120px 0px" },
    )
    io.observe(el)
    document.addEventListener("visibilitychange", sync)
    return () => {
      io.disconnect()
      document.removeEventListener("visibilitychange", sync)
    }
  }, [])

  return (
    <section ref={ref} data-story-section="categories" className="um" aria-labelledby="um-title" data-unlimited="">
      <style>{CSS}</style>
      <div className="um-head">
        <StoryHeading id="um-title" text="Unlimited possibilities" accent={["possibilities"]} />
        <p className="um-sub">Whatever you make, there is a place for it on Storelib. Sell it, book it, teach it or ship it.</p>
      </div>
      <div className="um-rows">
        {MARQUEE_ROWS.map((row, i) => (
          <Row key={i} {...row} />
        ))}
      </div>
    </section>
  )
}
