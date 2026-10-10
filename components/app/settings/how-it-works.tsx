"use client"

/**
 * ===========================================================================
 *  HOW IT WORKS
 * ===========================================================================
 * A quiet "How it works" beside a setting that needs explaining, which opens
 * a short explanation with a picture of the idea: a dialog on a computer,
 * the shared sheet on a phone (components/ui/sheet-dialog.tsx), so it opens
 * and closes the way every other sheet in /app does. The words are in
 * lib/settings/explainers.ts.
 *
 * Asked for: "a modal tooltip thing that can be smoothly opened, with a
 * visual representation and short description copy explaining to people how
 * certain things work, and they can close it".
 */
import * as React from "react"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { usePhoneWidth } from "@/components/ui/choice-list"
import { EXPLAINERS, type ExplainerArt, type ExplainerId } from "@/lib/settings/explainers"
import { cn } from "@/lib/utils"

export function HowItWorks({ id, className, label = "How it works" }: { id: ExplainerId; className?: string; label?: string }) {
  const [open, setOpen] = React.useState(false)
  const phone = usePhoneWidth()
  const e = EXPLAINERS[id]
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-how-it-works={id}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full px-2 text-[13px] font-medium text-[#4b5563] outline-none transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 [-webkit-tap-highlight-color:transparent]",
          className,
        )}
      >
        <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.6" stroke="currentColor" strokeWidth="1.3" />
          <path d="M6.3 6.2a1.8 1.8 0 0 1 3.5.5c0 1.2-1.8 1.5-1.8 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="8" cy="11.4" r="0.8" fill="currentColor" />
        </svg>
        {label}
      </button>
      <SheetDialog open={open} onClose={() => setOpen(false)} phone={phone} label={e.title} className="max-w-[440px] gap-0 rounded-2xl p-0 sm:max-w-[440px]">
        <div className="px-5 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6" data-how-it-works-panel={id}>
          <div className="mb-5 overflow-hidden rounded-xl bg-[#f6f7f9]">
            <Art art={e.art} />
          </div>
          <SheetDialogTitle className="text-[18px] font-semibold leading-snug text-[#1a1a2e]">{e.title}</SheetDialogTitle>
          <div className="mt-3 space-y-2.5">
            {e.lines.map((line, i) => (
              <p key={i} className="text-[14px] leading-[21px] text-[#4b5563]">
                {line}
              </p>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-end gap-2">
            {"guide" in e && e.guide ? (
              <a href={e.guide} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-lg px-3 text-[13.5px] font-medium text-[#1a1a2e] underline-offset-2 hover:underline">
                Read the guide
              </a>
            ) : null}
            <button type="button" onClick={() => setOpen(false)} className="inline-flex h-9 items-center rounded-lg bg-[#1a1a2e] px-4 text-[13.5px] font-medium text-white outline-none transition-colors hover:bg-[#2a2a40] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 focus-visible:ring-offset-2">
              Got it
            </button>
          </div>
        </div>
      </SheetDialog>
    </>
  )
}

/* ── The pictures ──────────────────────────────────────────────────────────
   One small scene per idea, in the app's greys with one ink colour, the
   way a person would sketch it on paper to explain it. 400 by 150. */

const INK = "#1a1a2e"
const LINE = "#c9cdd3"
const SOFT = "#e6e8ec"
const PAPER = "#ffffff"

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 400 150" className="block h-auto w-full" role="img" aria-hidden>
      {children}
    </svg>
  )
}

function Box({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 10 L22 0 L44 10 L44 38 L22 48 L0 38 Z" fill={PAPER} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M0 10 L22 20 L44 10 M22 20 L22 48" fill="none" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M11 5 L33 15" stroke={LINE} strokeWidth="1.6" />
    </g>
  )
}

function House({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 22 L26 0 L52 22 L52 54 L0 54 Z" fill={PAPER} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
      <rect x="20" y="34" width="12" height="20" rx="1.5" fill={SOFT} stroke={INK} strokeWidth="1.4" />
    </g>
  )
}

function Pin({ x, y, fill = INK }: { x: number; y: number; fill?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M10 0 C4.5 0 0 4.3 0 9.8 C0 17 10 26 10 26 C10 26 20 17 20 9.8 C20 4.3 15.5 0 10 0 Z" fill={fill} />
      <circle cx="10" cy="10" r="3.6" fill={PAPER} />
    </g>
  )
}

function Card({ x, y, w, h, children }: { x: number; y: number; w: number; h: number; children?: React.ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={w} height={h} rx="10" fill={PAPER} stroke={LINE} strokeWidth="1.2" />
      {children}
    </g>
  )
}

function Bar({ x, y, w, dark = false }: { x: number; y: number; w: number; dark?: boolean }) {
  return <rect x={x} y={y} width={w} height="7" rx="3.5" fill={dark ? INK : SOFT} />
}

function Art({ art }: { art: ExplainerArt }) {
  switch (art) {
    case "shipping":
      return (
        <Frame>
          <Box x={52} y={52} />
          <path d="M112 78 C160 40 230 40 280 74" fill="none" stroke={INK} strokeWidth="1.6" strokeDasharray="5 6" strokeLinecap="round" />
          <path d="M272 66 L282 75 L270 80" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <House x={296} y={48} />
          <Card x={150} y={92} w={104} h={36}>
            <Bar x={12} y={10} w={44} dark />
            <Bar x={12} y={21} w={70} />
          </Card>
        </Frame>
      )
    case "locations":
      return (
        <Frame>
          <rect x="40" y="58" width="96" height="58" rx="6" fill={PAPER} stroke={INK} strokeWidth="1.6" />
          <path d="M40 72 L88 42 L136 72" fill="none" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
          <rect x="74" y="86" width="28" height="30" rx="2" fill={SOFT} stroke={INK} strokeWidth="1.4" />
          <Pin x={78} y={14} />
          <House x={190} y={62} />
          <Pin x={206} y={28} fill="#6b7280" />
          <Box x={300} y={66} s={0.9} />
          <Pin x={310} y={30} fill="#9ca3af" />
          <path d="M136 108 H186 M246 108 H296" stroke={LINE} strokeWidth="1.6" strokeDasharray="4 5" />
        </Frame>
      )
    case "taxes":
      return (
        <Frame>
          <Card x={118} y={18} w={164} h={114}>
            <Bar x={16} y={16} w={60} dark />
            <Bar x={16} y={36} w={132} />
            <Bar x={16} y={50} w={110} />
            <line x1="16" y1="70" x2="148" y2="70" stroke={SOFT} strokeWidth="1.2" />
            <Bar x={16} y={80} w={40} />
            <Bar x={110} y={80} w={38} />
            <Bar x={16} y={96} w={46} dark />
            <Bar x={104} y={96} w={44} dark />
          </Card>
          <circle cx="318" cy="48" r="22" fill={INK} />
          <path d="M309 57 L327 39" stroke={PAPER} strokeWidth="2" strokeLinecap="round" />
          <circle cx="310" cy="41" r="3.2" fill="none" stroke={PAPER} strokeWidth="1.8" />
          <circle cx="326" cy="55" r="3.2" fill="none" stroke={PAPER} strokeWidth="1.8" />
          <Pin x={66} y={52} />
        </Frame>
      )
    case "returns":
      return (
        <Frame>
          <House x={60} y={50} />
          <Box x={300} y={54} />
          <path d="M290 64 C240 30 170 30 124 62" fill="none" stroke={INK} strokeWidth="1.6" strokeDasharray="5 6" strokeLinecap="round" />
          <path d="M132 54 L122 63 L134 67" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <Card x={160} y={86} w={92} h={40}>
            <circle cx="16" cy="20" r="5" fill="none" stroke={INK} strokeWidth="1.4" />
            <Bar x={28} y={11} w={48} dark />
            <Bar x={28} y={23} w={36} />
          </Card>
        </Frame>
      )
    case "reasons":
      return (
        <Frame>
          <Card x={110} y={14} w={180} h={122}>
            {[0, 1, 2, 3].map((i) => (
              <g key={i} transform={`translate(14 ${14 + i * 26})`}>
                <circle cx="7" cy="8" r="6" fill={i === 1 ? INK : PAPER} stroke={i === 1 ? INK : LINE} strokeWidth="1.4" />
                {i === 1 ? <circle cx="7" cy="8" r="2.3" fill={PAPER} /> : null}
                <Bar x={22} y={4} w={i === 1 ? 92 : 70 + i * 8} dark={i === 1} />
              </g>
            ))}
          </Card>
        </Frame>
      )
    case "checkout":
      return (
        <Frame>
          <Card x={70} y={16} w={260} h={118}>
            <Bar x={18} y={16} w={54} dark />
            <rect x="18" y="34" width="106" height="20" rx="6" fill={PAPER} stroke={LINE} />
            <rect x="134" y="34" width="106" height="20" rx="6" fill={PAPER} stroke={LINE} />
            <rect x="18" y="62" width="222" height="20" rx="6" fill={PAPER} stroke={LINE} strokeDasharray="4 4" />
            <rect x="18" y="90" width="222" height="20" rx="7" fill={INK} />
            <Bar x={104} y={96.5} w={50} />
          </Card>
        </Frame>
      )
    case "channels":
      return (
        <Frame>
          {[0, 1, 2].map((i) => (
            <Card key={i} x={44 + i * 112} y={30} w={92} h={92}>
              <rect x="10" y="10" width="72" height="40" rx="6" fill={i === 0 ? INK : SOFT} />
              <Bar x={10} y={60} w={48} dark={i === 0} />
              <Bar x={10} y={73} w={64} />
            </Card>
          ))}
        </Frame>
      )
    case "integrations":
      return (
        <Frame>
          <Card x={60} y={38} w={110} h={74}>
            <Bar x={14} y={16} w={50} dark />
            <Bar x={14} y={30} w={80} />
            <Bar x={14} y={44} w={64} />
          </Card>
          <path d="M170 75 H230" stroke={INK} strokeWidth="1.6" strokeDasharray="5 6" />
          <circle cx="200" cy="75" r="11" fill={INK} />
          <path d="M195 75 h10 M200 70 v10" stroke={PAPER} strokeWidth="1.8" strokeLinecap="round" />
          {[0, 1, 2].map((i) => (
            <rect key={i} x={236 + i * 38} y={52 + (i % 2) * 16} width="30" height="30" rx="8" fill={i === 1 ? INK : PAPER} stroke={i === 1 ? INK : LINE} strokeWidth="1.2" />
          ))}
        </Frame>
      )
    case "packages":
      return (
        <Frame>
          <Box x={92} y={44} s={1.3} />
          <rect x="200" y="62" width="104" height="44" rx="4" fill={PAPER} stroke={INK} strokeWidth="1.6" />
          <path d="M200 66 L252 90 L304 66" fill="none" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M92 124 H158 M200 124 H304" stroke={LINE} strokeWidth="1.4" />
          <path d="M92 120 V128 M158 120 V128 M200 120 V128 M304 120 V128" stroke={LINE} strokeWidth="1.4" />
        </Frame>
      )
    case "fulfilment":
      return (
        <Frame>
          <House x={40} y={56} />
          <rect x="150" y="60" width="96" height="50" rx="6" fill={PAPER} stroke={INK} strokeWidth="1.6" />
          <path d="M150 74 L198 46 L246 74" fill="none" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
          <Box x={300} y={60} />
          <path d="M96 124 H344" stroke={LINE} strokeWidth="1.4" />
          {[68, 198, 322].map((cx, i) => (
            <circle key={i} cx={cx} cy="124" r="5" fill={i === 1 ? INK : PAPER} stroke={INK} strokeWidth="1.4" />
          ))}
        </Frame>
      )
    case "team":
      return (
        <Frame>
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${96 + i * 76} ${36 + (i === 1 ? -8 : 0)})`}>
              <circle cx="28" cy="22" r="16" fill={i === 1 ? INK : SOFT} stroke={i === 1 ? INK : LINE} strokeWidth="1.2" />
              <path d="M0 78 C0 54 56 54 56 78" fill={i === 1 ? INK : SOFT} stroke={i === 1 ? INK : LINE} strokeWidth="1.2" />
            </g>
          ))}
          <Bar x={170} y={122} w={60} dark />
        </Frame>
      )
    case "store":
    default:
      return (
        <Frame>
          <rect x="120" y="54" width="160" height="72" rx="6" fill={PAPER} stroke={INK} strokeWidth="1.6" />
          <path d="M112 54 H288 L278 30 H122 Z" fill={SOFT} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
          <rect x="182" y="86" width="36" height="40" rx="2" fill={SOFT} stroke={INK} strokeWidth="1.4" />
          <Bar x={138} y={70} w={30} dark />
          <Bar x={232} y={70} w={30} />
        </Frame>
      )
  }
}
