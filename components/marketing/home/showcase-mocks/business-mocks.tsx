import { CalendarDays, Check, CheckCircle2, Download, FileText, Heart, MessageCircle, Play, Users, Video } from "lucide-react"
import type { CSSProperties } from "react"
import { Pic, pic, u } from "./frame"

/*
  WHAT A STOREFRONT SELLS, AS SMALL SCENES (landing rounds 8 to 13).
  Each kind of thing sold is one scene on its own calm ground: the thing
  itself, photographed, and the Storelib page that sells it, with one short
  moment playing while it is shown.

    Digital product   Ancestral Kitchen (a cookbook) and Daily Mobility (a
                      video course) on one coach's shelf, both in one order
                      that pays and downloads (round 13)
    Physical product  A line of store designs for goods you ship, turning in
                      perspective without end (round 13)
    Course            Mixing in key, Tomás Reyes's course for new DJs (kept)
    Community         Applied AI Club, under its photograph (round 13: the
                      owner disliked the green banner)
    Booking           A 1:1 training plan call with Talia Moreno (kept)

  Round 12, the owner liked the course, the community and the booking, and
  not the digital row of covers ("the high-end Lightroom presets") or the
  physical tee, cap, tote and print. Round 13 replaced round 12's e-book and
  face oil with what the owner named: the mobility course and Ancestral
  Kitchen, and the store designs.

  Drawn at one design size per layout (1100 x 570 from 768px, 360 x 520
  below; `--u` in frame.tsx), so a picture is the same at any width. Every
  moment is a CSS animation on transform and opacity, started when the scene
  becomes the chosen one and paused while the section is off screen
  (business-carousel.tsx). Without motion every scene stands at its resting
  style: the finished moment. The one loop is the line of store designs.

  Photographs: Unsplash (free licence), re-encoded small in public/home/showcase.
  Store designs: the owner's Materia Themes template pictures, bt-*.webp there.
*/

/*
  A product photograph loads with the scene, not lazily: on a phone the five scenes stand in a row that slides
  sideways, and a lazy picture would be asked for only as its card slides in, arriving as an empty box mid swipe.
  The section itself is mounted late (lazy-sections.tsx), so nothing is fetched before it is near.
*/
function Still({ src, w, h, className = "smk-pic" }: { src: string; w: number; h: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={w} height={h} loading="eager" decoding="async" draggable={false} className={className} />
}

/* ================================================================ Digital product */
/*
  Round 13, the owner: the digital card shows the mobility course and
  Ancestral Kitchen, the two downloads the landing sold in earlier rounds
  (their pictures are the map's, public/home/sell-map). One coach's store:
  the two on its shelf, and both in one order that pays and is ready to open.
*/
const SHELF = "/home/sell-map"
export const DIGITAL_PRODUCTS = [
  { name: "Ancestral Kitchen", kind: "Cookbook · PDF", price: "$34", pic: "ancestral-kitchen-cookbook", line: "80 recipes from whole foods" },
  { name: "Daily Mobility", kind: "Video course", price: "$79", pic: "mobility-course", line: "21 lessons, 15 minutes a day" },
] as const
export const DIGITAL_ORDER = { by: "Ruth Calder", total: "$113" } as const

export function DigitalScene() {
  const o = DIGITAL_ORDER
  return (
    <div className="bs bs-digital">
      {DIGITAL_PRODUCTS.map((p, i) => (
        <div key={p.name} className={`bd-tile bd-tile-${i}`}>
          <span className="bd-pic">
            <Still src={`${SHELF}/${p.pic}.webp`} w={600} h={600} />
          </span>
          <span className="bd-meta">
            <b>{p.name}</b>
            <em>{p.price}</em>
            <i>{p.kind}</i>
          </span>
        </div>
      ))}
      <div className="bs-card bd-card">
        <p className="bs-kicker">Your order</p>
        <p className="bs-by">from {o.by}</p>
        <ol className="bd-lines">
          {DIGITAL_PRODUCTS.map((p) => (
            <li key={p.name}>
              <span>
                <b>{p.name}</b>
                <i>{p.line}</i>
              </span>
              <em>{p.price}</em>
            </li>
          ))}
        </ol>
        <p className="bd-total">
          <span>Total</span>
          <b>{o.total}</b>
        </p>
        <p className="be-instant">
          <Download /> Instant access, a copy by email
        </p>
        {/* The button is the whole moment: pressed, it pays and the book downloads in place, then both are ready. */}
        <span className="bs-btn bs-press be-buy">
          <span className="be-fill" />
          <span className="a">Pay {o.total}</span>
          <span className="b">
            <FileText /> Downloading the cookbook
          </span>
          <span className="c">
            <Check /> Ready in your library
          </span>
        </span>
      </div>
    </div>
  )
}

/* ================================================================ Physical product */
/*
  Round 13, the owner: the physical card is a line of store designs for
  goods you ship, turning in perspective: one in front, the others stacked
  behind it on each side, moving on by itself and never ending. The pictures
  are store designs from the owner's own theme export (its template
  carousel), each a 4:5 webp at about twice its drawn size.

  Six cards and six places: the front, two to each side, and one far behind
  the middle where a card is invisible while it crosses from the left back
  to the right back. One keyframe animation walks a card through the six
  places; each card runs it a sixth of the loop apart (a negative delay), so
  the whole line is CSS on the compositor: transform and opacity, nothing
  else, no script, no timer. A card's resting style is its place at the
  start, so with reduced motion the line stands still and whole.
*/
export const STORE_DESIGNS = ["sora", "shine", "sunbalm", "lunea", "fusion", "vision"] as const
/** Widths each design is saved at (public/home/showcase/bt-<id>-<w>.webp), 4:5. */
export const STORE_DESIGN_WIDTHS = [380, 560, 760] as const
/** One move of the line: a hold, then the glide to the next place (seconds). */
export const STORE_STEP_S = 2.4
export const STORE_GLIDE_S = 0.95
/* The six places, in the order a card visits them: front, left, far left, hidden behind, far right, right. */
const PLACES = [
  { x: 0, z: 0, r: 0, o: 1 },
  { x: -262, z: -190, r: 24, o: 1 },
  { x: -446, z: -430, r: 32, o: 0.6 },
  { x: 0, z: -760, r: 0, o: 0 },
  { x: 446, z: -430, r: -32, o: 0.6 },
  { x: 262, z: -190, r: -24, o: 1 },
] as const
type Scale = { x: number; z: number }
const placeCss = (k: number, s: Scale) => {
  const p = PLACES[((k % PLACES.length) + PLACES.length) % PLACES.length]
  return `transform:translate3d(${+(p.x * s.x).toFixed(1)}u,0,${+(p.z * s.z).toFixed(1)}u) rotateY(${p.r}deg);opacity:${p.o}`
}
/* A card's walk: hold at each place, glide to the next. Card i starts at place i, so the card on the right comes to the front. */
const walk = (s: Scale) => {
  const n = PLACES.length
  const hold = 1 - STORE_GLIDE_S / STORE_STEP_S
  const pct = (v: number) => `${+(v * 100).toFixed(3)}%`
  let out = ""
  for (let k = 0; k < n; k++) {
    out += `${pct(k / n)}{${placeCss(k, s)}}`
    out += `${pct((k + hold) / n)}{${placeCss(k, s)};animation-timing-function:cubic-bezier(.55,0,.25,1)}`
  }
  return `${out}100%{${placeCss(0, s)}}`
}
/*
  The line at one scale: each card's resting place, and the walk. A phone draws the cards a little smaller
  and closer together; its walk has the same name inside the phone's media query, so it replaces the
  computer's there (the last @keyframes of a name that applies wins) and one animation rule serves both.
*/
const storeLineCss = (s: Scale) =>
  STORE_DESIGNS.map((_, i) => `.bt-card:nth-child(${i + 1}){${placeCss(i, s)}}`).join("") + `@keyframes bt-walk{${walk(s)}}`
const STORE_LINE = storeLineCss({ x: 1, z: 1 })
const STORE_LINE_PHONE = storeLineCss({ x: 0.56, z: 0.7 })
export const STORE_LOOP_S = +(STORE_STEP_S * PLACES.length).toFixed(3)

export function PhysicalScene() {
  return (
    <div className="bs bs-store">
      <div className="bt-stage">
        {STORE_DESIGNS.map((id, i) => (
          <span key={id} className="bt-card" style={{ "--d": `${+(-i * STORE_STEP_S).toFixed(3)}s` } as CSSProperties}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/home/showcase/bt-${id}-${STORE_DESIGN_WIDTHS[1]}.webp`}
              srcSet={STORE_DESIGN_WIDTHS.map((w) => `/home/showcase/bt-${id}-${w}.webp ${w}w`).join(", ")}
              sizes="(max-width: 767px) 38vw, (max-width: 1279px) 27vw, 22vw"
              alt=""
              width={560}
              height={700}
              loading="eager"
              decoding="async"
              draggable={false}
              className="smk-pic"
            />
          </span>
        ))}
      </div>
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
          {/* The club's own logo: three joined points (a small agent graph) in white on the photograph, and the name set beside it (round 13: no green). */}
          <span className="bs-com-logo">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <rect width="32" height="32" rx="8" fill="#fff" />
              <path d="M10 21.5 16 10l6 11.5H10Z" fill="none" stroke="#18181b" strokeWidth="2.4" strokeLinejoin="round" />
              <circle cx="16" cy="10" r="3.4" fill="#18181b" />
              <circle cx="10" cy="21.5" r="3.4" fill="#18181b" />
              <circle cx="22" cy="21.5" r="3.4" fill="#fff" stroke="#18181b" strokeWidth="2.4" />
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
  scene's frame while it is the chosen one (or fading out under the next; on
  a phone, while its card is the one in view or beside it), so these run
  from the start each time it comes back. One-shot, every one, on the
  compositor, but for the line of store designs (round 13), which turns
  without end while its scene is shown and the section is on screen.
*/
const E = "cubic-bezier(.22,1,.36,1)"
const MOTION = `
@media(prefers-reduced-motion:no-preference){
.bz-on .bs-card,.bz-on .bs-com,.bz-on .bs-ccard{animation:bz-rise .8s ${E} .1s both}
.bz-on .bs-coach-pic{animation:bz-push 7s cubic-bezier(.25,.6,.3,1) both}

.bz-on .bd-tile-0{animation:bz-rise .8s ${E} both}
.bz-on .bd-tile-1{animation:bz-rise .8s ${E} .08s both}
.bz-on .bs-digital .bs-press{animation:bz-press .36s ease 2.1s both}
.bz-on .be-buy .a{animation:bz-out .3s ease 2.3s both}
.bz-on .be-buy .b{animation:be-mid 1.7s linear 2.35s both}
.bz-on .be-fill{animation:be-fill 1.7s linear 2.35s both}
.bz-on .be-buy .c{animation:bz-in .4s ${E} 4.05s both}

.bz-on .bt-card{animation:bt-walk ${STORE_LOOP_S}s linear var(--d,0s) infinite both}

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
@keyframes bz-pop{from{opacity:0;transform:translate3d(calc((100% + 8u) * var(--k,0)),0,0) scale(.8)}}
@keyframes bz-ping{from{opacity:.55;transform:scale(1)}to{opacity:0;transform:scale(2.6)}}
@keyframes bz-out{from{opacity:1;transform:none}to{opacity:0;transform:translate3d(0,-10u,0)}}
@keyframes bz-in{from{opacity:0;transform:translate3d(0,10u,0)}}
@keyframes bz-play{from{transform:scaleX(.08)}}
@keyframes bz-next{from{transform:translate3d(0,calc(var(--row) * -1),0)}}
@keyframes bz-up-out{from{opacity:1;transform:none}to{opacity:0;transform:translate3d(0,-8u,0)}}
@keyframes bz-up-in{from{opacity:0;transform:translate3d(0,8u,0)}}
@keyframes bz-day{0%{opacity:0;transform:translate3d(calc(var(--day) * 1),0,0) scale(.8)}18%,42%{opacity:1;transform:translate3d(calc(var(--day) * 1),0,0)}}
@keyframes bz-time{0%{opacity:0;transform:translate3d(calc(100% + 8u),-48u,0) scale(.8)}25%,45%{opacity:1;transform:translate3d(calc(100% + 8u),-48u,0)}}
@keyframes be-mid{0%{opacity:0;transform:translate3d(0,10u,0)}12%,88%{opacity:1;transform:none}100%{opacity:0;transform:translate3d(0,-10u,0)}}
@keyframes be-fill{0%{opacity:1;transform:scaleX(0)}92%{opacity:1;transform:scaleX(1)}100%{opacity:0;transform:scaleX(1)}}
`

export const BUSINESS_MOCK_CSS =
  u(`
.bz-frame{aspect-ratio:1100/570;border-radius:inherit}
.bz-frame>.smk{--w:1100}
.bs{position:absolute;inset:0;overflow:hidden;color:#18181b;font-size:14u;line-height:1.4}
.bs svg{width:15u;height:15u;flex:none}
.bs-digital .smk-pic{background:none}
.bs-card{position:absolute;display:flex;flex-direction:column;width:360u;padding:28u 28u 26u;border-radius:22u;background:#fff;box-shadow:0 0 0 1u rgba(16,24,40,.05),0 2u 4u rgba(16,24,40,.04),0 30u 60u -28u rgba(16,24,40,.4)}
.bs-kicker{font-size:11.5u;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#71717a}
.bs h4{margin:6u 0 0;font-size:25u;font-weight:650;line-height:1.12;letter-spacing:-.02em}
.bs-by{display:flex;align-items:center;gap:6u;margin-top:5u!important;font-size:13.5u;color:#71717a}
.bs-by svg{width:14u;height:14u}
.bs-price{margin-top:14u!important;font-size:23u;font-weight:650;letter-spacing:-.01em}
.bs-desc{margin-top:8u!important;font-size:13.5u;line-height:1.5;color:#52525b}
.bs-label{margin-top:16u!important;font-size:12.5u;font-weight:500;color:#52525b}
.bs-btn{position:relative;display:grid;place-items:center;height:46u;margin-top:auto;padding:0 20u;border-radius:13u;background:#18181b;color:#fff;font-size:14.5u;font-weight:600;white-space:nowrap}
.bs-ring{position:absolute;z-index:1;border-radius:13u;box-shadow:inset 0 0 0 2u #18181b;pointer-events:none}
.bs-swap{display:grid;overflow:hidden}
.bs-swap>span{grid-area:1/1;display:flex;align-items:center;gap:7u}
.bs-swap .a{opacity:0}

/* digital (round 13): one coach's shelf on the cookbook's own warm paper, Ancestral Kitchen and Daily Mobility side by side, and the order that buys both */
.bs-digital{background:#e6dfd1}
.bd-tile{position:absolute;top:83u;width:318u;height:404u;display:flex;flex-direction:column;border-radius:20u;background:#fff;overflow:hidden;box-shadow:0 0 0 1u rgba(60,40,20,.06),0 2u 4u rgba(60,40,20,.04),0 30u 60u -30u rgba(60,40,20,.42)}
.bd-tile-0{left:48u}
.bd-tile-1{left:388u}
.bd-pic{position:relative;display:block;height:318u;flex:none;overflow:hidden}
.bd-pic .smk-pic{position:absolute;inset:0}
.bd-meta{display:grid;grid-template-columns:minmax(0,1fr) auto;align-content:center;align-items:baseline;gap:3u 12u;flex:1;padding:0 18u}
.bd-meta b{grid-column:1/-1;font-size:15.5u;font-weight:650;letter-spacing:-.01em;white-space:nowrap}
.bd-meta em{grid-column:2;grid-row:2;font-size:14.5u;font-style:normal;font-weight:600}
.bd-meta i{grid-column:1;grid-row:2;font-size:12.5u;font-style:normal;color:#71717a}
.bd-card{right:48u;top:83u;width:324u;height:404u;padding:24u 24u 22u}
.bd-card .bs-by{margin-top:3u!important}
.bd-lines{margin:14u 0 0;padding:0;list-style:none;border-top:1u solid #f0f0f1}
.bd-lines li{display:flex;align-items:center;justify-content:space-between;gap:12u;padding:12u 0;border-bottom:1u solid #f4f4f5}
.bd-lines li>span{display:grid;gap:2u}
.bd-lines b{font-size:14u;font-weight:600}
.bd-lines i{font-size:12u;font-style:normal;color:#71717a}
.bd-lines em{font-size:14u;font-style:normal;font-weight:550}
.bd-total{display:flex;align-items:baseline;justify-content:space-between;margin-top:12u!important}
.bd-total span{font-size:13.5u;color:#52525b}
.bd-total b{font-size:21u;font-weight:650;letter-spacing:-.01em}
.be-instant{display:flex;align-items:center;gap:8u;margin:14u 0 14u!important;font-size:13u;color:#52525b}
.be-instant svg{width:14u;height:14u;color:#71717a}
.be-buy{overflow:hidden;isolation:isolate}
.be-buy>span{grid-area:1/1;display:flex;align-items:center;gap:8u}
.be-buy>.a,.be-buy>.b{opacity:0}
.be-buy svg{width:16u;height:16u}
.be-buy .c svg{color:#4ade80}
.be-fill{position:absolute!important;inset:0;z-index:-1;background:#3f3f46;transform-origin:0 50%;opacity:0}

/* physical (round 13): store designs for goods you ship, a line turning in perspective on a quiet ground. The stage holds the 3D (perspective and preserve-3d, so the cards sort by depth on the compositor); each card is one flat picture with its corners and shadow drawn once. */
.bs-store{background:#ecebe7}
.bt-stage{position:absolute;left:50%;top:50%;width:336u;height:420u;margin:-212u 0 0 -168u;perspective:1500u;perspective-origin:50% 45%;transform-style:preserve-3d}
.bt-card{position:absolute;inset:0;border-radius:14u;overflow:hidden;background:#fff;box-shadow:0 0 0 1u rgba(16,24,40,.06),0 2u 4u rgba(16,24,40,.05),0 34u 60u -30u rgba(16,24,40,.45);backface-visibility:hidden}
.bt-card img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 0;user-select:none;-webkit-user-select:none}
${STORE_LINE}

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

/* community: the club's page on a dark ground, its feed coming in beside it. Round 11, the owner: the banner "should have another heading" and "a different colour, not white", and its mark should look like a real logo. Round 13, the owner disliked the green: the banner is the club's photograph itself, in its own colours, under one soft ink shade from the left where the words stand; the logo is white, the page under it a quiet warm grey, the button the page's ink. No green anywhere in it. */
.bs-club{background:#111214}
.bs-com{position:absolute;left:56u;top:26u;bottom:26u;width:520u;display:flex;flex-direction:column;border-radius:22u;background:#f5f5f3;overflow:hidden}
.bs-com-cover{position:relative;height:236u;flex:none;overflow:hidden;background:#1d1d21;color:#fff}
.bs-com-pic{position:absolute;inset:0;background:none;object-position:50% 40%}
.bs-com-cover::after{content:"";position:absolute;inset:0;background:linear-gradient(to right,rgba(17,17,20,.82),rgba(17,17,20,.5) 48%,rgba(17,17,20,.08) 85%),linear-gradient(to top,rgba(17,17,20,.5),rgba(17,17,20,0) 55%),linear-gradient(to bottom,rgba(17,17,20,.5),rgba(17,17,20,0) 34%)}
.bs-com-logo{position:absolute;z-index:1;left:24u;top:22u;display:flex;align-items:center;gap:10u}
.bs-com-logo svg{width:34u;height:34u}
.bs-com-logo b{font-size:17u;font-weight:750;line-height:1;letter-spacing:-.03em}
.bs-com-logo b i{margin:0 4u;font-style:normal;color:rgba(255,255,255,.62)}
.bs-com-word{position:absolute;z-index:1;left:24u;right:24u;bottom:22u;display:grid;gap:7u}
.bs-com-word b{max-width:12em;font-size:31u;font-weight:750;line-height:1.02;letter-spacing:-.035em}
.bs-com-word i{font-size:13.5u;font-style:normal;font-weight:500;color:rgba(255,255,255,.78)}
.bs-com-host{position:absolute;z-index:1;right:20u;top:25u;display:flex;align-items:center;gap:8u}
.bs-com-host .smk-pic{width:28u;height:28u;border-radius:50%;box-shadow:0 0 0 1.5u rgba(255,255,255,.85)}
.bs-com-host em{font-size:12.5u;font-style:normal;font-weight:600}
.bs-com-body{padding:20u 24u 0}
.bs-com-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16u}
.bs-com-head .bs-btn{height:42u;margin:0}
.bs-event{display:flex;align-items:center;gap:12u;margin-top:16u;padding:12u;border-radius:14u;background:#fff;box-shadow:0 0 0 1u #e7e7e4}
.bs-date{display:grid;place-items:center;width:46u;height:48u;border-radius:11u;background:#f5f5f3;box-shadow:0 0 0 1u #e7e7e4}
.bs-date i{font-size:10u;font-style:normal;font-weight:700;text-transform:uppercase;color:#e11d48;line-height:1}
.bs-date b{font-size:19u;font-weight:650;line-height:1.05}
.bs-event>span:nth-child(2){flex:1;display:grid;gap:2u}
.bs-event>span:nth-child(2) b{font-size:14u}
.bs-event>span:nth-child(2) i{font-size:12.5u;font-style:normal;color:#71717a}
.bs-event em{font-size:12.5u;font-style:normal;color:#52525b}
.bs-spaces{display:flex;flex-wrap:wrap;gap:8u;margin-top:14u}
.bs-spaces i{padding:6u 11u;border-radius:999u;background:#ebebe8;font-size:12.5u;font-style:normal;font-weight:500;color:#3f3f46}
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
.bs-ring-day{left:0;top:0;width:58u;height:58u;transform:translate3d(calc(var(--day) * 3),0,0)}
.bs-ring-time{left:0;top:48u;width:calc((100% - 16u) / 3);height:40u;border-radius:11u}
.bs-booked{position:absolute;left:14u;right:14u;bottom:14u;display:flex;align-items:center;gap:12u;padding:14u 16u;border-radius:15u;background:#18181b;color:#fff}
.bs-booked svg{width:22u;height:22u;color:#4ade80}
.bs-booked>span{display:grid;gap:1u}
.bs-booked b{font-size:14u}
.bs-booked i{font-size:12.5u;font-style:normal;color:#a1a1aa}
.bs-book .bs-btn{margin-top:auto}

/*
  Phones: each scene is one card in a row that slides under the thumb
  (business-carousel.tsx), drawn at 360 x 520: about 330px wide on a 390px
  phone, so 14 design pixels read as 13px. Every scene is a photograph or a
  picture on top and its page under it, nothing cut at the card's foot.
*/
@media(max-width:767px){
  .bz-frame{aspect-ratio:360/520}
  .bz-frame>.smk{--w:360}
  .bs-card,.bs-book{left:14u;right:14u;width:auto;padding:18u 18u 16u;border-radius:18u}
  .bs h4{font-size:21u}
  .bs-price{margin-top:8u!important;font-size:20u}

  .bd-tile{top:14u;width:160u;height:220u;border-radius:16u}
  .bd-tile-0{left:14u}
  .bd-tile-1{left:186u}
  .bd-pic{height:160u}
  .bd-meta{gap:1u 8u;padding:0 12u}
  .bd-meta b{font-size:13u}
  .bd-meta em{font-size:13u}
  .bd-meta i{font-size:11.5u}
  .bd-card{left:14u;right:14u;top:auto;bottom:14u;width:auto;height:268u;padding:16u 18u 16u}
  .bd-lines{margin-top:10u}
  .bd-lines li{padding:9u 0}
  .bd-lines b{font-size:13.5u}
  .bd-lines i{display:none}
  .bd-total{margin-top:9u!important}
  .bd-total b{font-size:19u}
  .bd-card .be-instant{display:none}
  .bd-card .bs-btn{height:42u}

  .bt-stage{width:276u;height:345u;margin:-172u 0 0 -138u;perspective:1100u}
  .bt-card{border-radius:11u}
  ${STORE_LINE_PHONE}

  .bs-ccard{left:12u;right:12u;top:12u;bottom:12u;width:auto;margin:0;border-radius:18u}
  .bp-player{height:184u}
  .bp-course-body{padding:14u 16u 0}
  .bp-course-head{display:grid;gap:10u;align-items:start}
  .bp-course-head h4{font-size:18u}
  .bp-course-head .bs-by{font-size:12.5u}
  .bp-course-buy{justify-content:space-between}
  .bp-course-buy .bs-btn{flex:1;height:40u}
  .bp-lessons-wrap{margin-top:12u}
  .bp-lessons li{height:40u;font-size:13u}
  .bp-now{--row:40u;top:122u;height:38u}

  .bs-com{left:12u;right:12u;top:12u;bottom:auto;width:auto;height:318u}
  .bs-com-cover{height:104u}
  .bs-com-logo{left:16u;top:14u;gap:8u}
  .bs-com-logo svg{width:24u;height:24u}
  .bs-com-logo b{font-size:13u}
  .bs-com-word{left:16u;bottom:12u;gap:3u}
  .bs-com-word b{font-size:20u}
  .bs-com-word i{font-size:11.5u}
  .bs-com-host{right:14u;top:15u}
  .bs-com-host .smk-pic{width:24u;height:24u}
  .bs-com-host em{font-size:11.5u}
  .bs-com-body{padding:14u 16u 0}
  .bs-com-head{display:grid;gap:10u;align-items:start}
  .bs-com-head h4{font-size:20u}
  .bs-com-head .bs-btn{height:40u}
  .bs-event{margin-top:12u;padding:10u}
  .bs-event em,.bs-spaces{display:none}
  .bs-feed{left:12u;right:12u;top:342u;gap:10u}
  .bs-feed-h,.bs-post-r{display:none}
  .bs-post:nth-of-type(n+3){display:none}
  .bs-post{grid-template-columns:32u 1fr;gap:10u;padding:11u 12u;border-radius:15u}
  .bs-post-av{width:32u!important;height:32u!important}
  .bs-post-h{font-size:12.5u}
  .bs-post-t{margin-top:2u!important;font-size:12.5u;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}

  .bs-coach-photo{right:0;width:auto;bottom:auto;height:236u}
  .bs-coach-photo::after{background:linear-gradient(to top,#0f1012,rgba(15,16,18,0) 60%)}
  .bs-coach-name{left:20u;bottom:92u}
  .bs-coach-name b{font-size:18u}
  .bs-coach-name i{font-size:12u}
  .bs-book{top:auto;bottom:14u;margin:0;height:352u}
  .bs-booked{left:12u;right:12u;bottom:12u;padding:12u 14u}
  .bs-book .bs-label{display:none}
  .bs-meta{gap:12u}
  .bs-book .bs-days{margin-top:14u}
  .bs-days{grid-template-columns:repeat(5,1fr);gap:7u}
  .bs-days i{height:50u}
  .bs-ring-day{--day:calc(100% + 7u);width:calc((100% - 28u) / 5);height:50u}
  .bs-times{margin:10u 0 14u}
  .bs-ring-time{top:48u}
}
`) + u(MOTION)
