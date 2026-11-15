"use client"

/*
  HOME SECTION 10: YOUR AUDIENCE BELONGS TO YOU.

  Landing round 5, the owner: "I don't like it. Make it more simple,
  different structure, more clean", one compact picture, much shorter, and
  nothing that glitches, flashes or stutters while the page scrolls past.

  So the section is two columns:
  - the words: the heading (no subheading, wave 13) and three short rows
    with a hairline between them (email from Storelib, sync to an email platform, take the
    list with you);
  - one picture: Contacts as the app draws it (app/(storelib)/app/contacts),
    a header with the count, five people and the door each came in by
    (lib/contacts/contact-source.ts: OnePage, Checkout, Website, a free
    download).

  Landing round 7, the owner: "add some chart graphic first to the contacts
  modal, then the 'synced with', then the export", "the autoplay smooth and
  clean", and real, different faces, not the basic stock profiles. Under
  the header the picture now plays three short scenes in that order, in one
  box of a fixed height (nothing around it moves):
    1. Growth: the list over 30 days, a line drawn in by a cover sliding off
       it (a transform), ending at today's 18,240.
    2. Synced with: the five email platforms Storelib syncs today
       (lib/integrations/catalog), in their own marks, coming in one by one.
    3. Export: contacts.csv filling as it is written (a scaleX), then
       Downloaded.
  The three names under the box say which scene is on, a hairline filling
  under the one playing. The scenes are stacked in one grid cell and cross
  fade by opacity and a 6px rise; the turn is ONE attribute written on the
  box every 3.6s (no React render, nothing per frame). It plays only while
  the section is on screen and the tab is visible (usePlatformSection);
  under reduced motion it rests on the growth line, drawn.

  The faces are Unsplash photographs of five different people (not the
  portraits used elsewhere on the page), 96px webp. The example list
  belongs to Hollow Pines, the fictional outdoor filmmaking channel the map
  below sells for.

  Landing round 7: the section sits in the page's one width (--home-edge
  and --home-max, app/globals.css), its heading set in by --home-head-inset.
*/

import { useEffect, useRef, type CSSProperties } from "react"
import { StoryHeading } from "@/components/marketing/story-heading"
import { EMAIL_PLATFORMS } from "./email-platform-logos"
import { usePlatformSection } from "./platform-motion"
import m from "./platform.module.css"
import s from "./audience-ownership.module.css"

const IMG = "/home/audience/people"
const AUDIENCE = 18240

/** The newest contacts, as Contacts lists them: a name, an address, the door they came in by and when. */
export const AUDIENCE_PEOPLE = [
  { name: "Niamh Byrne", email: "niamh.byrne@icloud.com", via: "OnePage", from: "Instagram", when: "2m", photo: "niamh" },
  { name: "Kofi Boateng", email: "kofi.boateng@gmail.com", via: "Checkout", from: "Ridge hoodie", when: "9m", photo: "kofi" },
  { name: "Minh Tran", email: "minh.tran@outlook.com", via: "Free download", from: "Trail map pack", when: "24m", photo: "minh" },
  { name: "Rachel Moore", email: "rachel.moore@yahoo.com", via: "Website", from: "Footer form", when: "1h", photo: "rachel" },
  { name: "Henrik Dahl", email: "henrik.dahl@proton.me", via: "Checkout", from: "Pines LUT pack", when: "2h", photo: "henrik" },
] as const

/** The three rows beside the picture. */
const POINTS = [
  { title: "One list from every sign-up", text: "Forms, checkouts and free downloads all add to it. Email it from Storelib, with opens and clicks counted." },
  { title: "Already on an email platform?", text: "Sync with Klaviyo, Omnisend, Brevo, MailerLite or Kit. Unsubscribes come back." },
  { title: "Download every contact, any time", text: "Names, emails, tags and where each person came from, as a CSV. No lock-in: if you ever leave, your list leaves with you." },
]

/** The scenes, in the order the owner asked for, and how long each plays. */
export const AUDIENCE_SCENES = ["Growth", "Synced with", "Export"] as const
export const AUDIENCE_SCENE_MS = 3600

const n = (v: number) => v.toLocaleString("en-US")

/*
  The list over 30 days: from 16,904 to 18,240, a little more on the days a
  video went out. Worked out once, at load, into one smooth path (Catmull-Rom
  turned into cubic curves) in a 300 x 96 box.
*/
const DAILY = [38, 41, 35, 44, 39, 52, 61, 47, 40, 37, 43, 38, 36, 49, 58, 72, 51, 42, 39, 41, 37, 45, 40, 44, 48, 39, 42, 46, 50, 41]
function growthPath() {
  const total = DAILY.reduce((a, b) => a + b, 0)
  const scale = (AUDIENCE - 16904) / total
  let v = 16904
  const vals = [v, ...DAILY.map((d) => (v += d * scale))]
  const lo = vals[0]
  const hi = vals[vals.length - 1]
  const pts = vals.map((y, i) => [(i / (vals.length - 1)) * 300, 88 - ((y - lo) / (hi - lo)) * 76] as const)
  let d = `M${pts[0][0]} ${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return { line: d, area: `${d}L300 96L0 96Z`, end: pts[pts.length - 1] }
}
const GROWTH = growthPath()

function Growth() {
  return (
    <div className={s.scene} data-i="0">
      <div className={s.sceneHead}>
        <span>Contacts, last 30 days</span>
        <span className={s.up}>+1,336</span>
      </div>
      <div className={s.chart}>
        <svg viewBox="0 0 300 96" preserveAspectRatio="none" focusable="false">
          <path d={GROWTH.area} className={s.area} />
          <path d={GROWTH.line} className={s.line} vectorEffect="non-scaling-stroke" />
        </svg>
        <span className={s.cover} />
        <span className={s.endDot} style={{ left: `${(GROWTH.end[0] / 300) * 100}%`, top: `${(GROWTH.end[1] / 96) * 100}%` }} />
      </div>
      <div className={s.axis}>
        <span>Oct 16</span>
        <span>Nov 15</span>
      </div>
    </div>
  )
}

function Synced() {
  return (
    <div className={s.scene} data-i="1">
      <div className={s.sceneHead}>
        <span>Synced with</span>
        <span>Unsubscribes come back</span>
      </div>
      <ul className={s.platforms}>
        {EMAIL_PLATFORMS.map(({ name, Logo }, i) => (
          <li key={name} style={{ "--d": i } as CSSProperties}>
            <span className={s.mark}>
              <Logo className="block h-full w-full" />
            </span>
            <span className={s.pname}>{name}</span>
            <span className={s.synced}>
              <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m2.5 6.2 2.3 2.3 4.7-4.9" />
              </svg>
              Synced
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Export() {
  return (
    <div className={s.scene} data-i="2">
      <div className={s.sceneHead}>
        <span>Export CSV</span>
        <span>All contacts</span>
      </div>
      <div className={s.file}>
        <span className={s.fileIcon}>CSV</span>
        <span className="min-w-0 flex-1">
          <span className={s.fileName}>contacts.csv</span>
          <span className={s.fileMeta}>
            <span className="tabular-nums">{n(AUDIENCE)}</span> rows · 2.1 MB
          </span>
          <span className={s.bar}>
            <span />
          </span>
        </span>
        <span className={s.fileState}>
          <span className={s.writing}>Writing</span>
          <span className={s.done}>Downloaded</span>
        </span>
      </div>
      <div className={s.columns}>name, email, tags, source, joined</div>
    </div>
  )
}

function Contacts() {
  const root = useRef<HTMLElement | null>(null)
  const player = useRef<HTMLDivElement>(null)
  const { live, reduced } = usePlatformSection(root, "100px 0px")
  useEffect(() => {
    const el = player.current
    if (!el || !live || reduced) return
    let i = Number(el.dataset.scene) || 0
    const id = window.setInterval(() => {
      i = (i + 1) % AUDIENCE_SCENES.length
      el.dataset.scene = String(i)
    }, AUDIENCE_SCENE_MS)
    return () => window.clearInterval(id)
  }, [live, reduced])
  return (
    <div
      ref={(node) => {
        root.current = node
      }}
      className={`${m.root} ${s.mock}`}
      role="img"
      aria-label={`Contacts: ${n(AUDIENCE)} people, up 1,336 in 30 days, synced with Klaviyo, Omnisend, Brevo, MailerLite and Kit, exported as a CSV. The newest came from a OnePage, a checkout, a free download and the website.`}
    >
      <div className={s.head} aria-hidden="true">
        <div className="min-w-0">
          <div className={s.headTitle}>Contacts</div>
          <div className={s.headCount}>
            <span className="tabular-nums">{n(AUDIENCE)}</span> people · <span className={s.up}>+312 this week</span>
          </div>
        </div>
        <span className={s.export}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
          </svg>
          Export CSV
        </span>
      </div>
      <div ref={player} className={s.player} data-scene="0" aria-hidden="true">
        <div className={s.scenes}>
          <Growth />
          <Synced />
          <Export />
        </div>
        <div className={s.steps}>
          {AUDIENCE_SCENES.map((label, i) => (
            <span key={label} className={s.step} data-i={i}>
              {label}
              <i />
            </span>
          ))}
        </div>
      </div>
      <ul className={s.rows} aria-hidden="true">
        {AUDIENCE_PEOPLE.map((p) => (
          <li key={p.photo} className={s.row}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${IMG}/${p.photo}.webp`} alt="" width={36} height={36} loading="lazy" decoding="async" className={s.face} />
            <span className="min-w-0">
              <span className={s.name}>{p.name}</span>
              <span className={s.email}>{p.email}</span>
            </span>
            <span className={s.source}>
              <span className={s.via}>{p.via}</span>
              <span className={s.from}>{p.from}</span>
            </span>
            <span className={s.when}>{p.when}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function AudienceOwnership() {
  return (
    <section id="audience-ownership" aria-labelledby="audience-ownership-title" className="bg-white py-[var(--home-pad,clamp(72px,9vw,128px))] text-[#0f0e13]">
      <div className={`${s.grid} home-wrap`}>
        <div className={s.words}>
          <StoryHeading id="audience-ownership-title" text="Your audience belongs to you." accent={["belongs", "to", "you"]} />
          <ul className={s.points}>
            {POINTS.map((p) => (
              <li key={p.title}>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
              </li>
            ))}
          </ul>
        </div>
        <Contacts />
      </div>
    </section>
  )
}
