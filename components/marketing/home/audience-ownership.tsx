"use client"

/*
  HOME SECTION 10: YOUR AUDIENCE BELONGS TO YOU.

  Storelib's own Emails (app/(storelib)/app/emails, the composer in
  components/email/compose): To, From, Subject and Preview text rows, Send
  test / Schedule / Send in the bar, Send in Storelib's violet. Contacts
  export as CSV and import from a CSV (app/(storelib)/app/contacts). The sync
  apps are the five lib/integrations/catalog connects today: Klaviyo,
  Omnisend, Brevo, MailerLite and Kit, unsubscribes coming back from each.
  Named in words here; their marks belong to the integrations section.

  The composer plays one short loop while the section is on screen: the
  subject types itself, Send is pressed, the status line turns to Sent and
  the opens fill in. Off screen, nothing runs.
*/

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { StoryHeading } from "@/components/marketing/story-heading"
import { STORELIB_S_PATH, STORELIB_S_TRANSFORM } from "@/components/storelib-mark"
import { PlatformCount, usePlatformSection } from "./platform-motion"
import m from "./platform.module.css"
import s from "./audience-ownership.module.css"

const SUBJECT = "Spring glazes are here, six new colors"
const AUDIENCE = 12480
/** How long the subject takes to type: one step per character. */
const TYPE_MS = SUBJECT.length * 40

function StorelibS({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true">
      <path d={STORELIB_S_PATH} transform={STORELIB_S_TRANSFORM} fill="currentColor" />
    </svg>
  )
}

/* ── The composer ────────────────────────────────────────────────────── */
type Phase = "typing" | "ready" | "pressed" | "sending" | "sent"

/*
  The loop is five state changes in seven seconds, nothing per frame. The
  subject "types" by a cover sliding off it in one step per character (a CSS
  animation on transform): writing the letters into the page one at a time
  would make the browser restyle the whole document for each of them, as
  the site's :has() rules on <html> and <body> ask it to.
*/
function useComposerLoop(live: boolean, reduced: boolean) {
  const [phase, setPhase] = useState<Phase>("sent")
  const [round, setRound] = useState(0)
  useEffect(() => {
    if (!live || reduced) {
      setPhase("sent")
      return
    }
    const timers: number[] = []
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms))
    const run = () => {
      setRound((r) => r + 1)
      setPhase("typing")
      at(TYPE_MS + 500, () => setPhase("ready"))
      at(TYPE_MS + 1400, () => setPhase("pressed"))
      at(TYPE_MS + 1650, () => setPhase("sending"))
      at(TYPE_MS + 3000, () => setPhase("sent"))
      at(TYPE_MS + 7700, run)
    }
    run()
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [live, reduced])
  return { phase, round }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-2 border-b border-[#f0f0f2] px-4 py-2.5 last:border-b-0 sm:grid-cols-[84px_minmax(0,1fr)] sm:px-5">
      <span className="text-[12px] font-medium text-[#6b7280] sm:text-[13px]">{label}</span>
      <div className="min-w-0 truncate text-[12.5px] text-[#1a1a2e] sm:text-[13.5px]">{children}</div>
    </div>
  )
}

function Composer({ live, reduced, seen }: { live: boolean; reduced: boolean; seen: boolean }) {
  const { phase, round } = useComposerLoop(live, reduced)
  const sent = phase === "sent"
  const sending = phase === "sending"
  return (
    <div className={`${s.window} relative mx-auto w-full max-w-[640px] overflow-hidden rounded-[18px] bg-[#f8f9fa] text-[#1a1a2e] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.08)]`}>
      {/* The bar */}
      <div className="flex items-center gap-2 border-b border-[#ececef] bg-white px-3 py-2.5 sm:px-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg text-[#1a1a2e]" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-bold sm:text-[16px]">Spring glaze drop</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors duration-300 ${sent ? "bg-[#e8f8ef] text-[#137a3e]" : "bg-[#f1f2f4] text-[#5f6470]"}`}>
              {sent ? "Sent" : sending ? "Sending" : "Draft"}
            </span>
          </div>
          <div className={`${s.swap} text-[11.5px] text-[#6b7280]`} aria-live="off">
            <span data-on={String(!sent && !sending)}>Saved</span>
            <span data-on={String(sending)}>Sending to {AUDIENCE.toLocaleString("en-US")} people…</span>
            <span data-on={String(sent)}>Sent to {AUDIENCE.toLocaleString("en-US")} people · just now</span>
          </div>
        </div>
        <span className="hidden h-8 items-center rounded-lg border border-[#d9dbe0] bg-white px-3 text-[12.5px] font-medium shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)] md:inline-flex">Send test</span>
        <span className="hidden h-8 items-center rounded-lg border border-[#d9dbe0] bg-white px-3 text-[12.5px] font-medium shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)] lg:inline-flex">Schedule</span>
        <span
          data-pressed={phase === "pressed" ? "" : undefined}
          className={`${s.sendBtn} inline-flex h-8 items-center rounded-lg bg-[#8b5cf6] px-3.5 text-[12.5px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(0,0,0,0.18)]`}
        >
          Send
        </span>
      </div>

      <div className="p-3 sm:p-4">
        {/* The envelope */}
        <div className="rounded-2xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.05)]">
          <Field label="To">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f3efff] px-2.5 py-0.5 text-[12px] font-medium text-[#5b21b6]">
              All subscribers <span className="text-[#8b75c9]">· {AUDIENCE.toLocaleString("en-US")}</span>
            </span>
          </Field>
          <Field label="From">
            Maya Lin <span className="text-[#8a8f98]">&lt;hello@mayalin.studio&gt;</span>
          </Field>
          <Field label="Subject">
            <span
              key={round}
              className={`${s.typed} ${phase === "typing" ? s.typing : ""}`}
              style={{ "--steps": SUBJECT.length, "--type-ms": `${TYPE_MS}ms` } as CSSProperties}
            >
              {SUBJECT}
              <span className={s.typeCover} aria-hidden="true" />
              <span className={s.typeCaret} aria-hidden="true">
                <span className={`${s.caret} ${m.loop}`} />
              </span>
            </span>
          </Field>
          <Field label="Preview">
            <span className="text-[#6b7280]">Out Friday at 9am, members get them first</span>
          </Field>
        </div>

        {/* The email */}
        <div className="relative mt-3 overflow-hidden rounded-2xl bg-white px-5 pb-5 pt-4 shadow-[0_0_0_1px_rgba(0,0,0,0.05)] sm:px-8 sm:pb-7">
          <div className="text-center text-[10px] font-semibold uppercase tracking-[0.28em] text-[#1a1a2e]">Maya Lin Ceramics</div>
          <div className="relative mt-3 aspect-[16/7] overflow-hidden rounded-xl bg-[linear-gradient(135deg,#efe6dc_0%,#e3d3c2_55%,#d7c0aa_100%)]" aria-hidden="true">
            <svg viewBox="0 0 320 140" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMax slice">
              <ellipse cx="160" cy="132" rx="150" ry="10" fill="#c9b29a" opacity=".45" />
              <path d="M70 70 C70 110 90 128 110 128 L130 128 C150 128 170 110 170 70 Z" fill="#5d7c74" />
              <path d="M70 70 C70 64 170 64 170 70 C170 76 70 76 70 70 Z" fill="#3f5b54" />
              <path d="M186 58 C180 92 192 128 222 128 C252 128 262 92 256 58 Z" fill="#c8693f" />
              <ellipse cx="221" cy="58" rx="35" ry="5" fill="#9e4d2b" />
              <path d="M120 96 C116 116 126 128 146 128 C166 128 176 116 172 96 Z" fill="#e9dccb" />
              <ellipse cx="146" cy="96" rx="26" ry="4" fill="#cdbca6" />
            </svg>
          </div>
          <div className="mt-4 text-[17px] font-semibold tracking-[-0.02em] sm:text-[19px]">Six new glazes, fired this week</div>
          <p className="mt-1.5 text-[12.5px] leading-[1.6] text-[#5f6470] sm:text-[13px]">
            Moss, terracotta and a milky white I have wanted for a year. Every piece is one of a kind, so the first to the shop get the pick.
          </p>
          <span className="mt-3.5 inline-flex h-9 items-center rounded-full bg-[#1a1a2e] px-5 text-[12.5px] font-semibold text-white">Shop the drop</span>

          {/* The result, once sent */}
          <div
            data-on={String(sent)}
            className={`${s.sentToast} absolute left-1/2 top-[26%] w-[min(320px,calc(100%-32px))] rounded-2xl bg-[#18181b] p-3.5 text-white shadow-[0_24px_48px_-16px_rgba(0,0,0,0.55)]`}
            aria-hidden="true"
          >
            <div className="flex items-center gap-2 text-[12.5px] font-medium">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#22c55e]">
                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                </svg>
              </span>
              Sent to {AUDIENCE.toLocaleString("en-US")} people
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
              {[
                { k: "Open rate", v: 0.58 },
                { k: "Click rate", v: 0.14 },
              ].map((r) => (
                <div key={r.k}>
                  <div className="flex justify-between text-white/60">
                    <span>{r.k}</span>
                    <span className="font-semibold text-white">{Math.round(r.v * 100)}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className={`${s.fill} h-full rounded-full bg-[#a78bfa]`} style={{ transform: `scaleX(${sent && seen ? r.v : 0})` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Subscribers arriving ────────────────────────────────────────────── */
const PEOPLE = [
  { name: "Sofia Marín", email: "sofia.marin@", via: "Sign-up form", tint: "#f9a8d4" },
  { name: "Jonah Reyes", email: "jreyes@", via: "Checkout", tint: "#93c5fd" },
  { name: "Aiko Tanaka", email: "aiko.t@", via: "Free download", tint: "#fcd34d" },
  { name: "Priya Nair", email: "priya.nair@", via: "Community", tint: "#a7f3d0" },
  { name: "Leo Fischer", email: "leo.fischer@", via: "Checkout", tint: "#c4b5fd" },
  { name: "Amara Okafor", email: "amara.o@", via: "Sign-up form", tint: "#fdba74" },
  { name: "Inès Laurent", email: "ines.l@", via: "Free download", tint: "#fda4af" },
  { name: "Tom Becker", email: "tbecker@", via: "Checkout", tint: "#99f6e4" },
]
const initials = (n: string) => n.split(" ").map((p) => p[0]).join("")

function Subscribers({ live, seen }: { live: boolean; seen: boolean }) {
  const [head, setHead] = useState(0)
  const [added, setAdded] = useState(0)
  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => {
      setHead((h) => (h + 1) % PEOPLE.length)
      setAdded((a) => a + 1)
    }, 2600)
    return () => window.clearInterval(id)
  }, [live])
  /*
    Four rows that stay in the page: each newcomer shifts the words down a
    row and the list slides in from above (the animation restarts by
    swapping between two identical keyframes). Nothing is inserted, so the
    site's :has() rules never restyle the document for a new subscriber.
  */
  const rows = [0, 1, 2, 3].map((k) => {
    const idx = (head - k + PEOPLE.length * 4) % PEOPLE.length
    return { ...PEOPLE[idx], fresh: k === 0 && added > 0 }
  })
  return (
    <div className={`${s.panel} ${s.dark} ${m.reveal} flex h-full flex-col p-5 sm:p-7`} style={{ "--i": 1 } as CSSProperties}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-medium text-white/55">Subscribers</div>
          <div className="mt-1 text-[clamp(34px,3.6vw,44px)] font-medium leading-none tracking-[-0.045em]">
            <PlatformCount value={AUDIENCE - 240 + added} from={AUDIENCE - 1200} start={seen} duration={1800} />
          </div>
        </div>
        <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[#22c55e]/12 px-2.5 py-1 text-[12px] font-medium text-[#4ade80]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" />+{(214 + added).toLocaleString("en-US")} this week
        </span>
      </div>
      <ul className={`${s.list} ${m.loop} mt-5 space-y-2`} data-shift={added ? added % 2 : undefined} aria-hidden="true">
        {rows.map((r, k) => (
          <li key={k} className={`${s.row} ${r.fresh ? s.rowFresh : ""} flex items-center gap-3 rounded-[14px] bg-white/[0.05] px-3 py-2.5`}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-[#18181b]" style={{ background: r.tint }}>
              {initials(r.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{r.name}</span>
              <span className="block truncate text-[11.5px] text-white/45">{r.email}•••.com</span>
            </span>
            <span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] text-white/70">{r.via}</span>
          </li>
        ))}
      </ul>
      <p className="mt-auto pt-5 text-[14px] leading-[1.55] text-white/60">
        Every sign-up form, checkout and free download adds to one list. Only people who said yes get your emails.
      </p>
    </div>
  )
}

/* ── Sync to an email platform ───────────────────────────────────────── */
const PLATFORMS = ["Klaviyo", "Omnisend", "Brevo", "MailerLite", "Kit"]

function Sync() {
  return (
    <div className={`${s.panel} ${s.light} ${m.reveal} flex h-full flex-col p-5 sm:p-7`} style={{ "--i": 2 } as CSSProperties}>
      <h3 className="text-[20px] font-medium tracking-[-0.02em]">Already on an email platform?</h3>
      <p className="mt-1.5 text-[14.5px] leading-[1.55] text-[#5f5d66]">Subscribers, buyers and every order go out. Unsubscribes come back.</p>
      <div className="mt-6 flex items-center gap-3" aria-hidden="true">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#8b5cf6] text-white shadow-[0_10px_24px_-10px_rgba(139,92,246,0.8)]">
          <StorelibS className="h-7 w-7" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
          {PLATFORMS.map((p, k) => (
            <div key={p} className="flex items-center gap-2">
              <div className={`${s.wire} flex-1`} style={{ "--run": "460px" } as CSSProperties}>
                <span className={`${s.pulse} ${m.loop}`} style={{ "--k": k } as CSSProperties} />
              </div>
              <span className="w-[92px] shrink-0 rounded-full border border-[#e9e7ee] bg-[#faf9fc] px-2.5 py-1 text-center text-[12px] font-medium text-[#18181b]">{p}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Export, and no lock-in ──────────────────────────────────────────── */
function Export() {
  return (
    <div className={`${s.panel} ${s.light} ${m.reveal} flex h-full flex-col gap-6 p-5 sm:flex-row sm:items-center sm:p-7`} style={{ "--i": 3 } as CSSProperties}>
      <div className="min-w-0 flex-1">
        <h3 className="text-[20px] font-medium tracking-[-0.02em]">Download every contact, any time</h3>
        <p className="mt-1.5 max-w-[46ch] text-[14.5px] leading-[1.55] text-[#5f5d66]">
          Names, emails, tags and where each person came from, as a CSV. Bring a list in the same way.
        </p>
      </div>
      <div className="relative flex shrink-0 flex-col items-start gap-3 sm:items-end" aria-hidden="true">
        <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d9dbe0] bg-white px-4 text-[13px] font-medium shadow-[inset_0_-1px_0_rgba(0,0,0,0.08),0_1px_0_rgba(0,0,0,0.05)]">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
          </svg>
          Export CSV
        </span>
        <span className={`${s.file} ${m.loop} inline-flex items-center gap-2.5 rounded-xl bg-[#f6f6f7] px-3 py-2`}>
          <span className="flex h-8 w-7 items-center justify-center rounded-[6px] bg-[#16a34a] text-[8px] font-bold text-white">CSV</span>
          <span>
            <span className="block text-[12.5px] font-medium">contacts.csv</span>
            <span className="block text-[11px] text-[#7a7784]">{AUDIENCE.toLocaleString("en-US")} people</span>
          </span>
        </span>
      </div>
    </div>
  )
}

function NoLockIn() {
  return (
    <div className={`${s.panel} ${s.glow} ${m.reveal} flex h-full flex-col justify-between gap-6 p-5 text-white sm:p-7`} style={{ "--i": 4 } as CSSProperties}>
      <div className="text-[clamp(22px,2.2vw,30px)] font-medium leading-[1.15] tracking-[-0.03em]">
        No lock-in. If you ever leave, your list leaves with you.
      </div>
      <ul className="flex flex-wrap gap-2 text-[12.5px] font-medium">
        {["Your contacts", "Your order history", "Your sign-up forms", "Your sending domain"].map((t) => (
          <li key={t} className="rounded-full bg-white/10 px-3 py-1.5 text-white/85">
            {t}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function AudienceOwnership() {
  const ref = useRef<HTMLElement>(null)
  const { seen, live, reduced } = usePlatformSection(ref)
  return (
    <section
      ref={ref}
      id="audience-ownership"
      aria-labelledby="audience-ownership-title"
      className={`${m.root} bg-black px-[var(--landing-gutter,22px)] py-[clamp(72px,9vw,128px)] text-white`}
    >
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-10 max-w-[920px] sm:mb-14">
          <StoryHeading id="audience-ownership-title" text="Your audience belongs to you." accent={["belongs", "to", "you"]} dark />
          <p className="mt-5 max-w-[60ch] text-[clamp(16px,1.4vw,19px)] leading-[1.6] text-[#a3a0ac]">
            Collect emails everywhere you sell, write to everyone in a few minutes, and keep the list. Storelib never sits between you and the people who follow you.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-12">
          <div className={`${s.panel} ${s.glow} ${m.reveal} px-3 pb-0 pt-6 sm:px-8 sm:pt-10 lg:col-span-7 lg:row-span-2`} style={{ "--i": 0 } as CSSProperties}>
            <div className="mb-6 px-2 sm:px-0">
              <h3 className="text-[20px] font-medium tracking-[-0.02em]">Write once, reach everyone</h3>
              <p className="mt-1.5 max-w-[48ch] text-[14.5px] leading-[1.55] text-white/60">
                Campaigns and automations from the same place as your products, with opens and clicks counted for you.
              </p>
            </div>
            <div className="-mb-10 sm:-mb-14">
              <Composer live={live} reduced={reduced} seen={seen} />
            </div>
          </div>
          <div className="lg:col-span-5">
            <Subscribers live={live} seen={seen} />
          </div>
          <div className="lg:col-span-5">
            <Sync />
          </div>
          <div className="lg:col-span-7">
            <Export />
          </div>
          <div className="lg:col-span-5">
            <NoLockIn />
          </div>
        </div>
      </div>
    </section>
  )
}
