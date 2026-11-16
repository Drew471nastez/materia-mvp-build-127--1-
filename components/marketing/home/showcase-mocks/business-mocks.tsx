import { CalendarDays, Check, CheckCircle2, Download, FileText, Heart, MessageCircle, Play, Truck, Users, Video } from "lucide-react"
import type { CSSProperties } from "react"
import { Pic, pic, u } from "./frame"

/*
  WHAT A STOREFRONT SELLS, AS SMALL SCENES (landing rounds 8 to 12).
  Each kind of thing sold is one scene on its own calm ground: the thing
  itself, photographed, and the Storelib page that sells it, with one short
  moment playing while it is shown.

    Digital product   Slow Mornings, Ana Folau's e-book of breakfasts: its
                      cover and a page from inside, and its buy card, where
                      it is bought and the PDF downloads
    Physical product  Night Face Oil, Marisol Vega's small batch oil: its
                      photograph and two details, a size picked, added to
                      the cart
    Course            Mixing in key, Tomás Reyes's course for new DJs (kept)
    Community         Applied AI Club, under its green banner (kept)
    Booking           A 1:1 training plan call with Talia Moreno (kept)

  Round 12, the owner liked the course, the community and the booking, and
  not the digital row of covers ("the high-end Lightroom presets") or the
  physical tee, cap, tote and print. Both are now built the way the liked
  three are: one real product, photographed, inside a believable page, with
  one thing happening on it. No presets, no merch.

  Drawn at one design size per layout (1100 x 570 from 768px, 360 x 520
  below; `--u` in frame.tsx), so a picture is the same at any width. Every
  moment is a CSS animation on transform and opacity, started when the scene
  becomes the chosen one and paused while the section is off screen
  (business-carousel.tsx). Without motion every scene stands at its resting
  style: the finished moment.

  Photographs: Unsplash (free licence), re-encoded small in public/home/showcase.
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
export const DIGITAL_PRODUCT = {
  kind: "E-book",
  name: "Slow Mornings",
  by: "Ana Folau",
  price: "$16",
  meta: "96 pages · PDF and EPUB",
  file: "Slow-Mornings.pdf",
  /* Unsplash photo-1482049016688-2d3e1b311543 (the page inside); the cover is bz-ebook. */
  cover: "bz-ebook",
  page: "bz-eggs",
  chapters: [
    ["Eggs, slowly", "p. 8"],
    ["Breads and butters", "p. 30"],
    ["Bowls for later", "p. 52"],
    ["Something sweet", "p. 74"],
  ],
} as const

export function DigitalScene() {
  const d = DIGITAL_PRODUCT
  return (
    <div className="bs bs-digital">
      {/* A page from inside, behind the cover: the first recipe of the first chapter. */}
      <div className="be-page">
        <Still src={pic(d.page)} w={560} h={560} className="smk-pic be-page-pic" />
        <span className="be-page-text">
          <i>Chapter 1 · Eggs, slowly</i>
          <b>Soft eggs on rye</b>
          <em>2 eggs, at room temperature</em>
          <em>2 slices of dark rye, toasted</em>
          <em>Half an avocado, a handful of spinach</em>
          <em>Lemon, flaky salt, black pepper</em>
        </span>
        <span className="be-page-n">14</span>
      </div>
      <div className="be-cover">
        <Still src={pic(d.cover)} w={640} h={800} className="smk-pic be-cover-pic" />
        <span className="be-cover-band">
          <i>{d.by}</i>
          <b>{d.name}</b>
          <em>40 breakfasts worth waking for</em>
        </span>
      </div>
      <div className="bs-card be-card">
        <p className="bs-kicker">{d.kind}</p>
        <h4>{d.name}</h4>
        <p className="bs-by">
          by {d.by} · {d.meta}
        </p>
        <p className="bs-price">{d.price}</p>
        <ol className="be-toc">
          {d.chapters.map(([title, page], i) => (
            <li key={title}>
              <i>{i + 1}</i>
              <b>{title}</b>
              <em>{page}</em>
            </li>
          ))}
        </ol>
        <p className="be-instant">
          <Download /> Instant download, a copy by email
        </p>
        {/* The button is the whole moment: pressed, it downloads the PDF in place, then says so. */}
        <span className="bs-btn bs-press be-buy">
          <span className="be-fill" />
          <span className="a">Buy for {d.price}</span>
          <span className="b">
            <FileText /> Downloading {d.file}
          </span>
          <span className="c">
            <Check /> Downloaded
          </span>
        </span>
      </div>
    </div>
  )
}

/* ================================================================ Physical product */
export const PHYSICAL_PRODUCT = {
  kind: "Skincare",
  name: "Night Face Oil",
  by: "Marisol Vega",
  sub: "Small batch, cold pressed",
  price: "$38",
  desc: "Rosehip, jojoba and squalane in amber glass. Three drops before bed.",
  label: "Size",
  options: ["15 ml", "30 ml", "50 ml"],
  pick: 1,
  ship: "Ships in 2 days, tracked",
  /* Unsplash photo-1608571423902-eed4a5ad8108, re-encoded as bz-oil. */
  pic: "bz-oil",
} as const

export function PhysicalScene() {
  const d = PHYSICAL_PRODUCT
  return (
    <div className="bs bs-oil">
      {/* The product page's gallery: the photograph and two details of it, the first one shown. */}
      <span className="bo-thumbs" aria-hidden="true">
        {["a", "b", "c"].map((k) => (
          <i key={k} className={`bo-thumb bo-thumb-${k}`}>
            <Still src={pic(d.pic)} w={840} h={980} />
          </i>
        ))}
      </span>
      <div className="bo-main">
        <Still src={pic(d.pic)} w={840} h={980} className="smk-pic bo-main-pic" />
      </div>
      <div className="bs-card bo-card">
        <p className="bs-kicker">{d.kind}</p>
        <h4>{d.name}</h4>
        <p className="bs-by">
          by {d.by} · {d.sub}
        </p>
        <p className="bs-price">{d.price}</p>
        <p className="bs-desc">{d.desc}</p>
        <p className="bs-label">{d.label}</p>
        <span className="bo-opts" style={{ "--n": d.options.length, "--k": d.pick } as CSSProperties}>
          <span className="bs-ring bo-ring" />
          {d.options.map((o) => (
            <i key={o}>{o}</i>
          ))}
        </span>
        <p className="bs-ship">
          <Truck /> {d.ship}
        </p>
        <span className="bs-btn bs-press bs-swap">
          <span className="a">Add to cart</span>
          <span className="b">
            <Check /> Added to cart
          </span>
        </span>
      </div>
      <span className="bo-added">
        <i>
          <Still src={pic(d.pic)} w={840} h={980} />
        </i>
        <span>
          <b>{d.name}</b>
          <em>
            {d.options[d.pick]} · {d.price}
          </em>
        </span>
        <CheckCircle2 />
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
  scene's frame while it is the chosen one (or fading out under the next; on
  a phone, while its card is the one in view or beside it), so these run
  from the start each time it comes back. One-shot, every one, on the
  compositor: no loop runs inside a scene any more.
*/
const E = "cubic-bezier(.22,1,.36,1)"
const MOTION = `
@media(prefers-reduced-motion:no-preference){
.bz-on .bs-card,.bz-on .bs-com,.bz-on .bs-ccard{animation:bz-rise .8s ${E} .1s backwards}
.bz-on .bs-coach-pic,.bz-on .bo-main-pic{animation:bz-push 7s cubic-bezier(.25,.6,.3,1) both}

.bz-on .be-cover{animation:bz-rise .9s ${E} both}
.bz-on .be-page{animation:be-slide 1.1s ${E} .45s both}
.bz-on .bs-digital .bs-press{animation:bz-press .36s ease 2.1s both}
.bz-on .be-buy .a{animation:bz-out .3s ease 2.3s both}
.bz-on .be-buy .b{animation:be-mid 1.7s linear 2.35s both}
.bz-on .be-fill{animation:be-fill 1.7s linear 2.35s both}
.bz-on .be-buy .c{animation:bz-in .4s ${E} 4.05s both}

.bz-on .bo-ring{animation:bz-pop .45s ${E} 1s both}
.bz-on .bs-oil .bs-press{animation:bz-press .36s ease 2.2s both}
.bz-on .bs-oil .bs-swap .a{animation:bz-out .3s ease 2.35s both}
.bz-on .bs-oil .bs-swap .b{animation:bz-in .4s ${E} 2.45s both}
.bz-on .bo-added{animation:bz-rise .6s ${E} 2.7s both}

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
.bz-on .bs-booked{animation:bz-rise .6s ${E} 4.2s backwards}
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
@keyframes be-slide{from{transform:translate3d(-70u,6u,0)}}
@keyframes be-mid{0%{opacity:0;transform:translate3d(0,10u,0)}12%,88%{opacity:1;transform:none}100%{opacity:0;transform:translate3d(0,-10u,0)}}
@keyframes be-fill{0%{opacity:1;transform:scaleX(0)}92%{opacity:1;transform:scaleX(1)}100%{opacity:0;transform:scaleX(1)}}
`

export const BUSINESS_MOCK_CSS =
  u(`
.bz-frame{aspect-ratio:1100/570;border-radius:inherit}
.bz-frame>.smk{--w:1100}
.bs{position:absolute;inset:0;overflow:hidden;color:#18181b;font-size:14u;line-height:1.4}
.bs svg{width:15u;height:15u;flex:none}
.bs-digital .smk-pic,.bs-oil .smk-pic{background:none}
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

/* digital: the e-book's cover in front of a page from inside, on a warm paper ground; the card is its page on the store */
.bs-digital{background:#ede7de}
.be-cover,.be-page{position:absolute;overflow:hidden}
.be-cover{left:96u;top:96u;width:268u;height:360u;border-radius:4u 10u 10u 4u;background:#f6f1e8;box-shadow:0 0 0 1u rgba(60,40,20,.08),0 3u 6u rgba(60,40,20,.08),0 36u 56u -26u rgba(60,40,20,.55)}
/* the light along the spine, as on a printed cover */
.be-cover::before{content:"";position:absolute;z-index:2;left:0;top:0;bottom:0;width:14u;background:linear-gradient(to right,rgba(40,25,10,.22),rgba(255,255,255,.22) 35%,rgba(255,255,255,0) 60%,rgba(40,25,10,.06))}
.be-cover-pic{position:absolute;left:0;right:0;bottom:0;width:100%!important;height:64%!important;object-position:50% 45%}
.be-cover-band{position:absolute;left:0;right:0;top:0;height:36%;display:grid;align-content:center;justify-items:center;gap:6u;padding:0 22u;background:#f6f1e8;color:#2b2118;text-align:center}
.be-cover-band i{font-size:8.5u;font-style:normal;font-weight:600;letter-spacing:.24em;text-transform:uppercase;color:#8a7a68}
.be-cover-band b{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-size:35u;font-weight:500;line-height:1;letter-spacing:-.015em}
.be-cover-band em{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-size:11u;font-style:italic;color:#6f6152}
.be-page{left:326u;top:122u;width:268u;height:348u;border-radius:3u 6u 6u 3u;background:#fbf8f3;box-shadow:0 0 0 1u rgba(60,40,20,.07),0 24u 44u -26u rgba(60,40,20,.42)}
.be-page-pic{position:absolute;left:0;top:0;width:100%!important;height:178u!important}
.be-page-text{position:absolute;left:58u;right:20u;top:194u;display:grid;gap:3u;color:#3b3128}
.be-page-text i{margin-bottom:3u;font-size:7.5u;font-style:normal;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#9a8b78}
.be-page-text b{margin-bottom:6u;font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-size:19u;font-weight:500;line-height:1.05;letter-spacing:-.01em}
.be-page-text em{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-size:9.5u;font-style:normal;line-height:1.35;color:#6b5f52}
.be-page-n{position:absolute;right:18u;bottom:14u;font-family:Georgia,serif;font-size:8u;color:#a39684}
.be-card{right:64u;top:50%;height:448u;margin-top:-224u}
.be-toc{margin:14u 0 0;padding:0;list-style:none;border-top:1u solid #f0f0f1}
.be-toc li{display:flex;align-items:center;gap:12u;height:38u;border-bottom:1u solid #f4f4f5;font-size:13.5u}
.be-toc i{display:grid;place-items:center;width:22u;height:22u;border-radius:50%;font-size:11u;font-style:normal;font-weight:600;color:#71717a;box-shadow:inset 0 0 0 1.5u #e4e4e7}
.be-toc b{flex:1;font-weight:550}
.be-toc em{font-size:12.5u;font-style:normal;color:#a1a1aa}
.be-instant{display:flex;align-items:center;gap:8u;margin:14u 0 14u!important;font-size:13u;color:#52525b}
.be-instant svg{width:14u;height:14u;color:#71717a}
.be-buy{overflow:hidden;isolation:isolate}
.be-buy>span{grid-area:1/1;display:flex;align-items:center;gap:8u}
.be-buy>.a,.be-buy>.b{opacity:0}
.be-buy svg{width:16u;height:16u}
.be-buy .c svg{color:#4ade80}
.be-fill{position:absolute!important;inset:0;z-index:-1;background:#3f3f46;transform-origin:0 50%;opacity:0}

/* physical: the product page of one oil, its photograph large with two details beside it; a size picked, added to the cart */
.bs-oil{background:#ebe5dd}
.bo-thumbs{position:absolute;left:44u;top:50%;display:grid;gap:10u;margin-top:-115u}
.bo-thumb{position:relative;display:block;width:60u;height:70u;border-radius:10u;overflow:hidden;box-shadow:0 0 0 1u rgba(60,40,20,.08)}
.bo-thumb .smk-pic{position:absolute;inset:0;width:100%;height:100%}
.bo-thumb-a::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 2u #18181b}
.bo-thumb-b .smk-pic{object-position:50% 30%;transform:scale(2.1);transform-origin:50% 38%}
.bo-thumb-c .smk-pic{object-position:50% 100%;transform:scale(1.7);transform-origin:50% 80%}
.bo-main{position:absolute;left:122u;top:26u;bottom:26u;width:478u;border-radius:18u;overflow:hidden;background:#e7e0d7}
.bo-main-pic{position:absolute;inset:0;width:100%!important;height:100%!important;object-position:50% 46%;transform-origin:50% 40%}
.bo-card{right:56u;top:50%;width:392u;height:404u;margin-top:-202u}
.bo-opts{position:relative;display:grid;grid-template-columns:repeat(var(--n),1fr);gap:8u;margin-top:8u}
.bo-opts i{display:grid;place-items:center;height:42u;border-radius:11u;font-size:13.5u;font-style:normal;font-weight:500;white-space:nowrap;box-shadow:inset 0 0 0 1u #e4e4e7}
.bo-ring{left:0;top:0;width:calc((100% - (var(--n) - 1) * 8u) / var(--n));height:42u;border-radius:11u;transform:translate3d(calc((100% + 8u) * var(--k)),0,0)}
.bs-ship{display:flex;align-items:center;gap:8u;margin:16u 0 16u!important;font-size:13u;color:#52525b}
.bs-ship svg{width:15u;height:15u;color:#71717a}
.bo-added{position:absolute;left:142u;top:46u;display:flex;align-items:center;gap:12u;padding:10u 16u 10u 10u;border-radius:16u;background:#fff;box-shadow:0 0 0 1u rgba(16,24,40,.05),0 18u 36u -18u rgba(16,24,40,.4)}
.bo-added>i{position:relative;width:42u;height:42u;border-radius:10u;overflow:hidden}
.bo-added .smk-pic{position:absolute;inset:0;width:100%;height:100%;object-position:50% 35%;transform:scale(1.6);transform-origin:50% 38%}
.bo-added>span{display:grid;gap:1u}
.bo-added b{font-size:13.5u}
.bo-added em{font-size:12.5u;font-style:normal;color:#71717a}
.bo-added>svg{width:20u;height:20u;margin-left:10u;color:#16a34a}

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
.bs-com-logo b i{margin:0 4u;font-style:normal;color:#d9f969}
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
  .bs-card,.be-card,.bo-card,.bs-book{left:14u;right:14u;width:auto;padding:18u 18u 16u;border-radius:18u}
  .bs h4{font-size:21u}
  .bs-price{margin-top:8u!important;font-size:20u}

  .be-cover{left:30u;top:22u;width:170u;height:228u}
  .be-cover::before{width:10u}
  .be-cover-band{gap:4u;padding:0 12u}
  .be-cover-band i{font-size:6.5u}
  .be-cover-band b{font-size:23u}
  .be-cover-band em{font-size:8u}
  .be-page{left:168u;top:40u;width:164u;height:212u}
  .be-page-pic{height:112u!important}
  .be-page-text{left:40u;right:12u;top:122u;gap:2u}
  .be-page-text i{font-size:5.5u}
  .be-page-text b{margin-bottom:3u;font-size:13u}
  .be-page-text em{font-size:7u}
  .be-page-text em:nth-of-type(n+4){display:none}
  .be-page-n{right:12u;bottom:9u;font-size:6u}
  .be-card{top:auto;bottom:14u;margin:0;height:232u}
  .be-toc{display:none}
  .be-instant{margin:12u 0!important;font-size:12.5u}

  .bo-thumbs{display:none}
  .bo-main{left:0;right:0;top:0;bottom:auto;width:auto;height:270u;border-radius:0}
  .bo-main-pic{object-position:50% 22%}
  .bo-card{top:auto;bottom:14u;margin:0;height:262u}
  .bo-card .bs-kicker,.bo-card .bs-desc,.bs-ship,.bo-added{display:none}
  .bo-card h4{margin-top:0}
  .bo-card .bs-label{margin-top:12u!important}
  .bo-opts{margin-bottom:14u}
  .bo-opts i{height:40u;font-size:13u}
  .bo-ring{height:40u}

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
