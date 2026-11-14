import { Check, Clock, Copy, Download, Lock, Play, RefreshCw, Truck, Users, Video } from "lucide-react"
import { Pic, u } from "./frame"

/*
  ONE PRODUCT PAGE PER KIND OF THING SOLD ON STORELIB (landing round 4).
  One calm product page for each kind of thing a Storelib store sells, the
  way a buyer sees it before paying, a white card on a coloured ground that
  changes with the kind (the owner: colourful, changing gradients behind the
  products, as the commerce sites do). Real photographs, a digital product
  drawn in HTML where a photo would be a stock render, and only what the page
  would really say: the price, the format, how it arrives.

    Digital product   Studio OS, Priya Raman's Notion workspace for freelancers
    Physical product  The Marigold Cap from Field Day, on a warm ground
    Course            Mixing in key, Tomás Reyes's course for new DJs
    Community         Second Serve, a padel community that finds you a game
    Booking           A portfolio review on a video call with Ines Duarte

  Each is drawn at one design width (640 x 520, `--u` in frame.tsx), so a
  phone sees the same page, smaller. Nothing moves inside them; the section
  crossfades from one to the next.

  Photographs: Unsplash (free licence), re-encoded small in public/home/showcase.
*/

function Kicker({ children }: { children: string }) {
  return <p className="bp-kicker">{children}</p>
}

/* ================================================================ Digital product */
const ROWS = [
  ["Lumen Coffee", "In progress", "blue", "$2,400"],
  ["Ola Swim", "Review", "amber", "$1,150"],
  ["Northwind", "Paid", "green", "$3,800"],
  ["Pressed Studio", "Draft", "grey", "$900"],
] as const

export function TemplatePage() {
  return (
    <div className="bp bp-digital">
      <div className="bp-card bp-split">
        <div className="bp-media bp-tint">
          <span className="bp-notion">
            <i className="bp-n-cover" />
            <span className="bp-n-icon">📒</span>
            <b className="bp-n-title">Studio OS</b>
            <span className="bp-n-tabs">
              <em>Clients</em>
              <span>Projects</span>
              <span>Invoices</span>
            </span>
            <span className="bp-n-table">
              <span className="bp-n-head">
                <span>Client</span>
                <span>Status</span>
                <span>Fee</span>
              </span>
              {ROWS.map(([c, s, tone, fee]) => (
                <span key={c} className="bp-n-row">
                  <b>{c}</b>
                  <span>
                    <i className={`bp-chip ${tone}`}>{s}</i>
                  </span>
                  <span>{fee}</span>
                </span>
              ))}
            </span>
          </span>
        </div>
        <div className="bp-info">
          <Kicker>Digital product</Kicker>
          <h4>Studio OS for Notion</h4>
          <p className="bp-by">by Priya Raman</p>
          <p className="bp-price">$29</p>
          <ul className="bp-facts">
            <li>
              <Copy /> Duplicate into Notion in one click
            </li>
            <li>
              <Download /> Clients, projects and invoices
            </li>
            <li>
              <RefreshCw /> Free updates for life
            </li>
          </ul>
          <span className="bp-btn">Buy now</span>
        </div>
      </div>
    </div>
  )
}

/* ================================================================ Physical product */
const SWATCHES = [
  ["marigold", "#f2a900"],
  ["navy", "#1f2a44"],
  ["bone", "#e9e4da"],
] as const

export function CapPage() {
  return (
    <div className="bp bp-cap">
      <div className="bp-card bp-split">
        <div className="bp-media bp-warm">
          <Pic n="bz-cap" w={800} h={800} className="bp-cap-pic" />
          <em className="bp-tag">Drop 04</em>
        </div>
        <div className="bp-info">
          <Kicker>Physical product</Kicker>
          <h4>Marigold Cap</h4>
          <p className="bp-by">Field Day</p>
          <p className="bp-price">$34</p>
          <p className="bp-label">Color: Marigold</p>
          <span className="bp-swatches">
            {SWATCHES.map(([n, c]) => (
              <i key={n} className={n === "marigold" ? "on" : undefined} style={{ background: c }} />
            ))}
          </span>
          <p className="bp-label">One size, adjustable strap</p>
          <p className="bp-ship">
            <Truck /> Embroidered in Porto, ships in 2 days
          </p>
          <span className="bp-btn">Add to cart</span>
        </div>
      </div>
    </div>
  )
}

/* ================================================================ Course */
const LESSONS = [
  ["1", "Counting bars and phrases", "9:20", "done"],
  ["2", "Beatmatching by ear", "14:05", "done"],
  ["3", "Mixing in key", "11:40", "now"],
  ["4", "Your first 30 minute set", "16:10", ""],
] as const

export function CoursePage() {
  return (
    <div className="bp bp-course">
      <div className="bp-card">
        <div className="bp-player">
          <Pic n="bz-dj" w={1000} h={600} />
          <span className="bp-play">
            <Play fill="currentColor" strokeWidth={0} />
          </span>
          <em>Lesson 1 · 9:20 · Free preview</em>
        </div>
        <div className="bp-course-body">
          <div className="bp-course-head">
            <div>
              <Kicker>Course</Kicker>
              <h4>Mixing in key, for new DJs</h4>
              <p className="bp-by">by Tomás Reyes · 16 lessons · 3 h 10 min</p>
            </div>
            <span className="bp-course-buy">
              <b>$79</b>
              <span className="bp-btn">Enroll</span>
            </span>
          </div>
          <ol className="bp-lessons">
            {LESSONS.map(([n, t, d, s]) => (
              <li key={n} className={s}>
                <i>{s === "done" ? <Check /> : s === "now" ? <Play fill="currentColor" strokeWidth={0} /> : n}</i>
                <b>{t}</b>
                <em>{d}</em>
                {s === "" && <Lock className="bp-lock" />}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}

/* ================================================================ Community */
const SPACES = [
  ["match-finder", "12 open games this week"],
  ["technique", "Bandeja clinic notes"],
  ["kit-swap", "3 rackets listed today"],
] as const

export function CommunityPage() {
  return (
    <div className="bp bp-community">
      <div className="bp-card">
        <Pic n="bz-padel" w={1000} h={560} className="bp-cover" />
        <div className="bp-com-body">
          <div className="bp-com-head">
            <div>
              <Kicker>Community</Kicker>
              <h4>Second Serve</h4>
              <p className="bp-by">
                <Users /> 1,960 members · $9 a month
              </p>
            </div>
            <span className="bp-btn">Join for $9</span>
          </div>
          <div className="bp-event">
            <span className="bp-date">
              <i>Thu</i>
              <b>20</b>
            </span>
            <span>
              <b>Social doubles, all levels</b>
              <i>7:30 pm · 6 courts booked</i>
            </span>
            <em>38 going</em>
          </div>
          <ul className="bp-spaces">
            {SPACES.map(([t, s]) => (
              <li key={t}>
                <b>{t}</b>
                <i>{s}</i>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

/* ================================================================ Booking */
const SLOTS = [
  ["Tue 18", ["10:00", "14:30"]],
  ["Wed 19", ["9:30", "16:00"]],
  ["Thu 20", ["11:00", "16:30"]],
] as const

export function BookingPage() {
  return (
    <div className="bp bp-booking">
      <div className="bp-card bp-split">
        <div className="bp-host">
          <Pic n="bz-host" w={480} h={600} className="bp-host-pic" />
          <span className="bp-host-name">
            <b>Ines Duarte</b>
            <i>Brand designer, Lisbon</i>
          </span>
        </div>
        <div className="bp-info bp-pick">
          <Kicker>Booking</Kicker>
          <h4>Portfolio review</h4>
          <p className="bp-meta">
            <span>
              <Clock /> 30 min
            </span>
            <span>
              <Video /> Video call
            </span>
            <b>$60</b>
          </p>
          <p className="bp-label">Pick a time</p>
          <span className="bp-slots">
            {SLOTS.map(([d, times]) => (
              <span key={d} className="bp-slot-row">
                <em>{d}</em>
                {times.map((t) => (
                  <i key={t} className={d === "Thu 20" && t === "16:30" ? "on" : undefined}>
                    {t}
                  </i>
                ))}
              </span>
            ))}
          </span>
          <span className="bp-btn">Book Thu 20 at 16:30</span>
        </div>
      </div>
    </div>
  )
}

/* ================================================================ styles */
export const BUSINESS_MOCK_CSS = u(`
.bp{position:absolute;inset:0;padding:30u;color:#18181b;font-family:var(--font-inter,Inter),Inter,system-ui,sans-serif;font-size:14u;line-height:1.4}
.bp-digital{background:linear-gradient(140deg,#c7d7ff 0%,#d9c8ff 55%,#f6c9e8 100%)}
.bp-cap{background:linear-gradient(150deg,#ffb36b 0%,#ff7a4d 50%,#f2507a 100%)}
.bp-course{background:linear-gradient(150deg,#9fe3dc 0%,#7cc4f0 55%,#8f9ff5 100%)}
.bp-community{background:linear-gradient(150deg,#d6f28a 0%,#9ee6a8 55%,#7fd6c8 100%)}
.bp-booking{background:linear-gradient(150deg,#ffd6c2 0%,#ffc2d4 55%,#e9c4ff 100%)}
.bp svg{width:15u;height:15u;flex:none}
.bp-card{position:relative;height:100%;border-radius:17u;background:#fff;overflow:hidden;box-shadow:0 1u 2u rgba(16,24,40,.06),0 24u 48u -28u rgba(16,24,40,.45)}
.bp-split{display:grid;grid-template-columns:262u 1fr}
.bp-media{position:relative;display:grid;place-items:center;overflow:hidden;margin:14u 0 14u 14u;border-radius:13u}
.bp-info{display:flex;flex-direction:column;padding:28u 26u 24u}
.bp-kicker{font-size:11.5u;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#71717a}
.bp h4{margin:6u 0 0;font-size:24u;font-weight:600;line-height:1.15;letter-spacing:-.015em}
.bp-by{display:flex;align-items:center;gap:6u;margin-top:5u!important;font-size:13.5u;color:#71717a}
.bp-by svg{width:14u;height:14u}
.bp-price{margin-top:14u!important;font-size:22u;font-weight:600}
.bp-facts{display:grid;gap:10u;margin:18u 0 0;padding:16u 0 0;border-top:1u solid #f0f0f1;list-style:none;font-size:13.5u;color:#3f3f46}
.bp-facts li{display:flex;align-items:center;gap:10u}
.bp-facts svg{color:#71717a}
.bp-btn{display:grid;place-items:center;height:44u;margin-top:auto;padding:0 20u;border-radius:12u;background:#18181b;color:#fff;font-size:14.5u;font-weight:600;white-space:nowrap}
.bp-label{margin-top:14u!important;font-size:12.5u;font-weight:500;color:#52525b}

/* digital: the template itself, a Notion page with its clients table */
.bp-tint{background:linear-gradient(160deg,#eef2ff,#f5edff)}
.bp-notion{position:relative;display:flex;flex-direction:column;width:226u;height:300u;border-radius:9u;background:#fff;overflow:hidden;box-shadow:0 1u 2u rgba(30,20,60,.12),0 18u 30u -18u rgba(60,40,120,.45);font-size:9.5u;color:#37352f}
.bp-n-cover{display:block;height:54u;background:linear-gradient(120deg,#6d8cff,#b37dff 60%,#ff9ec7)}
.bp-n-icon{margin:-17u 0 0 14u;font-size:28u;line-height:1}
.bp-n-title{margin:6u 14u 0;font-size:17u;font-weight:700;letter-spacing:-.01em}
.bp-n-tabs{display:flex;gap:10u;margin:9u 14u 0;padding-bottom:6u;border-bottom:1u solid #ececea;color:#9b9a97}
.bp-n-tabs em{font-style:normal;font-weight:600;color:#37352f;box-shadow:0 7u 0 -5.5u #37352f}
.bp-n-table{display:grid;margin:2u 14u 0}
.bp-n-head,.bp-n-row{display:grid;grid-template-columns:1.25fr 1fr .7fr;align-items:center;gap:6u;height:30u;border-bottom:1u solid #f1f1ef}
.bp-n-head{height:26u;color:#9b9a97}
.bp-n-row b{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bp-n-row>span:last-child{color:#5f5e5b;font-variant-numeric:tabular-nums}
.bp-chip{display:inline-block;padding:2u 6u;border-radius:4u;font-size:8.5u;font-style:normal;font-weight:500;white-space:nowrap}
.bp-chip.blue{background:#d3e5ef;color:#183347}
.bp-chip.amber{background:#fdecc8;color:#402c1b}
.bp-chip.green{background:#dbeddb;color:#1c3829}
.bp-chip.grey{background:#ececea;color:#5f5e5b}

/* physical: the cap on a warm ground */
.bp-warm{background:radial-gradient(90% 70% at 50% 40%,#fff3e6 0%,#ffe0cc 60%,#ffd0c4 100%)}
.bp-cap-pic{width:96%!important;height:auto!important;aspect-ratio:1;mix-blend-mode:multiply;background:none}
.bp-tag{position:absolute;left:12u;top:12u;padding:4u 9u;border-radius:999u;background:#fff;color:#c2410c;font-size:11u;font-style:normal;font-weight:700;letter-spacing:.02em;box-shadow:0 1u 3u rgba(120,40,10,.15)}
.bp-swatches{display:flex;gap:9u;margin-top:8u}
.bp-swatches i{width:24u;height:24u;border-radius:50%;box-shadow:inset 0 0 0 1u rgba(0,0,0,.1)}
.bp-swatches i.on{box-shadow:0 0 0 2u #fff,0 0 0 3.5u #18181b}
.bp-ship{display:flex;align-items:center;gap:8u;margin:16u 0 14u!important;font-size:12.5u;color:#52525b}
.bp-cap .bp-price{margin-top:8u!important}

/* course */
.bp-course .bp-card{display:flex;flex-direction:column}
.bp-player{position:relative;height:190u;flex:none;overflow:hidden}
.bp-play{position:absolute;left:50%;top:50%;width:52u;height:52u;margin:-26u 0 0 -26u;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.94);color:#18181b;box-shadow:0 6u 18u rgba(0,0,0,.2)}
.bp-play svg{width:18u;height:18u;margin-left:2u}
.bp-player em{position:absolute;left:12u;bottom:12u;padding:5u 10u;border-radius:999u;background:rgba(24,24,27,.66);color:#fff;font-size:11.5u;font-style:normal;font-weight:600}
.bp-course-body{padding:18u 22u 0}
.bp-course-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16u}
.bp-course-head h4{font-size:20u}
.bp-course-buy{display:flex;align-items:center;gap:12u}
.bp-course-buy b{font-size:20u;font-weight:600}
.bp-course-buy .bp-btn{height:40u}
.bp-lessons{margin:14u 0 0;padding:0;list-style:none;border-top:1u solid #f0f0f1}
.bp-lessons li{display:flex;align-items:center;gap:12u;height:40u;border-bottom:1u solid #f4f4f5;font-size:13.5u}
.bp-lessons i{display:grid;place-items:center;width:24u;height:24u;border-radius:50%;font-size:11.5u;font-style:normal;font-weight:600;color:#71717a;box-shadow:inset 0 0 0 1.5u #e4e4e7}
.bp-lessons i svg{width:12u;height:12u}
.bp-lessons .done i{background:#18181b;color:#fff;box-shadow:none}
.bp-lessons .done b{color:#71717a;font-weight:500}
.bp-lessons .now i{background:#f4f4f5;color:#18181b}
.bp-lessons b{flex:1;font-weight:600}
.bp-lessons em{font-style:normal;font-size:12.5u;color:#71717a}
.bp-lock{width:13u!important;height:13u!important;color:#a1a1aa}

/* community */
.bp-community .bp-card{display:flex;flex-direction:column}
.bp-cover{height:150u!important;flex:none}
.bp-com-body{padding:18u 22u 0}
.bp-com-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16u}
.bp-com-head .bp-btn{height:40u;margin:0}
.bp-event{display:flex;align-items:center;gap:12u;margin-top:16u;padding:12u;border-radius:13u;background:#f7f7f8}
.bp-date{display:grid;place-items:center;width:44u;height:46u;border-radius:10u;background:#fff;box-shadow:0 0 0 1u #ececee}
.bp-date i{font-size:10u;font-style:normal;font-weight:600;text-transform:uppercase;color:#dc2626;line-height:1}
.bp-date b{font-size:18u;font-weight:600;line-height:1}
.bp-event>span:nth-child(2){flex:1;display:grid;gap:2u}
.bp-event>span:nth-child(2) b{font-size:14u}
.bp-event>span:nth-child(2) i{font-size:12.5u;font-style:normal;color:#71717a}
.bp-event em{font-size:12.5u;font-style:normal;color:#52525b}
.bp-spaces{display:grid;margin:12u 0 0;padding:0;list-style:none}
.bp-spaces li{display:flex;align-items:center;justify-content:space-between;height:38u;border-bottom:1u solid #f4f4f5;font-size:13.5u}
.bp-spaces b{font-weight:500}
.bp-spaces b::before{content:"#";margin-right:7u;color:#a1a1aa;font-weight:400}
.bp-spaces i{font-size:12.5u;font-style:normal;color:#71717a}

/* booking: the person first, then a few times to pick from */
.bp-booking .bp-split{grid-template-columns:236u 1fr}
.bp-host{position:relative;margin:14u 0 14u 14u;border-radius:13u;overflow:hidden}
.bp-host-pic{position:absolute;inset:0;object-position:50% 25%}
.bp-host-name{position:absolute;left:0;right:0;bottom:0;display:grid;gap:2u;padding:40u 16u 16u;background:linear-gradient(to top,rgba(10,10,12,.72),rgba(10,10,12,0));color:#fff}
.bp-host-name b{font-size:16u;font-weight:600}
.bp-host-name i{font-size:12u;font-style:normal;opacity:.85}
.bp-meta{display:flex;align-items:center;gap:14u;margin-top:10u!important;font-size:13u;color:#52525b}
.bp-meta span{display:flex;align-items:center;gap:6u}
.bp-meta svg{width:14u;height:14u;color:#71717a}
.bp-meta b{margin-left:auto;font-size:20u;font-weight:600;color:#18181b}
.bp-pick .bp-label{margin-top:20u!important}
.bp-slots{display:grid;gap:8u;margin:10u 0 18u}
.bp-slot-row{display:grid;grid-template-columns:62u 1fr 1fr;align-items:center;gap:8u}
.bp-slot-row em{font-size:12.5u;font-style:normal;font-weight:600;color:#3f3f46}
.bp-slot-row i{display:grid;place-items:center;height:36u;border-radius:10u;font-size:13u;font-style:normal;font-weight:500;box-shadow:inset 0 0 0 1u #e4e4e7}
.bp-slot-row i.on{background:#18181b;color:#fff;box-shadow:none}
`)
