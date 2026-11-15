import { CalendarDays, Check, CheckCircle2, Download, Heart, MessageCircle, Play, Truck, Users, Video } from "lucide-react"
import type { CSSProperties } from "react"
import { Pic, pic, u } from "./frame"

/*
  WHAT A STOREFRONT SELLS, AS SMALL SCENES (landing rounds 8 and 9).
  Each kind of thing sold is one scene on its own calm ground: the thing
  itself and the page that sells it, with a short moment playing while it is
  shown.

    Digital products  five covers passing in a slow row (the Cine Tones LUT
                      Pack, a Notion template, an e-book, a preset pack, a
                      font family); the one in the middle is drawn full size
                      and the buy card beside it is that product's
    Physical product  the Midnight Studio Tee: a size is picked, it goes in
                      the cart
    Course            Mixing in key, Tomás Reyes's course for new DJs (kept)
    Community         Applied AI Club, under a real banner: photo, mark, name
    Booking           A 1:1 training plan call with Talia Moreno (kept)

  Round 9, the owner: the Second Brain tablet "looks like very bad UI,
  inconsistent with the frame and the product card", and "I don't like the
  yellow headphones thing, get rid of it"; both are gone. Courses and
  bookings: "I love it", untouched but for where they stand on the narrower
  stage.

  Drawn at one design size per layout (1100 x 570 from 768px, 400 x 640
  below; `--u` in frame.tsx), so a picture is the same at any width. Round
  10, the owner: the scenes stood too tall ("reduce it just a little, 5 to
  10%"). 1040 x 600 became 1100 x 570: at the same width the stage is about
  a tenth shorter, everything in it drawn a little smaller, and the 60
  design pixels gained across go to the gaps between a picture and its card,
  so no scene is cropped or rearranged. Every
  moment is a CSS animation on transform and opacity, started when the scene
  becomes the chosen one and paused while the section is off screen
  (business-carousel.tsx). Without motion every scene stands at its resting
  style: the finished moment, and for the covers the first one in the middle.

  Photographs: Unsplash (free licence), re-encoded small in public/home/showcase.
*/

/* ================================================================ Digital products */
/** One step of the row: a cover rests in the middle, then the next slides in. */
export const DIGITAL_STEP_S = 2.6
const DIGITAL_HOLD_S = 1.7

export const DIGITAL_PRODUCTS = [
  { id: "lut", kind: "LUT pack", name: "Cine Tones LUT Pack", by: "Mara Quinn", price: "$29", note: ".cube files for Resolve, Premiere and Final Cut" },
  { id: "drums", kind: "Sample pack", name: "Low Room Drums", by: "Jun Park", price: "$24", note: "240 one-shots and 60 loops, 24-bit WAV" },
  { id: "book", kind: "E-book", name: "Slow Sundays", by: "Ana Folau", price: "$16", note: "PDF and EPUB, 112 pages, 40 recipes" },
  { id: "presets", kind: "Preset pack", name: "Highland Presets", by: "Kofi Mensah", price: "$18", note: "12 presets for Lightroom on desktop and phone" },
  { id: "font", kind: "Font family", name: "Orlo Grotesk", by: "Vane Type", price: "$45", note: "8 weights, desktop and web licence" },
] as const

/* The sample pack's cover carries one bar of its sound as a waveform: these are its bars' heights (percent). */
const WAVE = [92, 30, 14, 8, 60, 22, 10, 6, 96, 34, 16, 70, 26, 12, 64, 20, 9, 5, 88, 28, 12, 72, 24, 10, 58, 18, 8, 4] as const

/*
  A cover's photograph loads with the scene, not lazily: the row is clipped by its rail, so a lazy picture would only
  be asked for as its cover slides in, and arrive as a grey box turning into a photograph mid glide. The section
  itself is mounted late (lazy-sections.tsx), so nothing is fetched before it is near.
*/
function Still({ src, w, h, className = "bc-still" }: { src: string; w: number; h: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={w} height={h} loading="eager" decoding="async" draggable={false} className={className} />
}

function Cover({ id }: { id: (typeof DIGITAL_PRODUCTS)[number]["id"] }) {
  if (id === "lut")
    return (
      <span className="bc bc-lut">
        <Still src="/home/everything/lut-still.webp" w={720} h={405} />
        <span className="bc-tag">LUT Pack</span>
        <span className="bc-big">
          <span>Cine</span>
          <span>Tones</span>
        </span>
      </span>
    )
  if (id === "drums")
    return (
      <span className="bc bc-drums">
        <Still src={pic("bz-drums")} w={640} h={800} />
        <span className="bc-tag">Sample pack</span>
        <span className="bc-vol">Vol. 2</span>
        <span className="bc-big">
          <span>Low Room</span>
          <span>Drums</span>
        </span>
        <span className="bc-wave">
          {WAVE.map((h, k) => (
            <i key={k} style={{ "--h": h / 100 } as CSSProperties} />
          ))}
        </span>
        <span className="bc-spec">240 one-shots · 60 loops · WAV</span>
      </span>
    )
  if (id === "book")
    return (
      <span className="bc bc-book">
        <Still src={pic("bz-ebook")} w={640} h={800} />
        <span className="bc-title">
          Slow
          <br />
          Sundays
        </span>
        <span className="bc-line">40 recipes for long lunches</span>
        <span className="bc-foot">Ana Folau</span>
      </span>
    )
  if (id === "presets")
    return (
      <span className="bc bc-presets">
        <Still src={pic("bz-presets")} w={640} h={800} />
        <span className="bc-tag">12 Lightroom presets</span>
        <span className="bc-title">Highland</span>
      </span>
    )
  return (
    <span className="bc bc-font">
      <span className="bc-tag">Font family</span>
      <span className="bc-glyph">Rg</span>
      <span className="bc-title">Orlo Grotesk</span>
      <span className="bc-line">8 weights, Light to Black</span>
    </span>
  )
}

/* The row holds one set of covers and the three that stand around its ends, so it can start again where it looks the same. */
const SLOTS = [4, 0, 1, 2, 3, 4, 0, 1] as const

export function DigitalScene() {
  return (
    <div className="bs bs-digital">
      <div className="bd-rail">
        <div className="bd-track">
          {SLOTS.map((p, k) => (
            <span key={k} className="bd-slot" data-p={p} style={{ "--p": p } as CSSProperties}>
              <span className="bd-cover">
                <Cover id={DIGITAL_PRODUCTS[p].id} />
              </span>
            </span>
          ))}
        </div>
      </div>
      <div className="bs-card bd-card">
        <div className="bd-infos">
          {DIGITAL_PRODUCTS.map((d, p) => (
            <div key={d.id} className="bd-info" data-p={p} style={{ "--p": p } as CSSProperties}>
              <p className="bs-kicker">{d.kind}</p>
              <h4>{d.name}</h4>
              <p className="bs-by">by {d.by}</p>
              <p className="bs-price">{d.price}</p>
              <p className="bs-desc">{d.note}</p>
            </div>
          ))}
        </div>
        <p className="bd-instant">
          <Download /> Instant download after checkout
        </p>
        <span className="bs-btn">Buy now</span>
      </div>
    </div>
  )
}

/* ================================================================ Physical products */
/** One product's turn in the physical scene: it comes in, an option is picked, it goes in the cart. */
export const PHYSICAL_STEP_S = 2.8

/*
  Four things one merch store ships (landing round 11, the owner: "add more
  examples going around and changing, at least 3"). Each photograph is baked
  onto its own flat ground (public/home/showcase/bz-*.webp), and `ground` is
  that colour, so the whole stage takes the product's colour as it comes in.
*/
export const PHYSICAL_PRODUCTS = [
  { id: "tee", pic: "bz-tee", ground: "#efedec", name: "Midnight Studio Tee", sub: "Heavyweight cotton, black", price: "$32", label: "Size", options: ["XS", "S", "M", "L", "XL"], pick: 2, ship: "Ships in 2 days" },
  { id: "cap", pic: "bz-cap", ground: "#ededed", name: "Washed Studio Cap", sub: "Washed cotton twill, one size", price: "$28", label: "Colour", options: ["Charcoal", "Sand", "Black"], pick: 0, ship: "Ships in 2 days" },
  { id: "tote", pic: "bz-tote", ground: "#bec5ca", name: "Market Tote", sub: "Heavy canvas, natural", price: "$24", label: "Size", options: ["Standard", "Large"], pick: 0, ship: "Ships in 3 days" },
  { id: "print", pic: "bz-print", ground: "#e7e2da", name: "Field Study No. 4", sub: "Art print on cotton rag paper", price: "$40", label: "Size", options: ["A4", "A3", "A2"], pick: 1, ship: "Printed to order, ships in 4 days" },
] as const

export function TeeScene() {
  return (
    <div className="bs bs-tee">
      {PHYSICAL_PRODUCTS.map((d, p) => (
        <div key={d.id} className="bt-item" data-p={p} style={{ "--p": p, background: d.ground } as CSSProperties}>
          <div className="bt-photo">
            <Still src={pic(d.pic)} w={960} h={960} className="smk-pic bt-pic" />
          </div>
        </div>
      ))}
      <div className="bs-card bt-card">
        {/* The store's four products, the one on show ringed. */}
        <span className="bt-thumbs" aria-hidden="true">
          <span className="bt-thumb-ring" />
          {PHYSICAL_PRODUCTS.map((d) => (
            <i key={d.id} style={{ background: d.ground }}>
              <Still src={pic(d.pic)} w={960} h={960} className="smk-pic" />
            </i>
          ))}
        </span>
        <div className="bt-infos">
          {PHYSICAL_PRODUCTS.map((d, p) => (
            <div key={d.id} className="bt-info" data-p={p} style={{ "--p": p } as CSSProperties}>
              <h4>{d.name}</h4>
              <p className="bs-by">{d.sub}</p>
              <p className="bs-price">{d.price}</p>
              <p className="bs-label">{d.label}</p>
              <span className="bt-opts" style={{ "--n": d.options.length, "--k": d.pick } as CSSProperties}>
                <span className="bs-ring bt-ring" />
                {d.options.map((o) => (
                  <i key={o}>{o}</i>
                ))}
              </span>
              <p className="bs-ship">
                <Truck /> {d.ship}
              </p>
            </div>
          ))}
        </div>
        <span className="bs-btn bs-press bs-swap">
          <span className="a">Add to cart</span>
          <span className="b">
            <Check /> Added to cart
          </span>
        </span>
      </div>
      <span className="bt-toasts">
        {PHYSICAL_PRODUCTS.map((d, p) => (
          <span key={d.id} className="bt-added" data-p={p} style={{ "--p": p } as CSSProperties}>
            <i style={{ background: d.ground }}>
              <Still src={pic(d.pic)} w={960} h={960} className="smk-pic" />
            </i>
            <span>
              <b>{d.name}</b>
              <em>
                {d.options[d.pick]} · {d.price}
              </em>
            </span>
            <CheckCircle2 />
          </span>
        ))}
      </span>
    </div>
  )
}

/* ================================================================ Course (kept as it was, the owner: "keep the courses how it is") */
const LESSONS = [
  ["1", "Counting bars and phrases", "9:20", "done"],
  ["2", "Beatmatching by ear", "14:05", "done"],
  ["3", "Mixing in key", "11:40", "now"],
  ["4", "Your first 30 minute set", "16:10", ""],
] as const

export function CourseScene() {
  return (
    <div className="bs bs-course">
      <div className="bs-ccard">
        <div className="bp-player">
          <Pic n="bz-dj" w={1000} h={600} className="bp-player-pic" />
          <span className="bp-play">
            <Play fill="currentColor" strokeWidth={0} />
          </span>
          <em>Lesson 3 · Mixing in key</em>
          <span className="bp-bar">
            <i />
          </span>
        </div>
        <div className="bp-course-body">
          <div className="bp-course-head">
            <div>
              <p className="bs-kicker">Course</p>
              <h4>Mixing in key, for new DJs</h4>
              <p className="bs-by">by Tomás Reyes · 16 lessons · 3 h 10 min</p>
            </div>
            <span className="bp-course-buy">
              <b>$79</b>
              <span className="bs-btn">Enroll</span>
            </span>
          </div>
          <div className="bp-lessons-wrap">
            <span className="bp-now" />
            <ol className="bp-lessons">
            {LESSONS.map(([n, title, d, s]) => (
              <li key={n} className={s}>
                <i>
                  {s === "done" ? <Check /> : n}
                  {s === "now" && (
                    <span className="bp-done-tick">
                      <Check />
                    </span>
                  )}
                </i>
                <b>{title}</b>
                <em>{d}</em>
              </li>
            ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ================================================================ Community */
const SPACES = ["show-and-tell", "prompts", "tools-and-stack"] as const
const POSTS = [
  ["av-k", "Priya N.", "2 min", "Shipped my first agent. It drafts replies to supplier emails and asks before sending. Notes in the thread.", "23"],
  ["av-f", "Marco D.", "5 min", "Compared three models on our invoice scans this week. The small local one won on cost.", "11"],
  ["av-h", "Sam Adeyemi", "Host", "Wednesday's build starts at 6. Bring one task you repeat every week and we automate it together.", "48"],
] as const

export function ClubScene() {
  return (
    <div className="bs bs-club">
      <div className="bs-com">
        <div className="bs-com-cover">
          <Pic n="bz-ai-club" w={900} h={520} className="bs-com-pic" />
          {/* The club's own logo: three joined points (a small agent graph) on its lime, and the name set beside it. */}
          <span className="bs-com-logo">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <rect width="32" height="32" rx="8" fill="#d9f969" />
              <path d="M10 21.5 16 10l6 11.5H10Z" fill="none" stroke="#123227" strokeWidth="2.4" strokeLinejoin="round" />
              <circle cx="16" cy="10" r="3.4" fill="#123227" />
              <circle cx="10" cy="21.5" r="3.4" fill="#123227" />
              <circle cx="22" cy="21.5" r="3.4" fill="#d9f969" stroke="#123227" strokeWidth="2.4" />
            </svg>
            <b>
              applied<i>ai</i>club
            </b>
          </span>
          <span className="bs-com-word">
            <b>Build one AI tool a week</b>
            <i>Live builds every Wednesday at 6 pm</i>
          </span>
          <span className="bs-com-host">
            <Pic n="av-h" w={96} h={96} />
            <em>Hosted by Sam Adeyemi</em>
          </span>
        </div>
        <div className="bs-com-body">
          <div className="bs-com-head">
            <div>
              <p className="bs-kicker">Community</p>
              <h4>Applied AI Club</h4>
              <p className="bs-by">
                <Users /> 2,480 members · $12 a month
              </p>
            </div>
            <span className="bs-btn">Join for $12</span>
          </div>
          <div className="bs-event">
            <span className="bs-date">
              <i>Wed</i>
              <b>18</b>
            </span>
            <span>
              <b>Live build: an inbox agent</b>
              <i>6:00 pm · on video</i>
            </span>
            <em>214 going</em>
          </div>
          <span className="bs-spaces">
            {SPACES.map((s) => (
              <i key={s}>{s}</i>
            ))}
          </span>
        </div>
      </div>
      <div className="bs-feed">
        <p className="bs-feed-h">
          <i /> Live in show-and-tell
        </p>
        {POSTS.map(([av, name, when, text, likes], i) => (
          <div key={name} className="bs-post" style={{ "--i": i } as CSSProperties}>
            <Pic n={av} w={96} h={96} className="bs-post-av" />
            <div>
              <p className="bs-post-h">
                <b>{name}</b>
                <i>{when}</i>
              </p>
              <p className="bs-post-t">{text}</p>
              <p className="bs-post-r">
                <span className={i === 0 ? "bs-like" : undefined}>
                  <Heart /> {i === 0 ? <span className="bs-count"><s>{Number(likes) - 1}</s><b>{likes}</b></span> : likes}
                </span>
                <span>
                  <MessageCircle /> Reply
                </span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ================================================================ Booking */
const DAYS = [
  ["Mon", "16"],
  ["Tue", "17"],
  ["Wed", "18"],
  ["Thu", "19"],
  ["Fri", "20"],
] as const
const TIMES = ["7:00", "8:30", "12:00", "17:30", "18:30", "19:15"] as const

export function CoachScene() {
  return (
    <div className="bs bs-coach">
      <div className="bs-coach-photo">
        <Pic n="bz-coach" w={760} h={1000} className="bs-coach-pic" />
        <span className="bs-coach-name">
          <b>Talia Moreno</b>
          <i>Strength coach, online and in Austin</i>
        </span>
      </div>
      <div className="bs-card bs-book">
        <p className="bs-kicker">Booking</p>
        <h4>1:1 training plan call</h4>
        <p className="bs-meta">
          <span>
            <CalendarDays /> 45 min
          </span>
          <span>
            <Video /> Video call
          </span>
          <b>$75</b>
        </p>
        <p className="bs-label">November</p>
        <span className="bs-days">
          <span className="bs-ring bs-ring-day" />
          {DAYS.map(([d, n]) => (
            <i key={d}>
              <em>{d}</em>
              <b>{n}</b>
            </i>
          ))}
        </span>
        <span className="bs-times">
          <span className="bs-ring bs-ring-time" />
          {TIMES.map((t) => (
            <i key={t}>{t}</i>
          ))}
        </span>
        <span className="bs-btn bs-press">Book Thu 19 at 17:30</span>
        <span className="bs-booked">
          <CheckCircle2 />
          <span>
            <b>Booked for Thu 19, 17:30</b>
            <i>The invite is in your inbox</i>
          </span>
        </span>
      </div>
    </div>
  )
}

/*
  The moments. Each is a delay into the scene's turn (business-carousel.tsx),
  and the resting style of every element is its end. `.bz-on` is set on the
  scene's frame while it is the chosen one (or fading out under the next), so
  these run from the start each time it comes back.

  The digital row is the one loop: a cover rests in the middle for
  DIGITAL_HOLD_S, then the row glides one cover along; after the last it is
  back where it began (the row carries the first covers again at its end).
  Each cover and each buy card run the same clock, set back by their place in
  the row, so the cover in the middle is the one drawn full size and the one
  the card names. Three kinds of animation, all on the compositor.
*/
const E = "cubic-bezier(.22,1,.36,1)"
const GLIDE = "cubic-bezier(.65,0,.25,1)"
const COUNT = DIGITAL_PRODUCTS.length
const CYCLE_S = +(COUNT * DIGITAL_STEP_S).toFixed(2)
const pct = (s: number) => `${+((s / CYCLE_S) * 100).toFixed(2)}%`
const rowAt = (n: number) => `transform:translate3d(calc(var(--pitch) * ${-(1.5 + n)}),0,0)`
const SMALL = "transform:scale(.78);opacity:.5"
const FULL = "transform:none;opacity:1"
const DIGITAL_FRAMES = `
@keyframes bd-run{${Array.from({ length: COUNT }, (_, n) => `${pct(n * DIGITAL_STEP_S)},${pct(n * DIGITAL_STEP_S + DIGITAL_HOLD_S)}{${rowAt(n)};animation-timing-function:${GLIDE}}`).join("")}100%{${rowAt(COUNT)}}}
@keyframes bd-focus{0%,${pct(DIGITAL_HOLD_S)}{${FULL};animation-timing-function:${GLIDE}}${pct(DIGITAL_STEP_S)}{${SMALL}}${pct(CYCLE_S - DIGITAL_STEP_S + DIGITAL_HOLD_S)}{${SMALL};animation-timing-function:${GLIDE}}100%{${FULL}}}
@keyframes bd-info{0%,${pct(DIGITAL_HOLD_S - 0.15)}{opacity:1;transform:none}${pct(DIGITAL_HOLD_S + 0.25)}{opacity:0;transform:translate3d(0,-8u,0)}${pct(CYCLE_S - 0.5)}{opacity:0;transform:translate3d(0,10u,0)}100%{opacity:1;transform:none}}
`
const LOOP = `${CYCLE_S}s linear calc(var(--p) * ${DIGITAL_STEP_S}s - ${CYCLE_S}s) infinite`
/*
  The physical row runs the same way: each product's ground, photograph, card
  text and "added" note are on one clock set back by its place, so one
  product is on show at a time and the next fades in over it. What happens
  inside a turn (the option ringed, the button pressed) is one short loop as
  long as a turn, shared by all four.
*/
const P_COUNT = PHYSICAL_PRODUCTS.length
const P_CYCLE_S = +(P_COUNT * PHYSICAL_STEP_S).toFixed(2)
const pp = (s: number) => `${+((s / P_CYCLE_S) * 100).toFixed(2)}%`
const ps = (f: number) => `${+(f * 100).toFixed(2)}%`
const P_FADE = 0.45
/* A product under the next one stays drawn until that one is fully in, then goes (it cannot be seen): no two grounds ever show through each other. The last runs under the first, so it is the one that fades out. */
const S_OUT = PHYSICAL_STEP_S + 0.02
const P_LOOP = `${P_CYCLE_S}s linear calc(var(--p) * ${PHYSICAL_STEP_S}s - ${P_CYCLE_S}s) infinite`
const P_STEP = `${PHYSICAL_STEP_S}s linear infinite`
const thumbAt = (n: number) => `transform:translate3d(calc(var(--tp) * ${n}),0,0)`
const PHYSICAL_FRAMES = `
@keyframes bt-show{0%,${pp(S_OUT)}{opacity:1}${pp(S_OUT + 0.02)},${pp(P_CYCLE_S - P_FADE)}{opacity:0;animation-timing-function:ease}100%{opacity:1}}
@keyframes bt-show-a{0%,${pp(S_OUT)}{opacity:1}${pp(S_OUT + 0.02)},${pp(P_CYCLE_S - P_FADE)}{opacity:0}${pp(P_CYCLE_S - P_FADE + 0.02)},100%{opacity:1}}
@keyframes bt-show-z{0%,${pp(PHYSICAL_STEP_S - P_FADE)}{opacity:1;animation-timing-function:ease}${pp(PHYSICAL_STEP_S)},${pp(P_CYCLE_S - P_FADE)}{opacity:0;animation-timing-function:ease}100%{opacity:1}}
@keyframes bt-info{0%,${pp(PHYSICAL_STEP_S - P_FADE)}{opacity:1;transform:none;animation-timing-function:ease}${pp(PHYSICAL_STEP_S - 0.05)}{opacity:0;transform:translate3d(0,-8u,0)}${pp(P_CYCLE_S - P_FADE)}{opacity:0;transform:translate3d(0,10u,0);animation-timing-function:${E}}100%{opacity:1;transform:none}}
@keyframes bt-pic{0%,${pp(S_OUT + 0.02)}{transform:none}${pp(S_OUT + 0.04)},${pp(P_CYCLE_S - P_FADE)}{transform:translate3d(18u,0,0);animation-timing-function:${E}}100%{transform:none}}
@keyframes bt-toast{0%,${pp(1.3)}{opacity:0;transform:translate3d(0,12u,0);animation-timing-function:${E}}${pp(1.75)},${pp(PHYSICAL_STEP_S - P_FADE)}{opacity:1;transform:none;animation-timing-function:ease}${pp(PHYSICAL_STEP_S - 0.1)},100%{opacity:0;transform:none}}
@keyframes bt-thumb{${Array.from({ length: P_COUNT }, (_, n) => `${pp(n * PHYSICAL_STEP_S)},${pp((n + 1) * PHYSICAL_STEP_S - 0.5)}{${thumbAt(n)};animation-timing-function:${GLIDE}}`).join("")}100%{${thumbAt(0)}}}
@keyframes bt-pick{0%,${ps(0.16)}{opacity:0;transform:translate3d(calc((100% + 8u) * var(--k)),0,0) scale(.8);animation-timing-function:${E}}${ps(0.3)},100%{opacity:1;transform:translate3d(calc((100% + 8u) * var(--k)),0,0)}}
@keyframes bt-press{0%,${ps(0.4)}{transform:none}${ps(0.44)}{transform:scale(.95)}${ps(0.5)},100%{transform:none}}
@keyframes bt-swap-a{0%,${ps(0.44)}{opacity:1;transform:none}${ps(0.5)},${ps(0.9)}{opacity:0;transform:translate3d(0,-10u,0)}${ps(0.905)}{opacity:0;transform:translate3d(0,10u,0)}100%{opacity:1;transform:none}}
@keyframes bt-swap-b{0%,${ps(0.47)}{opacity:0;transform:translate3d(0,10u,0);animation-timing-function:${E}}${ps(0.56)},${ps(0.86)}{opacity:1;transform:none}${ps(0.9)},100%{opacity:0;transform:translate3d(0,-10u,0)}}
`
const MOTION = `
@media(prefers-reduced-motion:no-preference){
.bz-on .bs-card,.bz-on .bs-com,.bz-on .bs-ccard{animation:bz-rise .8s ${E} .1s both}
.bz-on .bs-coach-pic{animation:bz-push 7s cubic-bezier(.25,.6,.3,1) both}

.bz-on .bd-track{animation:bd-run ${CYCLE_S}s linear infinite}
.bz-on .bd-cover{animation:bd-focus ${LOOP}}
.bz-on .bd-info{animation:bd-info ${LOOP}}

.bz-on .bt-item{animation:bt-show ${P_LOOP}}
.bz-on .bt-item[data-p="0"]{animation-name:bt-show-a}
.bz-on .bt-item[data-p="${P_COUNT - 1}"]{animation-name:bt-show-z}
.bz-on .bt-info{animation:bt-info ${P_LOOP}}
.bz-on .bt-pic{animation:bt-pic ${P_LOOP}}
.bz-on .bt-added{animation:bt-toast ${P_LOOP}}
.bz-on .bt-thumb-ring{animation:bt-thumb ${P_CYCLE_S}s linear infinite}
.bz-on .bt-ring{animation:bt-pick ${P_STEP}}
.bz-on .bs-tee .bs-press{animation:bt-press ${P_STEP}}
.bz-on .bs-tee .bs-swap .a{animation:bt-swap-a ${P_STEP}}
.bz-on .bs-tee .bs-swap .b{animation:bt-swap-b ${P_STEP}}

.bz-on .bp-bar i{animation:bz-play 4.2s linear .6s both}
.bz-on .bp-play{animation:bz-pop .5s ${E} .3s both}
.bz-on .bp-done-tick{animation:bz-tick .4s ${E} 4.9s both}
.bz-on .bp-now{animation:bz-next .55s ${E} 5s both}

.bz-on .bs-post{animation:bz-rise .6s ${E} calc(.9s + var(--i) * .85s) both}
.bz-on .bs-feed-h{animation:bz-in .5s ease .5s both}
.bz-on .bs-feed-h i::after{animation:bz-ping 1.8s ease-out .8s 3 both}
.bz-on .bs-count s{animation:bz-up-out .35s ${E} 3.9s both}
.bz-on .bs-count b{animation:bz-up-in .35s ${E} 3.9s both}
.bz-on .bs-like svg{animation:bz-press .35s ease 3.85s both}

.bz-on .bs-ring-day{animation:bz-day 2.2s ${E} .9s both}
.bz-on .bs-ring-time{animation:bz-time 1.6s ${E} 2.2s both}
.bz-on .bs-coach .bs-press{animation:bz-press .36s ease 3.9s both}
.bz-on .bs-booked{animation:bz-rise .6s ${E} 4.2s both}
}
@keyframes bz-rise{from{opacity:0;transform:translate3d(0,18u,0)}}
@keyframes bz-push{from{transform:scale(1.05)}}
@keyframes bz-tick{from{opacity:0;transform:scale(.3)}}
@keyframes bz-press{50%{transform:scale(.95)}}
@keyframes bz-pop{from{opacity:0;transform:scale(.6)}}
@keyframes bz-ping{from{opacity:.55;transform:scale(1)}to{opacity:0;transform:scale(2.6)}}
@keyframes bz-out{from{opacity:1;transform:none}to{opacity:0;transform:translate3d(0,-10u,0)}}
@keyframes bz-in{from{opacity:0;transform:translate3d(0,10u,0)}}
@keyframes bz-play{from{transform:scaleX(.08)}}
@keyframes bz-next{from{transform:translate3d(0,calc(var(--row) * -1),0)}}
@keyframes bz-up-out{from{opacity:1;transform:none}to{opacity:0;transform:translate3d(0,-8u,0)}}
@keyframes bz-up-in{from{opacity:0;transform:translate3d(0,8u,0)}}
@keyframes bz-day{0%{opacity:0;transform:translate3d(calc(var(--day) * 1),0,0) scale(.8)}18%,42%{opacity:1;transform:translate3d(calc(var(--day) * 1),0,0)}}
@keyframes bz-time{0%{opacity:0;transform:translate3d(calc(100% + 8u),-48u,0) scale(.8)}25%,45%{opacity:1;transform:translate3d(calc(100% + 8u),-48u,0)}}
@keyframes bt-size{0%{opacity:0;transform:translate3d(calc(100% + 8u),0,0) scale(.8)}25%,45%{opacity:1;transform:translate3d(calc(100% + 8u),0,0)}}
${DIGITAL_FRAMES}${PHYSICAL_FRAMES}`

export const BUSINESS_MOCK_CSS =
  u(`
.bz-frame{aspect-ratio:1100/570;border-radius:inherit}
.bz-frame>.smk{--w:1100}
.bs{position:absolute;inset:0;overflow:hidden;color:#18181b;font-size:14u;line-height:1.4}
.bs svg{width:15u;height:15u;flex:none}
.bs-card{position:absolute;display:flex;flex-direction:column;width:360u;padding:28u 28u 26u;border-radius:22u;background:#fff;box-shadow:0 0 0 1u rgba(16,24,40,.05),0 2u 4u rgba(16,24,40,.04),0 30u 60u -28u rgba(16,24,40,.4)}
.bs-kicker{font-size:11.5u;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#71717a}
.bs h4{margin:6u 0 0;font-size:25u;font-weight:650;line-height:1.12;letter-spacing:-.02em}
.bs-by{display:flex;align-items:center;gap:6u;margin-top:5u!important;font-size:13.5u;color:#71717a}
.bs-by svg{width:14u;height:14u}
.bs-price{margin-top:14u!important;font-size:23u;font-weight:650;letter-spacing:-.01em}
.bs-desc{margin-top:8u!important;font-size:13.5u;line-height:1.5;color:#52525b}
.bs-label{margin-top:16u!important;font-size:12.5u;font-weight:500;color:#52525b}
.bs-btn{position:relative;display:grid;place-items:center;height:46u;margin-top:auto;padding:0 20u;border-radius:13u;background:#18181b;color:#fff;font-size:14.5u;font-weight:600;white-space:nowrap}

/* digital: covers pass in a slow row; the one in the middle is full size and the card is its page */
.bs-digital{background:#f0eff1}
.bd-rail{position:absolute;left:0;top:0;bottom:0;width:740u;overflow:hidden}
.bd-track{--pitch:292u;position:absolute;left:352u;top:50%;display:flex;margin-top:-175u;transform:translate3d(calc(var(--pitch) * -1.5),0,0)}
.bd-slot{flex:none;display:grid;place-items:center;width:var(--pitch)}
.bd-cover{position:relative;display:block;width:280u;height:350u;border-radius:14u;overflow:hidden;container-type:inline-size;transform:scale(.78);opacity:.5;box-shadow:0 0 0 1u rgba(16,24,40,.06),0 26u 44u -26u rgba(16,24,40,.5)}
.bd-slot[data-p="0"] .bd-cover{transform:none;opacity:1}
.bd-card{right:64u;top:50%;width:340u;height:368u;margin-top:-184u}
.bd-infos{display:grid}
.bd-info{grid-area:1/1;opacity:0}
.bd-info[data-p="0"]{opacity:1}
.bd-instant{display:flex;align-items:center;gap:9u;margin-top:16u!important;padding-top:15u;border-top:1u solid #f0f0f1;font-size:13u;color:#52525b}
.bd-instant svg{color:#71717a}

/* the five covers, each sized in its own width (cqw), so one drawing serves the computer's row and the phone's */
.bc{position:absolute;inset:0;display:block;overflow:hidden;color:#fff}
.bc-still{position:absolute;left:0;top:0;display:block;width:100%;height:100%;object-fit:cover;background:#e9e6e1}
.bc-tag{position:absolute;z-index:2;left:7cqw;top:7cqw;font-size:4.8cqw;font-weight:600;line-height:1;letter-spacing:.14em;text-transform:uppercase}
.bc-title,.bc-line,.bc-foot,.bc-big,.bc-glyph{position:absolute;z-index:2}
.bc-lut{background:#0a0a0b}
.bc-lut>.bc-still{height:58%;object-position:50% 60%;background:#0a0a0b}
.bc-lut::before{content:"";position:absolute;z-index:1;left:0;right:0;top:0;height:26%;background:linear-gradient(rgba(10,10,11,.5),rgba(10,10,11,0))}
.bc-lut::after{content:"";position:absolute;z-index:1;left:0;right:0;top:22%;height:37%;background:linear-gradient(rgba(10,10,11,0),rgba(10,10,11,.55) 50%,#0a0a0b)}
.bc-big{left:6.4cqw;bottom:6.4cqw;display:flex;flex-direction:column;font-size:21cqw;font-weight:800;line-height:.84;letter-spacing:-.05em;text-transform:uppercase}
/* the sample pack: the snare under a dark wash, the name set big and condensed, one bar of its sound as a waveform */
.bc-drums{background:#0b0a09}
.bc-drums>.bc-still{object-position:40% 50%}
.bc-drums::before{content:"";position:absolute;z-index:1;inset:0;background:linear-gradient(rgba(11,10,9,.84),rgba(11,10,9,.3) 36%,rgba(11,10,9,.4) 56%,rgba(11,10,9,.95) 80%)}
.bc-drums .bc-big{top:15cqw;bottom:auto;font-size:15cqw;line-height:.9;letter-spacing:-.04em;transform:scaleY(1.14);transform-origin:0 0}
.bc-vol{position:absolute;z-index:2;right:7cqw;top:5.4cqw;padding:1.6cqw 2.6cqw;border-radius:1.6cqw;background:#e8ff59;color:#0b0a09;font-size:4.8cqw;font-weight:800;line-height:1;letter-spacing:.04em;text-transform:uppercase}
.bc-wave{position:absolute;z-index:2;left:7cqw;right:7cqw;bottom:15cqw;display:flex;align-items:center;gap:1.1cqw;height:13cqw}
.bc-wave i{flex:1;height:100%;border-radius:1cqw;background:#e8ff59;transform:scaleY(var(--h))}
.bc-spec{position:absolute;z-index:2;left:7cqw;bottom:6.5cqw;font-size:4.8cqw;font-weight:600;line-height:1;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.72)}
.bc-book::before,.bc-presets::before{content:"";position:absolute;z-index:1;inset:0}
.bc-book::before{background:linear-gradient(rgba(24,16,8,.78),rgba(24,16,8,.3) 46%,rgba(24,16,8,0) 62%,rgba(24,16,8,0) 76%,rgba(24,16,8,.62))}
.bc-book .bc-title{left:7cqw;top:8cqw;font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-size:20cqw;font-weight:500;line-height:.94;letter-spacing:-.02em}
.bc-book .bc-line{left:7cqw;top:49cqw;font-size:5cqw;line-height:1.2}
.bc-foot{left:7cqw;bottom:6.5cqw;font-size:4.8cqw;font-weight:600;line-height:1;letter-spacing:.14em;text-transform:uppercase}
.bc-presets::before{background:linear-gradient(rgba(12,16,10,.45),rgba(12,16,10,0) 30%,rgba(12,16,10,0) 60%,rgba(12,16,10,.6))}
.bc-presets .bc-tag{left:0;right:0;text-align:center}
.bc-presets .bc-title{left:0;right:0;bottom:9cqw;text-align:center;font-size:11cqw;font-weight:500;line-height:1;letter-spacing:.3em;text-indent:.3em;text-transform:uppercase}
.bc-font{background:#8b5cf6}
.bc-glyph{left:5cqw;top:19cqw;font-size:64cqw;font-weight:700;line-height:.8;letter-spacing:-.06em}
.bc-font .bc-title{left:7cqw;bottom:14.5cqw;font-size:9.5cqw;font-weight:700;line-height:1;letter-spacing:-.03em}
.bc-font .bc-line{left:7cqw;bottom:7cqw;font-size:5cqw;line-height:1;opacity:.88}

/* physical: four products of one store in turn, each on its own ground (baked into its photograph); the card is the one on show */
.bs-tee{background:#eeedea}
.bt-item{position:absolute;inset:0;opacity:0}
.bt-item[data-p="0"]{opacity:1}
.bt-photo{position:absolute;left:64u;top:12u;width:546u;height:546u;overflow:hidden}
.bt-pic{background:none}
.bt-card{right:64u;top:50%;height:420u;margin-top:-210u}
.bt-thumbs{--tp:44u;position:relative;display:flex;gap:8u;margin-bottom:18u}
.bt-thumbs i{width:36u;height:36u;border-radius:9u;overflow:hidden}
.bt-thumbs .smk-pic{width:100%;height:100%;background:none}
.bt-thumb-ring{position:absolute;z-index:1;left:-3u;top:-3u;width:42u;height:42u;border-radius:11u;box-shadow:inset 0 0 0 2u #18181b}
.bt-infos{display:grid}
.bt-info{grid-area:1/1;opacity:0}
.bt-info[data-p="0"]{opacity:1}
.bt-info h4{margin:0}
.bt-opts{position:relative;display:grid;grid-template-columns:repeat(var(--n),1fr);gap:8u;margin-top:8u}
.bt-opts i{display:grid;place-items:center;height:42u;border-radius:11u;font-size:13.5u;font-style:normal;font-weight:500;white-space:nowrap;box-shadow:inset 0 0 0 1u #e4e4e7}
.bt-ring{left:0;top:0;width:calc((100% - (var(--n) - 1) * 8u) / var(--n));height:42u;border-radius:11u;transform:translate3d(calc((100% + 8u) * var(--k)),0,0)}
.bs-ship{display:flex;align-items:center;gap:8u;margin:18u 0 16u!important;font-size:13u;color:#52525b}
.bs-swap{display:grid}
.bs-swap>span{grid-area:1/1;display:flex;align-items:center;gap:7u}
.bs-swap .a{opacity:0}
.bt-toasts{position:absolute;left:84u;top:40u;display:grid}
.bt-added{grid-area:1/1;display:flex;align-items:center;gap:12u;padding:10u 16u 10u 10u;border-radius:16u;background:#fff;opacity:0;box-shadow:0 0 0 1u rgba(16,24,40,.05),0 18u 36u -18u rgba(16,24,40,.4)}
.bt-added[data-p="0"]{opacity:1}
.bt-added>i{width:44u;height:44u;border-radius:10u;overflow:hidden}
.bt-added .smk-pic{width:100%;height:100%;background:none}
.bt-added>span{display:grid;gap:1u}
.bt-added b{font-size:13.5u}
.bt-added em{font-size:12.5u;font-style:normal;color:#71717a}
.bt-added svg{width:20u;height:20u;margin-left:10u}

/* course: as it was, a white card on a soft grey, now with its lesson playing */
.bs-course{background:#e9ecf0}
.bs-ccard{position:absolute;left:50%;top:22u;bottom:22u;width:720u;margin-left:-360u;display:flex;flex-direction:column;border-radius:20u;background:#fff;overflow:hidden;box-shadow:0 0 0 1u rgba(16,24,40,.06),0 1u 2u rgba(16,24,40,.04),0 30u 60u -30u rgba(16,24,40,.35)}
.bp-player{position:relative;height:248u;flex:none;overflow:hidden}
.bp-player-pic{object-position:50% 40%}
.bp-play{position:absolute;left:50%;top:50%;width:58u;height:58u;margin:-29u 0 0 -29u;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.94);color:#18181b;box-shadow:0 6u 18u rgba(0,0,0,.2)}
.bp-play svg{width:20u;height:20u;margin-left:2u}
.bp-player em{position:absolute;left:14u;bottom:20u;padding:5u 11u;border-radius:999u;background:rgba(24,24,27,.66);color:#fff;font-size:12u;font-style:normal;font-weight:600}
.bp-bar{position:absolute;left:0;right:0;bottom:0;height:4u;background:rgba(255,255,255,.3)}
.bp-bar i{display:block;height:100%;background:#fff;transform-origin:0 50%}
.bp-course-body{padding:18u 24u 0}
.bp-course-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16u}
.bp-course-head h4{font-size:21u}
.bp-course-buy{display:flex;align-items:center;gap:12u}
.bp-course-buy b{font-size:21u;font-weight:650}
.bp-course-buy .bs-btn{height:42u;margin:0}
.bp-lessons-wrap{position:relative;margin:14u 0 0}
.bp-lessons{position:relative;margin:0;padding:0;list-style:none;border-top:1u solid #f0f0f1}
.bp-now{--row:42u;position:absolute;left:-10u;right:-10u;top:128u;height:40u;border-radius:10u;background:#f4f4f5}
.bp-lessons li{position:relative;display:flex;align-items:center;gap:12u;height:42u;border-bottom:1u solid #f4f4f5;font-size:13.5u}
.bp-lessons li i{position:relative;display:grid;place-items:center;width:24u;height:24u;border-radius:50%;font-size:11.5u;font-style:normal;font-weight:600;color:#71717a;box-shadow:inset 0 0 0 1.5u #e4e4e7}
.bp-lessons li i svg{width:12u;height:12u}
.bp-lessons .done i{background:#18181b;color:#fff;box-shadow:none}
.bp-lessons .done b{color:#71717a;font-weight:500}
.bp-lessons b{flex:1;font-weight:600}
.bp-lessons em{font-style:normal;font-size:12.5u;color:#71717a}
.bp-done-tick{position:absolute;inset:0;display:grid;place-items:center;border-radius:50%;background:#18181b;color:#fff}

/* community: the club's page on a dark ground, its feed coming in beside it. Round 11, the owner: the banner "should have another heading" and "a different colour, not white", and its mark should look like a real logo. The banner is now the club's own green, its photograph laid into that green, its logo and wordmark at the top, and the line it promises (not its name again) as the heading. The page under it takes a pale tint of the same green. */
.bs-club{background:#111214}
.bs-com{position:absolute;left:56u;top:26u;bottom:26u;width:520u;display:flex;flex-direction:column;border-radius:22u;background:#f3f6ef;overflow:hidden}
.bs-com-cover{position:relative;height:236u;flex:none;overflow:hidden;background:#123227;color:#fff}
.bs-com-pic{position:absolute;right:0;top:0;width:68%!important;background:none;opacity:.5;mix-blend-mode:luminosity}
.bs-com-cover::after{content:"";position:absolute;inset:0;background:linear-gradient(to right,#123227 30%,rgba(18,50,39,.55) 60%,rgba(18,50,39,.1)),linear-gradient(to top,rgba(18,50,39,.7),rgba(18,50,39,0) 50%)}
.bs-com-logo{position:absolute;z-index:1;left:24u;top:22u;display:flex;align-items:center;gap:10u}
.bs-com-logo svg{width:34u;height:34u}
.bs-com-logo b{font-size:17u;font-weight:750;line-height:1;letter-spacing:-.03em}
.bs-com-logo b i{margin:0 1u 0 3u;font-style:normal;color:#d9f969}
.bs-com-word{position:absolute;z-index:1;left:24u;right:24u;bottom:22u;display:grid;gap:7u}
.bs-com-word b{max-width:12em;font-size:31u;font-weight:750;line-height:1.02;letter-spacing:-.035em}
.bs-com-word i{font-size:13.5u;font-style:normal;font-weight:500;color:#d9f969}
.bs-com-host{position:absolute;z-index:1;right:20u;top:25u;display:flex;align-items:center;gap:8u}
.bs-com-host .smk-pic{width:28u;height:28u;border-radius:50%;box-shadow:0 0 0 1.5u rgba(255,255,255,.85)}
.bs-com-host em{font-size:12.5u;font-style:normal;font-weight:600}
.bs-com-body{padding:20u 24u 0}
.bs-com-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16u}
.bs-com-head .bs-btn{height:42u;margin:0;background:#123227}
.bs-event{display:flex;align-items:center;gap:12u;margin-top:16u;padding:12u;border-radius:14u;background:#fff;box-shadow:0 0 0 1u #e3e8dc}
.bs-date{display:grid;place-items:center;width:46u;height:48u;border-radius:11u;background:#f3f6ef;box-shadow:0 0 0 1u #e3e8dc}
.bs-date i{font-size:10u;font-style:normal;font-weight:700;text-transform:uppercase;color:#e11d48;line-height:1}
.bs-date b{font-size:19u;font-weight:650;line-height:1.05}
.bs-event>span:nth-child(2){flex:1;display:grid;gap:2u}
.bs-event>span:nth-child(2) b{font-size:14u}
.bs-event>span:nth-child(2) i{font-size:12.5u;font-style:normal;color:#71717a}
.bs-event em{font-size:12.5u;font-style:normal;color:#52525b}
.bs-spaces{display:flex;flex-wrap:wrap;gap:8u;margin-top:14u}
.bs-spaces i{padding:6u 11u;border-radius:999u;background:#e4ebdc;font-size:12.5u;font-style:normal;font-weight:500;color:#3f3f46}
.bs-spaces i::before{content:"#";margin-right:3u;color:#a1a1aa}
.bs-feed{position:absolute;left:616u;right:56u;top:26u;display:grid;gap:12u}
.bs-feed-h{display:flex;align-items:center;gap:9u;margin-bottom:4u!important;font-size:13u;font-weight:600;color:#a1a1aa}
.bs-feed-h i{position:relative;width:8u;height:8u;border-radius:50%;background:#4ade80}
.bs-feed-h i::after{content:"";position:absolute;inset:0;border-radius:50%;background:#4ade80;opacity:0}
.bs-post{display:grid;grid-template-columns:38u 1fr;gap:12u;padding:16u;border-radius:18u;background:#1c1d20;box-shadow:inset 0 0 0 1u #2a2b2f;color:#f4f4f5}
.bs-post-av{width:38u!important;height:38u!important;border-radius:50%}
.bs-post-h{display:flex;align-items:baseline;gap:8u;font-size:13.5u}
.bs-post-h i{font-style:normal;font-size:12u;color:#8b8b93}
.bs-post-t{margin-top:4u!important;font-size:13.5u;line-height:1.45;color:#d4d4d8}
.bs-post-r{display:flex;gap:18u;margin-top:10u!important;font-size:12.5u;color:#8b8b93}
.bs-post-r>span{display:flex;align-items:center;gap:6u}
.bs-post-r svg{width:14u;height:14u}
.bs-like svg{color:#fb7185;fill:#fb7185}
.bs-count{display:inline-grid;overflow:hidden;height:1.4em}
.bs-count>*{grid-area:1/1;font-weight:500;text-decoration:none}
.bs-count s{opacity:0}

/* booking: the coach first, then a day and a time picked and booked */
.bs-coach{background:#0f1012}
.bs-coach-photo{position:absolute;left:0;top:0;bottom:0;width:540u;overflow:hidden}
.bs-coach-pic{object-position:50% 30%;transform-origin:40% 40%}
.bs-coach-photo::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(15,16,18,.72),rgba(15,16,18,0) 40%),linear-gradient(to left,#0f1012,rgba(15,16,18,0) 22%)}
.bs-coach-name{position:absolute;left:32u;bottom:30u;z-index:1;display:grid;gap:3u;color:#fff}
.bs-coach-name b{font-size:20u;font-weight:650}
.bs-coach-name i{font-size:13u;font-style:normal;opacity:.8}
.bs-book{--day:66u;right:64u;top:50%;width:440u;height:460u;margin-top:-230u}
.bs-meta{display:flex;align-items:center;gap:14u;margin-top:10u!important;font-size:13u;color:#52525b}
.bs-meta span{display:flex;align-items:center;gap:6u}
.bs-meta svg{width:14u;height:14u;color:#71717a}
.bs-meta b{margin-left:auto;font-size:22u;font-weight:650;color:#18181b}
.bs-days{position:relative;display:grid;grid-template-columns:repeat(5,58u);gap:8u;margin-top:9u}
.bs-days i{display:grid;place-items:center;gap:1u;height:58u;border-radius:13u;font-style:normal;box-shadow:inset 0 0 0 1u #e4e4e7}
.bs-days em{font-style:normal;font-size:11.5u;color:#71717a}
.bs-days b{font-size:17u;font-weight:600}
.bs-times{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:8u;margin:12u 0 18u}
.bs-times i{display:grid;place-items:center;height:40u;border-radius:11u;font-size:13.5u;font-style:normal;font-weight:500;box-shadow:inset 0 0 0 1u #e4e4e7}
.bs-ring{position:absolute;z-index:1;border-radius:13u;box-shadow:inset 0 0 0 2u #18181b;pointer-events:none}
.bs-ring-day{left:0;top:0;width:58u;height:58u;transform:translate3d(calc(var(--day) * 3),0,0)}
.bs-ring-time{left:0;top:48u;width:calc((100% - 16u) / 3);height:40u;border-radius:11u}
.bs-booked{position:absolute;left:14u;right:14u;bottom:14u;display:flex;align-items:center;gap:12u;padding:14u 16u;border-radius:15u;background:#18181b;color:#fff}
.bs-booked svg{width:22u;height:22u;color:#4ade80}
.bs-booked>span{display:grid;gap:1u}
.bs-booked b{font-size:14u}
.bs-booked i{font-size:12.5u;font-style:normal;color:#a1a1aa}
.bs-book .bs-btn{margin-top:auto}

/* Phones: the same scenes, stacked, drawn at 400 x 640 */
@media(max-width:767px){
  .bz-frame{aspect-ratio:400/640}
  .bz-frame>.smk{--w:400}
  .bs-card,.bd-card,.bt-card,.bs-book{left:16u;right:16u;width:auto;padding:20u 20u 18u;border-radius:18u}
  .bs h4{font-size:21u}
  .bs-price{margin-top:8u!important;font-size:20u}
  .bd-rail{right:0;bottom:auto;width:auto;height:380u}
  .bd-track{--pitch:206u;left:200u;top:68u;margin:0}
  .bd-cover{width:200u;height:250u;border-radius:12u}
  .bc-tag,.bc-foot{font-size:5.6cqw}
  .bc-book .bc-line,.bc-font .bc-line{font-size:5.6cqw}
  .bd-card{top:auto;bottom:16u;margin:0;height:236u}
  .bd-instant{display:none}
  .bt-photo{left:34u;top:30u;width:332u;height:332u}
  .bt-card{top:auto;bottom:16u;margin:0;height:300u}
  .bt-thumbs{--tp:38u;gap:8u;margin-bottom:12u}
  .bt-thumbs i{width:30u;height:30u;border-radius:8u}
  .bt-thumb-ring{width:36u;height:36u;border-radius:10u}
  .bs-ship{display:none}
  .bt-opts{margin-bottom:16u}
  .bt-opts i{height:40u;font-size:13u}
  .bt-ring{height:40u}
  .bt-toasts{left:16u;top:14u}
  .bs-ccard{left:14u;right:14u;top:14u;bottom:14u;width:auto;margin:0;border-radius:18u}
  .bp-player{height:178u}
  .bp-course-body{padding:16u 16u 0}
  .bp-course-head{display:grid;gap:12u;align-items:start}
  .bp-course-head h4{font-size:19u}
  .bp-course-buy{justify-content:space-between}
  .bp-course-buy .bs-btn{flex:1}
  .bp-lessons li{height:40u;font-size:13u}
  .bp-now{--row:40u;top:122u;height:38u}
  .bs-com{left:14u;right:14u;top:14u;bottom:auto;width:auto;height:410u}
  .bs-com-cover{height:130u}
  .bs-com-logo{left:16u;top:14u;gap:8u}
  .bs-com-logo svg{width:26u;height:26u}
  .bs-com-logo b{font-size:14u}
  .bs-com-word{left:16u;bottom:14u;gap:4u}
  .bs-com-word b{font-size:22u}
  .bs-com-word i{font-size:12u}
  .bs-com-host{right:14u;top:16u}
  .bs-com-body{padding:16u 16u 0}
  .bs-com-head{display:grid;gap:12u;align-items:start}
  .bs-event em,.bs-spaces i:nth-child(n+3){display:none}
  .bs-feed{left:14u;right:14u;top:438u}
  .bs-feed-h{display:none}
  .bs-post:nth-of-type(n+3){display:none}
  .bs-post{padding:12u;border-radius:15u}
  .bs-post-t{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .bs-post-r{display:none}
  .bs-coach-photo{right:0;width:auto;bottom:auto;height:300u}
  .bs-coach-photo::after{background:linear-gradient(to top,#0f1012,rgba(15,16,18,0) 55%)}
  .bs-coach-name{left:20u;bottom:80u}
  .bs-book{--day:67u;top:auto;bottom:16u;margin:0;height:362u}
  .bs-book .bs-label{display:none}
  .bs-book .bs-days{margin-top:16u}
  .bs-days{grid-template-columns:repeat(5,1fr);gap:7u}
  .bs-days i{height:52u}
  .bs-ring-day{width:calc((100% - 28u) / 5);height:52u}
  .bs-ring-time{top:52u}
}
`) + u(MOTION)
