"use client"

/*
  HOME SECTION 10: YOUR AUDIENCE BELONGS TO YOU. (wave 13: light, no subheading)

  Storelib's own Emails, drawn the way the app draws them:
  - the composer (components/email/compose/composer.tsx): a top bar with
    Send test, Schedule and Send, then the envelope, To, From, Subject and
    Preview, then the email itself. Once sent, an email's figures are the
    ones Emails lists for it: delivered, opened and clicked, with the open
    and click rates (app/(storelib)/app/emails/emails-home.tsx).
  - new subscribers as Contacts sees them: a name, an address and the door
    they came in by (lib/contacts/contact-source.ts: OnePage, Website,
    Checkout, a free download).
  - the five email platforms lib/integrations/catalog syncs today, Klaviyo,
    Omnisend, Brevo, MailerLite and Kit, in their own marks
    (./email-platform-logos), unsubscribes coming back from each.
  - contacts export as CSV and import from a CSV (app/(storelib)/app/contacts).

  The example is a creator's merch restock email: Hollow Pines, an outdoor
  filmmaking channel, bringing back its sold-out hoodie. Fictional, priced
  and worded the way a real one is.

  The composer plays one short loop while the section is on screen: the
  subject types itself, Send is pressed, a bar fills while it sends, and the
  envelope turns into the figures. Off screen, nothing runs.
*/

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { StoryHeading } from "@/components/marketing/story-heading"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { PlatformCount, usePlatformSection } from "./platform-motion"
import { EMAIL_PLATFORMS } from "./email-platform-logos"
import m from "./platform.module.css"
import s from "./audience-ownership.module.css"

const IMG = "/home/audience"
const SUBJECT = "The Ridge hoodie is back in stock"
const AUDIENCE = 18240
/** The sent email's figures: delivered, opened and clicked, of AUDIENCE. */
const RESULTS = [
  { label: "Delivered", value: 18113, of: AUDIENCE },
  { label: "Opened", value: 8402, of: 18113, rate: "open rate" },
  { label: "Clicked", value: 1291, of: 18113, rate: "click rate" },
]
/** How long the subject takes to type: one step per character. */
const TYPE_MS = SUBJECT.length * 42
const n = (v: number) => v.toLocaleString("en-US")
const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(1)}%`

/* ── The composer ────────────────────────────────────────────────────── */
type Phase = "typing" | "ready" | "pressed" | "sending" | "sent"

/*
  The loop is five state changes in nine seconds, nothing per frame. The
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
      at(TYPE_MS + 1300, () => setPhase("pressed"))
      at(TYPE_MS + 1500, () => setPhase("sending"))
      at(TYPE_MS + 3300, () => setPhase("sent"))
      at(TYPE_MS + 8800, run)
    }
    run()
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [live, reduced])
  return { phase, round }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid h-[42px] grid-cols-[62px_minmax(0,1fr)] items-center gap-x-2 border-b border-[#eef0f2] px-4 last:border-b-0 sm:h-[44px] sm:grid-cols-[76px_minmax(0,1fr)] sm:px-5">
      <span className="text-[12.5px] text-[#6b7280] sm:text-[13px]">{label}</span>
      <div className="min-w-0 truncate text-[12.5px] text-[#1a1a2e] sm:text-[13.5px]">{children}</div>
    </div>
  )
}

const BTN = "h-8 items-center rounded-lg border border-[#e2e4e8] bg-white px-3 text-[12.5px] font-medium text-[#1a1a2e]"

function Composer({ live, reduced }: { live: boolean; reduced: boolean }) {
  const { phase, round } = useComposerLoop(live, reduced)
  const sent = phase === "sent"
  const sending = phase === "sending"
  return (
    <div className={`${s.window} mx-auto w-full max-w-[520px] overflow-hidden rounded-[15px] bg-[#f7f7f8] text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.06),0_24px_48px_-24px_rgba(30,20,60,0.28),0_0_0_1px_rgba(16,24,40,0.06)]`}>
      {/* The bar */}
      <div className="relative flex items-center gap-2 border-b border-[#eceef1] bg-white px-3 py-2.5 sm:px-4">
        <span className="flex h-8 w-6 items-center justify-center text-[#6b7280]" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14.5px] font-semibold sm:text-[15px]">Ridge hoodie restock</span>
            <span className={`${s.swap} shrink-0 text-[11px] font-medium`}>
              <span data-on={String(!sent && !sending)} className="rounded-full bg-[#f1f2f4] px-2 py-0.5 text-[#5f6470]">Draft</span>
              <span data-on={String(sending)} className="rounded-full bg-[#f3efff] px-2 py-0.5 text-[#6d28d9]">Sending</span>
              <span data-on={String(sent)} className="rounded-full bg-[#e9f7ef] px-2 py-0.5 text-[#15803d]">Sent</span>
            </span>
          </div>
          <div className={`${s.swap} ${s.line} text-[11.5px] text-[#6b7280]`}>
            <span data-on={String(!sent && !sending)}>Saved</span>
            <span data-on={String(sending)}>Sending to {n(AUDIENCE)} subscribers</span>
            <span data-on={String(sent)}>Sent to {n(AUDIENCE)} subscribers · Just now</span>
          </div>
        </div>
        <span className={`${BTN} hidden md:inline-flex`}>Send test</span>
        <span className={`${BTN} hidden lg:inline-flex`}>Schedule</span>
        <span data-pressed={phase === "pressed" ? "" : undefined} className={`${s.sendBtn} inline-flex h-8 items-center rounded-lg bg-[#7c3aed] px-3.5 text-[12.5px] font-semibold text-white`}>
          Send
        </span>
        {/* Sending: one bar that fills, on the compositor. */}
        <span className={`${s.progress} absolute inset-x-0 bottom-[-1px] h-[2px] bg-[#7c3aed]`} data-on={String(sending || sent)} data-done={sent ? "" : undefined} aria-hidden="true" />
      </div>

      <div className="p-3 sm:p-4">
        {/* The envelope, and the same place once it is sent: the figures. */}
        <div className="grid">
          <div data-on={String(!sent)} className={`${s.face} col-start-1 row-start-1 rounded-xl bg-white shadow-[0_0_0_1px_rgba(16,24,40,0.06)]`}>
            <Field label="To">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[#f3efff] px-2 py-0.5 text-[12px] font-medium text-[#5b21b6]">
                All subscribers <span className="font-normal text-[#7c6aa6]">{n(AUDIENCE)}</span>
              </span>
            </Field>
            <Field label="From">
              Hollow Pines <span className="text-[#6b7280]">&lt;hello@hollowpines.co&gt;</span>
            </Field>
            <Field label="Subject">
              <span key={round} className={`${s.typed} ${phase === "typing" ? s.typing : ""} font-medium`} style={{ "--steps": SUBJECT.length, "--type-ms": `${TYPE_MS}ms` } as CSSProperties}>
                {SUBJECT}
                <span className={s.typeCover} aria-hidden="true" />
                <span className={s.typeCaret} aria-hidden="true">
                  <span className={`${s.caret} ${m.loop}`} />
                </span>
              </span>
            </Field>
            <Field label="Preview">
              <span className="text-[#4b5563]">Every size from S to XXL, and a new forest green</span>
            </Field>
          </div>
          <div data-on={String(sent)} className={`${s.face} col-start-1 row-start-1 grid grid-cols-3 rounded-xl bg-white shadow-[0_0_0_1px_rgba(16,24,40,0.06)]`} aria-hidden={!sent}>
            {RESULTS.map((r, i) => (
              <div key={r.label} className={`flex flex-col justify-center px-3 sm:px-5 ${i ? "border-l border-[#eef0f2]" : ""}`}>
                <div className="text-[12px] text-[#6b7280] sm:text-[12.5px]">{r.label}</div>
                <div className="mt-1 text-[clamp(19px,2vw,24px)] font-semibold leading-none tracking-[-0.03em] tabular-nums">{n(r.value)}</div>
                <div className="mt-1.5 text-[11.5px] text-[#6b7280] sm:text-[12px]">
                  <span className="font-medium text-[#1a1a2e]">{pct(r.value, r.of)}</span>
                  <span className="hidden sm:inline"> {r.rate ?? "of sent"}</span>
                </div>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-[#f1f0f5]">
                  <div className={`${s.fill} h-full rounded-full bg-[#7c3aed]`} style={{ transform: `scaleX(${sent ? r.value / r.of : 0})` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* The email */}
        <div className="mt-3 overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(16,24,40,0.06)]" aria-hidden="true">
          <div className="mx-auto max-w-[460px] px-5 pb-6 pt-5 sm:px-6">
            <div className="flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-[#1f2a1f]">
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="#1f2a1f">
                <path d="M10 1 4 11h3l-3 5h5v3h2v-3h5l-3-5h3z" />
              </svg>
              Hollow Pines
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${IMG}/ridge-hoodie-hero.webp`} alt="" width={640} height={380} loading="lazy" decoding="async" className="mt-4 aspect-[640/380] w-full rounded-lg object-cover" />
            <div className="mt-4 text-[18px] font-semibold leading-tight tracking-[-0.02em] sm:text-[20px]">The Ridge hoodie is back</div>
            <p className="mt-2 text-[12.5px] leading-[1.6] text-[#4b5563] sm:text-[13px]">
              It sold out in two days last time. This run comes in every size from S to XXL, in heather grey and a new forest green. Heavyweight 400gsm cotton, made to be worn on cold shoots.
            </p>
            <span className="mt-4 inline-flex h-9 items-center rounded-md bg-[#1f2a1f] px-5 text-[12.5px] font-semibold text-white">Shop the restock</span>
            <div className="mt-5 grid grid-cols-3 gap-2.5">
              {[
                { img: "ridge-hoodie.webp", name: "Ridge hoodie", price: "$64" },
                { img: "ridge-tee.webp", name: "705 tee", price: "$32" },
                { img: "trail-cap.webp", name: "Trail cap", price: "$28" },
              ].map((p) => (
                <div key={p.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${IMG}/${p.img}`} alt="" width={240} height={300} loading="lazy" decoding="async" className="aspect-[4/5] w-full rounded-md bg-[#f3f3f1] object-cover" />
                  <div className="mt-1.5 truncate text-[11.5px] font-medium">{p.name}</div>
                  <div className="text-[11.5px] text-[#6b7280]">{p.price}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── New subscribers ─────────────────────────────────────────────────── */
const PEOPLE = [
  { name: "Sofia Marín", email: "sofia.marin@gmail.com", via: "OnePage", from: "from Instagram", photo: "sofia" },
  { name: "Jonah Reyes", email: "jonah.reyes@outlook.com", via: "Checkout", from: "Ridge hoodie", photo: "jonah" },
  { name: "Aiko Tanaka", email: "aiko.tanaka@icloud.com", via: "Free download", from: "Trail map pack", photo: "aiko" },
  { name: "Liam O'Connor", email: "liam.oc@gmail.com", via: "Website", from: "footer form", photo: "liam" },
  { name: "Priya Nair", email: "priya.nair@yahoo.com", via: "OnePage", from: "from YouTube", photo: "priya" },
  { name: "Leo Fischer", email: "leo.fischer@gmx.de", via: "Checkout", from: "705 tee", photo: "leo" },
  { name: "Amara Okafor", email: "amara.okafor@gmail.com", via: "Free download", from: "LUT pack", photo: "amara" },
  { name: "Inès Laurent", email: "ines.laurent@orange.fr", via: "OnePage", from: "from TikTok", photo: "ines" },
]
const WHEN = ["Just now", "2 min ago", "6 min ago", "11 min ago"]

function Subscribers({ live, seen }: { live: boolean; seen: boolean }) {
  const [head, setHead] = useState(0)
  const [added, setAdded] = useState(0)
  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => {
      setHead((h) => (h + 1) % PEOPLE.length)
      setAdded((a) => a + 1)
    }, 2800)
    return () => window.clearInterval(id)
  }, [live])
  /*
    Four rows that stay in the page: each newcomer shifts the words down a
    row and the list slides in from above (the animation restarts by
    swapping between two identical keyframes). Nothing is inserted, so the
    site's :has() rules never restyle the document for a new subscriber.
  */
  const rows = [0, 1, 2, 3].map((k) => PEOPLE[(head - k + PEOPLE.length * 4) % PEOPLE.length])
  return (
    <div className={`${s.panel} ${m.reveal} flex h-full flex-col p-5 sm:p-7`} style={{ "--i": 1 } as CSSProperties}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-medium text-[#55525e]">Subscribers</h3>
          <div className="mt-1 text-[clamp(32px,3.4vw,42px)] font-semibold leading-none tracking-[-0.045em] text-[#0f0e13]">
            <PlatformCount value={AUDIENCE + added} from={AUDIENCE - 900} start={seen} duration={1800} />
          </div>
        </div>
        <span className="mb-0.5 inline-flex items-center rounded-full bg-[#e9f7ef] px-2.5 py-1 text-[12px] font-medium text-[#15803d]">+{n(312 + added)} this week</span>
      </div>
      <ul className={`${s.list} ${m.loop} mt-5 grid gap-2`} data-shift={added ? added % 2 : undefined} aria-hidden="true">
        {rows.map((r, k) => (
          <li key={k} className={`${s.row} flex items-center gap-3 rounded-[13px] bg-white px-3 py-2.5`} data-fresh={k === 0 && added > 0 ? "" : undefined}>
            {/* A real face, as Contacts shows a person's picture. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${IMG}/people/${r.photo}.webp`} alt="" width={36} height={36} decoding="async" className="h-9 w-9 shrink-0 rounded-full bg-[#eceaf0] object-cover shadow-[0_0_0_1px_rgba(16,24,40,0.06)]" />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13.5px] font-medium text-[#14131a]">{r.name}</span>
                <span className="shrink-0 text-[11.5px] text-[#8a8794]">{WHEN[k]}</span>
              </span>
              <span className="block truncate text-[12px] text-[#6b6875]">{r.email}</span>
              <span className="mt-1 block truncate text-[11.5px] text-[#55525e]">
                <span className="font-medium text-[#14131a]">{r.via}</span> · {r.from}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-auto pt-5 text-[14px] leading-[1.55] text-[#55525e]">
        Every sign-up form, checkout and free download adds to one list. Only people who said yes get your emails.
      </p>
    </div>
  )
}

/* ── Sync to an email platform ───────────────────────────────────────── */
function Sync() {
  return (
    <div className={`${s.panel} ${m.reveal} flex h-full flex-col p-5 sm:p-7`} style={{ "--i": 2 } as CSSProperties}>
      <h3 className="text-[20px] font-medium tracking-[-0.02em] text-[#0f0e13]">Already on an email platform?</h3>
      <p className="mt-1.5 text-[14.5px] leading-[1.55] text-[#55525e]">Subscribers, buyers and every order go out. Unsubscribes come back.</p>
      <div className="mt-auto pt-6" aria-hidden="true">
        <div className="flex justify-center">
          <span className="relative z-[1] block h-11 w-11">
            <StorelibLogo size={44} alt="" />
          </span>
        </div>
        {/* The branches: a trunk, a bar and a drop to each platform. A dot runs down each drop. */}
        <div className={s.tree}>
          <span className={s.trunk} />
          <span className={s.bar} />
          <ul className="grid grid-cols-5">
            {EMAIL_PLATFORMS.map(({ name, Logo }, k) => (
              <li key={name} className="flex flex-col items-center">
                <span className={s.drop}>
                  <span className={`${s.dot} ${m.loop}`} style={{ "--k": k } as CSSProperties} />
                </span>
                <span className="block h-11 w-11 overflow-hidden rounded-[12px] shadow-[0_0_0_1px_rgba(16,24,40,0.08),0_2px_6px_-2px_rgba(16,24,40,0.12)] sm:h-12 sm:w-12">
                  <Logo className="block h-full w-full" />
                </span>
                <span className="mt-2 text-[11.5px] font-medium text-[#2a2833] sm:text-[12.5px]">{name}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

/* ── Export, and no lock-in ──────────────────────────────────────────── */
const CSV_ROWS = [
  ["sofia.marin@gmail.com", "Sofia Marín", "OnePage"],
  ["jonah.reyes@outlook.com", "Jonah Reyes", "Checkout"],
  ["aiko.tanaka@icloud.com", "Aiko Tanaka", "Free download"],
]

function Export() {
  return (
    <div className={`${s.panel} ${m.reveal} flex h-full flex-col gap-6 p-5 sm:p-7 md:flex-row md:items-center`} style={{ "--i": 3 } as CSSProperties}>
      <div className="min-w-0 md:w-[46%] md:shrink-0">
        <h3 className="text-[20px] font-medium tracking-[-0.02em] text-[#0f0e13]">Download every contact, any time</h3>
        <p className="mt-1.5 text-[14.5px] leading-[1.55] text-[#55525e]">Names, emails, tags and where each person came from, as a CSV. Bring a list in the same way.</p>
        <span className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg border border-[#e2e4e8] bg-white px-3.5 text-[13px] font-medium text-[#1a1a2e]" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
          </svg>
          Export CSV
        </span>
      </div>
      {/* contacts.csv, opened: the columns the export writes. */}
      <div className="min-w-0 flex-1 overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(16,24,40,0.06),0_12px_28px_-18px_rgba(30,20,60,0.25)]" aria-hidden="true">
        <div className="flex items-center gap-2 border-b border-[#eef0f2] px-3.5 py-2.5">
          <span className="flex h-6 w-5 items-center justify-center rounded-[4px] bg-[#15803d] text-[7px] font-bold text-white">CSV</span>
          <span className="text-[12.5px] font-medium text-[#1a1a2e]">contacts.csv</span>
          <span className="ml-auto text-[11.5px] text-[#6b7280]">{n(AUDIENCE)} rows</span>
        </div>
        <table className="w-full table-fixed font-mono text-[10.5px] text-[#374151] sm:text-[11px]">
          <thead className="bg-[#fafafb] text-left text-[#6b7280]">
            <tr>
              <th className="w-[60%] truncate px-3.5 py-1.5 font-medium">email</th>
              <th className="truncate px-2 py-1.5 font-medium">source</th>
            </tr>
          </thead>
          <tbody>
            {CSV_ROWS.map((r) => (
              <tr key={r[0]} className="border-t border-[#f1f2f4]">
                <td className="truncate px-3.5 py-1.5">{r[0]}</td>
                <td className="truncate px-2 py-1.5">{r[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function NoLockIn() {
  return (
    <div className={`${s.panel} ${s.violet} ${m.reveal} flex h-full flex-col justify-between gap-6 p-5 sm:p-7 lg:flex-row lg:items-center`} style={{ "--i": 4 } as CSSProperties}>
      <div className="text-[clamp(22px,2.2vw,28px)] font-medium leading-[1.18] tracking-[-0.03em] text-[#1e1236]">No lock-in. If you ever leave, your list leaves with you.</div>
      <ul className="flex flex-wrap gap-2 text-[12.5px] font-medium lg:max-w-[340px] lg:shrink-0 lg:justify-end">
        {["Your contacts", "Your order history", "Your sign-up forms", "Your sending domain"].map((t) => (
          <li key={t} className="rounded-full bg-white px-3 py-1.5 text-[#3b2a63] shadow-[0_0_0_1px_rgba(91,33,182,0.1)]">
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
      className={`${m.root} bg-white px-[var(--landing-gutter,22px)] py-[var(--home-pad,clamp(72px,9vw,128px))] text-[#0f0e13]`}
    >
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-10 max-w-[920px] sm:mb-14">
          <StoryHeading id="audience-ownership-title" text="Your audience belongs to you." accent={["belongs", "to", "you"]} />
        </div>

        <div className="grid gap-4 lg:grid-cols-12">
          <div className={`${s.panel} ${s.stage} ${m.reveal} flex flex-col px-3 pt-6 sm:px-8 sm:pt-9 lg:col-span-7`} style={{ "--i": 0 } as CSSProperties}>
            <div className="mb-6 px-2 sm:px-0">
              <h3 className="text-[20px] font-medium tracking-[-0.02em] text-[#0f0e13]">Write once, reach everyone</h3>
              <p className="mt-1.5 max-w-[48ch] text-[14.5px] leading-[1.55] text-[#55525e]">Campaigns and automations from the same place as your products, with opens and clicks counted for you.</p>
            </div>
            <div className={s.bleed}>
              <Composer live={live} reduced={reduced} />
            </div>
          </div>
          <div className="lg:col-span-5">
            <Subscribers live={live} seen={seen} />
          </div>
          <div className="lg:col-span-7">
            <Export />
          </div>
          <div className="lg:col-span-5">
            <Sync />
          </div>
          <div className="lg:col-span-12">
            <NoLockIn />
          </div>
        </div>
      </div>
    </section>
  )
}
