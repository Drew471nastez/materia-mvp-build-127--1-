import { Brain, CalendarDays, Check, CheckCircle2, Copy, Heart, LayoutGrid, MessageCircle, Moon, Play, ShoppingBag, Truck, Users, Video } from "lucide-react"
import type { CSSProperties } from "react"
import { Pic, u } from "./frame"

/*
  WHAT A STOREFRONT SELLS, AS SMALL SCENES (landing round 8).
  The owner: keep the section, but "more motion graphic, changing,
  interactive", and a cleaner structure. So each kind of thing sold is one
  scene on its own ground, as wide as the showcase cards: the thing itself
  (a template on a tablet, a product shot, a course, a community, a coach)
  and the page that sells it, and a short moment plays while it is shown: a
  task ticks off, a cart fills, a lesson finishes, posts arrive, a time is
  picked and booked.

    Digital product   Second Brain, a dark Notion dashboard by Jun Park
    Physical product  HN1 Studio Headphones by Halfnote Audio, shot on yellow
    Course            Mixing in key, Tomás Reyes's course for new DJs (kept)
    Community         Applied AI Club, people building with AI
    Booking           A 1:1 training plan call with Talia Moreno, a strength coach

  Drawn at one design size per layout (1200 x 600 from 768px, 400 x 640
  below; `--u` in frame.tsx), so a picture is the same at any width. Every
  moment is a CSS animation on transform and opacity, started when the scene
  becomes the chosen one and paused while the section is off screen
  (business-carousel.tsx). The resting style of everything is its last
  frame, so with reduced motion a scene simply stands finished.

  Photographs: Unsplash (free licence), re-encoded small in public/home/showcase.
*/

/* ================================================================ Digital product */
const TILES = [
  ["brain-daily", "Daily", ["Today", "Journal"]],
  ["brain-work", "Projects", ["Board", "Notes"]],
  ["brain-health", "Health", ["Workouts", "Sleep"]],
  ["brain-goals", "Goals", ["This year", "Vision"]],
] as const

const TODOS = [
  ["Send the client brief", "Work", "Mon"],
  ["Upper body, 40 min", "Health", "Mon"],
  ["Plan the March trip", "Life", "Tue"],
  ["Read 20 pages", "Habit", "Daily"],
] as const

export function BrainScene() {
  return (
    <div className="bs bs-brain">
      <div className="bs-tablet">
        <div className="bs-screen">
          <div className="bn">
            <div className="bn-cover">
              <Pic n="bz-brain-cover" w={1200} h={340} className="bn-cover-pic" />
            </div>
            <span className="bn-icon">
              <Brain />
            </span>
            <b className="bn-title">Second Brain</b>
            <p className="bn-quote">Everything you are working on, in one calm place.</p>
            <div className="bn-tiles">
              {TILES.map(([pic, name, links], i) => (
                <span key={name} className="bn-tile" style={{ "--i": i } as CSSProperties}>
                  <span className="bn-tile-pic">
                    <Pic n={`bz-${pic}`} w={320} h={220} />
                    <b>{name}</b>
                  </span>
                  {links.map((l) => (
                    <i key={l}>{l}</i>
                  ))}
                </span>
              ))}
            </div>
            <div className="bn-over">
              <span className="bn-over-h">
                <b>Overview</b>
                <em>Today</em>
                <i>Projects</i>
                <i>Habits</i>
              </span>
              {TODOS.map(([task, tag, when], i) => (
                <span key={task} className="bn-row" style={{ "--i": i } as CSSProperties}>
                  <span className="bn-box">
                    {i < 3 && (
                      <i className="bn-fill">
                        <Check />
                      </i>
                    )}
                  </span>
                  <span className="bn-task">
                    {task}
                    {i < 3 && <s />}
                  </span>
                  <span className={`bn-tag t${i}`}>{tag}</span>
                  <span className="bn-when">{when}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="bs-card">
        <p className="bs-kicker">Notion template</p>
        <h4>Second Brain</h4>
        <p className="bs-by">by Jun Park</p>
        <p className="bs-price">$24</p>
        <ul className="bs-facts">
          <li>
            <Copy /> Duplicate into Notion in one click
          </li>
          <li>
            <LayoutGrid /> Tasks, notes, habits and goals
          </li>
          <li>
            <Moon /> Dark and light versions
          </li>
        </ul>
        <span className="bs-btn bs-press">Get the template</span>
      </div>
      <span className="bs-toast">
        <CheckCircle2 /> Duplicated into your Notion
      </span>
    </div>
  )
}

/* ================================================================ Physical product */
export function HeadphonesScene() {
  return (
    <div className="bs bs-phones">
      <div className="bs-photo">
        <Pic n="bz-headphones" w={1600} h={1067} className="bs-photo-pic" />
      </div>
      <span className="bs-spot s1">
        <i />
        <b>40 mm drivers</b>
      </span>
      <span className="bs-spot s2">
        <i />
        <b>32 hours a charge</b>
      </span>
      <div className="bs-card">
        <span className="bs-cart">
          <ShoppingBag />
          <b>1</b>
        </span>
        <p className="bs-kicker">Physical product</p>
        <h4>HN1 Studio Headphones</h4>
        <p className="bs-by">Halfnote Audio</p>
        <p className="bs-price">$189</p>
        <p className="bs-desc">Closed-back studio headphones, tuned for long mixing sessions.</p>
        <p className="bs-label">Colour: Black</p>
        <span className="bs-swatches">
          <i className="on" />
          <i className="sand" />
          <i className="olive" />
        </span>
        <p className="bs-ship">
          <Truck /> Ships from our studio in 2 days
        </p>
        <span className="bs-btn bs-press bs-swap">
          <span className="a">Add to cart</span>
          <span className="b">
            <Check /> Added to cart
          </span>
        </span>
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
          <Pic n="bz-ai-club" w={960} h={520} />
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
  The moments. Each is a delay into the scene's turn (business-carousel.tsx,
  BUSINESS_SLIDE_MS), and the resting style of every element is its end.
  `.bz-on` is set on the scene's frame while it is the chosen one (or fading
  out under the next), so these run from the start each time it comes back.
*/
const E = "cubic-bezier(.22,1,.36,1)"
const MOTION = `
@media(prefers-reduced-motion:no-preference){
.bz-on .bs-card,.bz-on .bs-com,.bz-on .bs-ccard{animation:bz-rise .8s ${E} .1s both}
.bz-on .bs-tablet{animation:bz-float .9s ${E} both}
.bz-on .bn-cover-pic,.bz-on .bs-photo-pic,.bz-on .bs-coach-pic{animation:bz-push 7s cubic-bezier(.25,.6,.3,1) both}
.bz-on .bn-tile{animation:bz-rise .6s ${E} calc(.35s + var(--i) * .08s) both}
.bz-on .bn-row{animation:bz-rise .5s ${E} calc(.7s + var(--i) * .07s) both}
.bz-on .bn-row:nth-child(2) .bn-fill{animation:bz-tick .35s ${E} 1.6s both}
.bz-on .bn-row:nth-child(3) .bn-fill{animation:bz-tick .35s ${E} 2.3s both}
.bz-on .bn-row:nth-child(4) .bn-fill{animation:bz-tick .35s ${E} 3s both}
.bz-on .bn-row:nth-child(2) s{animation:bz-strike .4s ${E} 1.7s both}
.bz-on .bn-row:nth-child(3) s{animation:bz-strike .4s ${E} 2.4s both}
.bz-on .bn-row:nth-child(4) s{animation:bz-strike .4s ${E} 3.1s both}
.bz-on .bn-row:nth-child(2) .bn-task{animation:bz-dim .4s ease 1.7s both}
.bz-on .bn-row:nth-child(3) .bn-task{animation:bz-dim .4s ease 2.4s both}
.bz-on .bn-row:nth-child(4) .bn-task{animation:bz-dim .4s ease 3.1s both}
.bz-on .bs-brain .bs-press{animation:bz-press .36s ease 3.9s both}
.bz-on .bs-toast{animation:bz-toast .6s ${E} 4.15s both}

.bz-on .bs-spot{animation:bz-pop .55s ${E} 1.1s both}
.bz-on .bs-spot.s2{animation-delay:1.7s}
.bz-on .bs-spot i::after{animation:bz-ping 1.8s ease-out 1.6s 3 both}
.bz-on .bs-phones .bs-press{animation:bz-press .36s ease 3.1s both}
.bz-on .bs-swap .a{animation:bz-out .3s ease 3.3s both}
.bz-on .bs-swap .b{animation:bz-in .4s ${E} 3.4s both}
.bz-on .bs-cart b{animation:bz-pop .45s ${E} 3.5s both}

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
@keyframes bz-float{from{opacity:0;transform:translate3d(0,26u,0) scale(.97)}}
@keyframes bz-push{from{transform:scale(1.07)}}
@keyframes bz-tick{from{opacity:0;transform:scale(.3)}}
@keyframes bz-strike{from{transform:scaleX(0)}}
@keyframes bz-dim{from{opacity:1}}
@keyframes bz-press{50%{transform:scale(.95)}}
@keyframes bz-toast{from{opacity:0;transform:translate3d(-50%,16u,0) scale(.96)}}
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
`

/* The tablet's screen is drawn at 626 design pixels wide in its own unit, `--t`, so the same Notion page fits the large and the small tablet. */
const t = (css: string) => css.replace(/(^|[\s(,:/*])(-?\d*\.?\d+)t\b/g, (_, pre: string, n: string) => `${pre}calc(${n}*var(--t))`)

const SCREEN = t(`
.bs-screen{position:absolute;inset:0;container-type:inline-size;border-radius:inherit;overflow:hidden;background:#191919}
.bn{--t:calc(100cqw / 626);position:absolute;inset:0;color:#e9e9e7;font-size:11t;line-height:1.35}
.bs .bn svg{width:12t;height:12t}
.bn-cover{height:100t;overflow:hidden}
.bn-cover-pic{transform-origin:50% 60%}
.bn-icon{position:absolute;left:34t;top:76t;display:grid;place-items:center;width:46t;height:46t;border-radius:12t;background:#efe9df;color:#191919;box-shadow:0 0 0 3t #191919}
.bs .bn-icon svg{width:26t;height:26t;stroke-width:1.8}
.bn-title{display:block;margin:30t 34t 0;font-size:25t;font-weight:700;letter-spacing:-.02em;color:#fff}
.bn-quote{margin:6t 34t 0!important;padding-left:9t;border-left:2t solid #8f8a80;font-size:10.5t;color:#a3a29e}
.bn-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12t;margin:14t 34t 0}
.bn-tile{display:grid;gap:4t;align-content:start}
.bn-tile-pic{position:relative;display:block;height:64t;margin-bottom:3t;border-radius:7t;overflow:hidden}
.bn-tile-pic::after{content:"";position:absolute;inset:0;background:rgba(10,10,12,.38)}
.bn-tile-pic b{position:absolute;inset:0;z-index:1;display:grid;place-items:center;font-size:14t;font-weight:700;color:#fff;letter-spacing:-.01em}
.bn-tile i{font-style:normal;font-size:10t;color:#b4b3ae;padding-left:2t}
.bn-tile i::before{content:"";display:inline-block;width:5t;height:5t;margin:0 6t 1t 0;border-radius:50%;background:#6f6c66}
.bn-over{margin:12t 34t 0;padding-top:10t;border-top:1t solid #2f2f2f}
.bn-over-h{display:flex;align-items:baseline;gap:12t;margin-bottom:6t;color:#8b8a86;font-size:10t}
.bn-over-h b{margin-right:6t;font-size:13t;color:#fff}
.bn-over-h em{font-style:normal;color:#fff;box-shadow:0 6t 0 -4.5t #fff}
.bn-over-h i{font-style:normal}
.bn-row{display:grid;grid-template-columns:16t 1fr 62t 40t;align-items:center;gap:9t;height:26t;border-bottom:1t solid #262626}
.bn-box{position:relative;display:grid;place-items:center;width:14t;height:14t;border-radius:4t;box-shadow:inset 0 0 0 1.3t #5d5c58}
.bn-fill{position:absolute;inset:0;display:grid;place-items:center;border-radius:inherit;background:#2e6fd1}
.bs .bn-fill svg{width:10t;height:10t;stroke-width:3.2;color:#fff}
.bn-task{position:relative;justify-self:start;color:#e9e9e7;opacity:.5;white-space:nowrap}
.bn-row:last-child .bn-task{opacity:1}
.bn-task s{position:absolute;left:0;right:0;top:52%;height:1t;background:#bdbcb8;transform-origin:0 50%}
.bn-tag{justify-self:start;padding:1.5t 6t;border-radius:4t;font-size:9.5t}
.bn-tag.t0{background:#28456c;color:#cfe1fa}
.bn-tag.t1{background:#2b4a36;color:#cdebd6}
.bn-tag.t2{background:#5a3f24;color:#f6dcc1}
.bn-tag.t3{background:#3d3a52;color:#dcd8f4}
.bn-when{color:#8b8a86;font-size:10t;text-align:right}
`)

export const BUSINESS_MOCK_CSS =
  SCREEN +
  u(`
.bz-frame{aspect-ratio:1200/600;border-radius:inherit}
.bz-frame>.smk{--w:1200}
.bs{position:absolute;inset:0;overflow:hidden;color:#18181b;font-size:14u;line-height:1.4}
.bs svg{width:15u;height:15u;flex:none}
.bs-card{position:absolute;display:flex;flex-direction:column;width:372u;padding:28u 28u 26u;border-radius:22u;background:#fff;box-shadow:0 0 0 1u rgba(16,24,40,.05),0 2u 4u rgba(16,24,40,.04),0 30u 60u -28u rgba(16,24,40,.4)}
.bs-kicker{font-size:11.5u;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#71717a}
.bs h4{margin:6u 0 0;font-size:25u;font-weight:650;line-height:1.12;letter-spacing:-.02em}
.bs-by{display:flex;align-items:center;gap:6u;margin-top:5u!important;font-size:13.5u;color:#71717a}
.bs-by svg{width:14u;height:14u}
.bs-price{margin-top:14u!important;font-size:23u;font-weight:650;letter-spacing:-.01em}
.bs-desc{margin-top:8u!important;font-size:13.5u;line-height:1.5;color:#52525b}
.bs-label{margin-top:16u!important;font-size:12.5u;font-weight:500;color:#52525b}
.bs-facts{display:grid;gap:11u;margin:18u 0 22u;padding:16u 0 0;border-top:1u solid #f0f0f1;list-style:none;font-size:13.5u;color:#3f3f46}
.bs-facts li{display:flex;align-items:center;gap:10u}
.bs-facts svg{color:#71717a}
.bs-btn{position:relative;display:grid;place-items:center;height:46u;margin-top:auto;padding:0 20u;border-radius:13u;background:#18181b;color:#fff;font-size:14.5u;font-weight:600;white-space:nowrap}

/* digital: the tablet on warm sand, the page that sells it beside */
.bs-brain{background:#e8e2d7}
.bs-tablet{position:absolute;left:64u;top:44u;width:676u;height:512u;padding:13u;border-radius:34u;background:#0d0d0e;box-shadow:inset 0 0 0 1.5u #2a2a2c,0 2u 4u rgba(30,20,10,.12),0 40u 70u -30u rgba(40,28,12,.55)}
.bs-tablet>.bs-screen{inset:13u;border-radius:22u}
.bs-brain .bs-card{right:64u;top:50%;margin-top:-196u;height:392u}
.bs-toast{position:absolute;left:402u;bottom:30u;display:flex;align-items:center;gap:9u;padding:12u 18u 12u 14u;border-radius:999u;background:#18181b;color:#fff;font-size:13.5u;font-weight:600;white-space:nowrap;transform:translate3d(-50%,0,0);box-shadow:0 14u 30u -12u rgba(0,0,0,.45)}
.bs-toast svg{color:#4ade80}

/* physical: the product shot fills the stage; the page stands on the yellow */
.bs-phones{background:#f5c518}
.bs-photo{position:absolute;inset:0;overflow:hidden}
.bs-photo-pic{object-position:62% 50%;transform-origin:62% 50%}
.bs-phones .bs-card{left:64u;top:50%;margin-top:-210u;height:420u}
.bs-cart{position:absolute;right:22u;top:22u;display:grid;place-items:center;width:38u;height:38u;border-radius:50%;background:#f4f4f5}
.bs-cart svg{width:17u;height:17u}
.bs-cart b{position:absolute;right:-3u;top:-3u;display:grid;place-items:center;min-width:18u;height:18u;border-radius:9u;background:#18181b;color:#fff;font-size:10.5u;font-weight:700}
.bs-swatches{display:flex;gap:9u;margin-top:8u}
.bs-swatches i{width:24u;height:24u;border-radius:50%;background:#1c1c1e;box-shadow:inset 0 0 0 1u rgba(0,0,0,.1)}
.bs-swatches i.sand{background:#d9ccb4}
.bs-swatches i.olive{background:#6b6f4e}
.bs-swatches i.on{box-shadow:0 0 0 2u #fff,0 0 0 3.5u #18181b}
.bs-ship{display:flex;align-items:center;gap:8u;margin:18u 0 16u!important;font-size:13u;color:#52525b}
.bs-swap{display:grid}
.bs-swap>span{grid-area:1/1;display:flex;align-items:center;gap:7u}
.bs-swap .a{opacity:0}
.bs-swap .b svg{width:15u;height:15u;color:#4ade80}
.bs-spot{position:absolute;display:flex;align-items:center;gap:10u;transform-origin:10u 50%}
.bs-spot i{position:relative;width:14u;height:14u;border-radius:50%;background:#fff;box-shadow:0 0 0 4u rgba(255,255,255,.35)}
.bs-spot i::after{content:"";position:absolute;inset:0;border-radius:50%;background:#fff;opacity:0}
.bs-spot b{padding:8u 13u;border-radius:999u;background:rgba(24,24,27,.86);color:#fff;font-size:13u;font-weight:600;white-space:nowrap}
.bs-spot.s1{left:640u;top:300u}
.bs-spot.s2{left:900u;top:452u}

/* course: as it was, a white card on a soft grey, now with its lesson playing */
.bs-course{background:#e9ecf0}
.bs-ccard{position:absolute;left:50%;top:36u;bottom:36u;width:720u;margin-left:-360u;display:flex;flex-direction:column;border-radius:20u;background:#fff;overflow:hidden;box-shadow:0 0 0 1u rgba(16,24,40,.06),0 1u 2u rgba(16,24,40,.04),0 30u 60u -30u rgba(16,24,40,.35)}
.bp-player{position:relative;height:250u;flex:none;overflow:hidden}
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

/* community: the club's page on a dark ground, its feed coming in beside it */
.bs-club{background:#111214}
.bs-com{position:absolute;left:64u;top:40u;bottom:40u;width:556u;display:flex;flex-direction:column;border-radius:22u;background:#fff;overflow:hidden}
.bs-com-cover{height:236u;flex:none;overflow:hidden}
.bs-com-body{padding:20u 24u 0}
.bs-com-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16u}
.bs-com-head .bs-btn{height:42u;margin:0}
.bs-event{display:flex;align-items:center;gap:12u;margin-top:16u;padding:12u;border-radius:14u;background:#f6f6f7}
.bs-date{display:grid;place-items:center;width:46u;height:48u;border-radius:11u;background:#fff;box-shadow:0 0 0 1u #ececee}
.bs-date i{font-size:10u;font-style:normal;font-weight:700;text-transform:uppercase;color:#e11d48;line-height:1}
.bs-date b{font-size:19u;font-weight:650;line-height:1.05}
.bs-event>span:nth-child(2){flex:1;display:grid;gap:2u}
.bs-event>span:nth-child(2) b{font-size:14u}
.bs-event>span:nth-child(2) i{font-size:12.5u;font-style:normal;color:#71717a}
.bs-event em{font-size:12.5u;font-style:normal;color:#52525b}
.bs-spaces{display:flex;flex-wrap:wrap;gap:8u;margin-top:14u}
.bs-spaces i{padding:6u 11u;border-radius:999u;background:#f4f4f5;font-size:12.5u;font-style:normal;font-weight:500;color:#3f3f46}
.bs-spaces i::before{content:"#";margin-right:3u;color:#a1a1aa}
.bs-feed{position:absolute;left:656u;right:64u;top:40u;display:grid;gap:12u}
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
.bs-coach-photo{position:absolute;left:0;top:0;bottom:0;width:560u;overflow:hidden}
.bs-coach-pic{object-position:50% 30%;transform-origin:40% 40%}
.bs-coach-photo::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(15,16,18,.72),rgba(15,16,18,0) 40%),linear-gradient(to left,#0f1012,rgba(15,16,18,0) 22%)}
.bs-coach-name{position:absolute;left:32u;bottom:30u;z-index:1;display:grid;gap:3u;color:#fff}
.bs-coach-name b{font-size:20u;font-weight:650}
.bs-coach-name i{font-size:13u;font-style:normal;opacity:.8}
.bs-book{--day:66u;right:84u;top:50%;width:470u;height:460u;margin-top:-230u}
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
  .bs-card,.bs-brain .bs-card,.bs-phones .bs-card,.bs-book{left:16u;right:16u;width:auto;padding:20u 20u 18u;border-radius:18u}
  .bs h4{font-size:21u}
  .bs-price{margin-top:8u!important;font-size:20u}
  .bs-facts{display:none}
  .bs-tablet{left:22u;top:20u;width:356u;height:340u;padding:8u;border-radius:22u}
  .bs-tablet>.bs-screen{inset:8u;border-radius:15u}
  .bs-brain .bs-card{top:auto;bottom:16u;margin:0;height:236u}
  .bs-toast{left:200u;bottom:auto;top:318u;font-size:12.5u}
  .bs-photo{bottom:auto;height:340u}
  .bs-photo-pic{object-position:72% 50%}
  .bs-phones .bs-card{top:auto;bottom:16u;margin:0;height:330u}
  .bs-desc{display:none}
  .bs-spot.s1{left:150u;top:118u}
  .bs-spot.s2{left:210u;top:220u}
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
  .bs-com-body{padding:16u 16u 0}
  .bs-com-head{display:grid;gap:12u;align-items:start}
  .bs-event em{display:none}
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
`) +
  u(MOTION)
