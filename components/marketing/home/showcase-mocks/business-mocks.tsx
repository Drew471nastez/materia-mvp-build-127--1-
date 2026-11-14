import { Calendar, Check, Clock, Download, FileAudio, Lock, MapPin, Play, Truck, Users, Video } from "lucide-react"
import { Pic, u } from "./frame"

/*
  ONE PRODUCT PAGE PER KIND OF THING SOLD ON STORELIB (landing round).
  The owner did not want "Every business, one home" and its five storefront
  mockups. In their place: one calm product page for each kind of thing a
  Storelib store sells, the way a buyer sees it before paying, on a light
  grey stage. Real photographs, a product drawn in HTML where a photo would
  be a stock render, and only what the page would really say: the price,
  the format, how it arrives.

  Landing round 3 (the owner: a digital product must be "an actual digital
  product", not a cover with a photograph): the digital product is a drum
  sample pack, drawn whole in HTML. Its cover is type and a waveform, the
  way such packs are sold, with three of its files under it.

    Digital product   Dust & Tape Drums, Ray Okoye's pack of 140 drum samples
    Course            Wheel throwing, from first centering, by Mei Lin
    Community         Saturday Run Club, Dani Brooks's free run club
    Physical product  The Pines Tour Tee, printed and shipped for Hollow Pines
    Booking           A 45 minute Spanish conversation with Elena Ruiz

  Each is drawn at one design width (640 x 520, `--u` in frame.tsx), so a
  phone sees the same page, smaller. Nothing moves inside them; the section
  crossfades from one to the next.

  Photographs: Unsplash (free licence), re-encoded small in public/home/showcase.
*/

function Kicker({ children }: { children: string }) {
  return <p className="bp-kicker">{children}</p>
}

/* ================================================================ Digital product */
/* A sound's outline, as bar heights in percent: a hit that rings out, a short tick, a loop of four beats. */
const WAVES = {
  cover: [18, 34, 62, 96, 80, 58, 70, 44, 52, 30, 38, 22, 26, 16, 20, 12, 14, 9, 11, 7, 8, 6, 22, 48, 88, 72, 50, 60, 36, 42, 26, 30, 18, 20, 13, 15, 10, 11, 8, 7],
  kick: [30, 96, 84, 66, 54, 42, 34, 26, 20, 15, 12, 9, 7, 6, 5, 4],
  hat: [90, 60, 34, 20, 12, 8, 5, 4, 3, 3, 2, 2, 2, 2, 2, 2],
  loop: [80, 30, 14, 46, 90, 34, 16, 40, 76, 28, 12, 52, 94, 36, 18, 44],
} as const

function Wave({ of, className = "" }: { of: keyof typeof WAVES; className?: string }) {
  return (
    <span className={`bp-wave ${className}`}>
      {WAVES[of].map((h, i) => (
        <i key={i} style={{ height: `${h}%` }} />
      ))}
    </span>
  )
}

const SAMPLES = [
  ["Kick_Dusty_03.wav", "kick", "0:01"],
  ["Hat_Tape_11.wav", "hat", "0:01"],
  ["Loop_92bpm_A.wav", "loop", "0:10"],
] as const

export function SamplePackPage() {
  return (
    <div className="bp bp-digital">
      <div className="bp-card bp-split">
        <div className="bp-media bp-gray bp-pack">
          <span className="bp-cover-art">
            <em>Sample pack · Vol. 2</em>
            <b>
              Dust &amp;
              <br />
              Tape
            </b>
            <Wave of="cover" />
            <i>140 drum one-shots and loops</i>
          </span>
          <ul className="bp-samples">
            {SAMPLES.map(([name, wave, len]) => (
              <li key={name}>
                <span className="bp-sample-play">
                  <Play fill="currentColor" strokeWidth={0} />
                </span>
                <b>{name}</b>
                <Wave of={wave} />
                <em>{len}</em>
              </li>
            ))}
          </ul>
        </div>
        <div className="bp-info">
          <Kicker>Digital product</Kicker>
          <h4>Dust &amp; Tape Drums</h4>
          <p className="bp-by">by Ray Okoye</p>
          <p className="bp-price">$24</p>
          <ul className="bp-facts">
            <li>
              <FileAudio /> 140 WAV files, 24-bit
            </li>
            <li>
              <Download /> Download right after paying
            </li>
            <li>
              <Check /> Royalty free in your own tracks
            </li>
          </ul>
          <span className="bp-btn">Buy now</span>
        </div>
      </div>
    </div>
  )
}

/* ================================================================ Course */
const LESSONS = [
  ["1", "Wedging and centering", "8:40", "done"],
  ["2", "Opening and pulling walls", "12:05", "done"],
  ["3", "Trimming a foot", "9:30", "now"],
  ["4", "Glazing your first bowl", "11:15", ""],
] as const

export function CoursePage() {
  return (
    <div className="bp bp-course">
      <div className="bp-card">
        <div className="bp-player">
          <Pic n="cm-wheel" w={1000} h={720} />
          <span className="bp-play">
            <Play fill="currentColor" strokeWidth={0} />
          </span>
          <em>Lesson 1 · 8:40 · Free preview</em>
        </div>
        <div className="bp-course-body">
          <div className="bp-course-head">
            <div>
              <Kicker>Course</Kicker>
              <h4>Wheel throwing, from first centering</h4>
              <p className="bp-by">by Mei Lin · 12 lessons · 2 h 40 min</p>
            </div>
            <span className="bp-course-buy">
              <b>$89</b>
              <span className="bp-btn">Enroll</span>
            </span>
          </div>
          <ol className="bp-lessons">
            {LESSONS.map(([n, t, d, s]) => (
              <li key={n} className={s}>
                <i>{s === "done" ? <Check /> : s === "now" ? <Play fill="currentColor" strokeWidth={0} /> : n}</i>
                <b>{t}</b>
                <em>{d}</em>
                {n !== "1" && s !== "done" && <Lock className="bp-lock" />}
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
  ["Announcements", "Dani posts the week's route"],
  ["Weekend long runs", "38 new posts"],
  ["Race reports", "Brooklyn Half, 14 reports"],
] as const

export function CommunityPage() {
  return (
    <div className="bp bp-community">
      <div className="bp-card">
        <Pic n="mr-race" w={800} h={600} className="bp-cover" />
        <div className="bp-com-body">
          <div className="bp-com-head">
            <div>
              <Kicker>Community</Kicker>
              <h4>Saturday Run Club</h4>
              <p className="bp-by">
                <Users /> 842 members · Free
              </p>
            </div>
            <span className="bp-btn">Join for free</span>
          </div>
          <div className="bp-event">
            <span className="bp-date">
              <i>Sat</i>
              <b>16</b>
            </span>
            <span>
              <b>Long run, 16 km</b>
              <i>
                <MapPin /> Prospect Park, 7:30 am
              </i>
            </span>
            <em>112 going</em>
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

/* ================================================================ Physical product */
const SIZES = ["S", "M", "L", "XL", "XXL"]

export function TeePage() {
  return (
    <div className="bp bp-tee">
      <div className="bp-card bp-split">
        <div className="bp-media bp-gray">
          <Pic n="hp-tee" w={640} h={640} className="bp-tee-pic" />
        </div>
        <div className="bp-info">
          <Kicker>Physical product</Kicker>
          <h4>Pines Tour Tee</h4>
          <p className="bp-by">Hollow Pines</p>
          <p className="bp-price">$32</p>
          <p className="bp-label">Color: Black</p>
          <span className="bp-swatches">
            <i className="on" />
            <i className="sand" />
          </span>
          <p className="bp-label">Size</p>
          <span className="bp-sizes">
            {SIZES.map((s) => (
              <i key={s} className={s === "M" ? "on" : ""}>
                {s}
              </i>
            ))}
          </span>
          <p className="bp-ship">
            <Truck /> Printed and shipped for you in 3 to 5 days
          </p>
          <span className="bp-btn">Add to cart</span>
        </div>
      </div>
    </div>
  )
}

/* ================================================================ Booking */
const DAYS = [
  ["Mon", "17", ""],
  ["Tue", "18", "on"],
  ["Wed", "19", ""],
  ["Thu", "20", ""],
  ["Fri", "21", ""],
  ["Sat", "22", "off"],
  ["Sun", "23", "off"],
] as const
const TIMES = ["9:00", "10:30", "12:00", "15:30", "17:00", "18:30"]

export function BookingPage() {
  return (
    <div className="bp bp-booking">
      <div className="bp-card bp-split">
        <div className="bp-info bp-host">
          <Pic n="av-o" w={160} h={160} className="bp-host-pic" />
          <Kicker>Booking</Kicker>
          <h4>Spanish conversation</h4>
          <p className="bp-by">with Elena Ruiz</p>
          <ul className="bp-facts">
            <li>
              <Clock /> 45 minutes
            </li>
            <li>
              <Video /> Video call, link sent by email
            </li>
            <li>
              <Calendar /> Free to reschedule up to a day before
            </li>
          </ul>
          <p className="bp-price">$35</p>
        </div>
        <div className="bp-cal">
          <p className="bp-month">November</p>
          <span className="bp-days">
            {DAYS.map(([d, n, s]) => (
              <span key={d} className={s}>
                <i>{d}</i>
                <b>{n}</b>
              </span>
            ))}
          </span>
          <p className="bp-label">Tuesday 18 November</p>
          <span className="bp-times">
            {TIMES.map((t) => (
              <i key={t} className={t === "10:30" ? "on" : ""}>
                {t}
              </i>
            ))}
          </span>
          <span className="bp-btn">Book Tue 10:30</span>
        </div>
      </div>
    </div>
  )
}

/* ================================================================ styles */
export const BUSINESS_MOCK_CSS = u(`
.bp{position:absolute;inset:0;padding:30u;background:#eef0f2;color:#18181b;font-family:var(--font-inter,Inter),Inter,system-ui,sans-serif;font-size:14u;line-height:1.4}
.bp svg{width:15u;height:15u;flex:none}
.bp-card{position:relative;height:100%;border-radius:17u;background:#fff;overflow:hidden;box-shadow:0 0 0 1u rgba(16,24,40,.06),0 1u 2u rgba(16,24,40,.04),0 18u 40u -24u rgba(16,24,40,.25)}
.bp-split{display:grid;grid-template-columns:262u 1fr}
.bp-media{position:relative;display:grid;place-items:center;overflow:hidden}
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

/* digital: the sample pack's cover, drawn in type and a waveform, and three of its files */
.bp-pack{display:flex;flex-direction:column;align-items:stretch;justify-content:center;gap:12u;padding:0 16u}
.bp-cover-art{display:flex;flex-direction:column;aspect-ratio:1;padding:16u 16u 14u;border-radius:6u;background:#1b1a18;color:#f1e9d8;box-shadow:0 1u 2u rgba(20,16,10,.2),0 18u 28u -16u rgba(20,16,10,.55)}
.bp-cover-art > em{font-size:8.5u;font-style:normal;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#a79f8f}
.bp-cover-art b{margin-top:8u;font-size:40u;font-weight:700;line-height:.92;letter-spacing:-.045em}
.bp-cover-art > i{font-size:9.5u;font-style:normal;color:#a79f8f}
.bp-wave{display:flex;align-items:center;gap:1.5u}
.bp-wave i{flex:1;min-height:1.5u;border-radius:1u;background:currentColor}
.bp-cover-art .bp-wave{height:38u;margin:auto 0 9u;color:#e2703a}
.bp-samples{display:grid;grid-template-columns:minmax(0,1fr);gap:5u;margin:0;padding:0;list-style:none}
.bp-samples li{display:flex;align-items:center;gap:7u;height:30u;padding:0 9u 0 5u;border-radius:9u;background:#fff;box-shadow:0 0 0 1u rgba(16,24,40,.05)}
.bp-sample-play{display:grid;place-items:center;flex:none;width:20u;height:20u;border-radius:50%;background:#18181b;color:#fff}
.bp-sample-play svg{width:8u!important;height:8u!important;margin-left:1u}
.bp-samples b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10u;font-weight:500;color:#3f3f46}
.bp-samples .bp-wave{flex:none;width:34u;height:16u;color:#a1a1aa}
.bp-samples em{flex:none;font-size:9.5u;font-style:normal;color:#71717a;font-variant-numeric:tabular-nums}

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
.bp-event>span:nth-child(2) i{display:flex;align-items:center;gap:5u;font-size:12.5u;font-style:normal;color:#71717a}
.bp-event svg{width:13u;height:13u}
.bp-event em{font-size:12.5u;font-style:normal;color:#52525b}
.bp-spaces{display:grid;margin:12u 0 0;padding:0;list-style:none}
.bp-spaces li{display:flex;align-items:center;justify-content:space-between;height:38u;border-bottom:1u solid #f4f4f5;font-size:13.5u}
.bp-spaces b{font-weight:500}
.bp-spaces b::before{content:"#";margin-right:7u;color:#a1a1aa;font-weight:400}
.bp-spaces i{font-size:12.5u;font-style:normal;color:#71717a}

/* physical: the tee on a light grey card */
.bp-gray{margin:14u 0 14u 14u;border-radius:13u;background:#ededee}
.bp-tee-pic{width:92%!important;height:auto!important;aspect-ratio:1;mix-blend-mode:multiply;background:none}
.bp-swatches{display:flex;gap:8u;margin-top:7u}
.bp-swatches i{width:24u;height:24u;border-radius:50%;background:#1c1c1e;box-shadow:inset 0 0 0 1u rgba(0,0,0,.1)}
.bp-swatches i.sand{background:#d8cdb8}
.bp-swatches i.on{box-shadow:0 0 0 2u #fff,0 0 0 3.5u #18181b}
.bp-sizes{display:flex;gap:6u;margin-top:7u}
.bp-sizes i{display:grid;place-items:center;min-width:38u;height:32u;padding:0 8u;border-radius:8u;font-size:12.5u;font-style:normal;font-weight:500;box-shadow:inset 0 0 0 1u #e4e4e7}
.bp-sizes i.on{background:#18181b;color:#fff;box-shadow:none}
.bp-ship{display:flex;align-items:center;gap:8u;margin:16u 0 14u!important;font-size:12.5u;color:#52525b}
.bp-tee .bp-price{margin-top:8u!important}
.bp-tee .bp-info{padding-top:24u}

/* booking */
.bp-booking .bp-split{grid-template-columns:250u 1fr}
.bp-host{border-right:1u solid #f0f0f1}
.bp-host-pic{width:52u!important;height:52u!important;border-radius:50%;margin-bottom:14u}
.bp-host .bp-price{margin-top:auto!important}
.bp-cal{display:flex;flex-direction:column;padding:26u 24u 24u}
.bp-month{font-size:15u;font-weight:600}
.bp-days{display:grid;grid-template-columns:repeat(7,1fr);gap:4u;margin-top:10u}
.bp-days>span{display:grid;place-items:center;gap:2u;height:52u;border-radius:10u}
.bp-days i{font-size:10.5u;font-style:normal;color:#71717a}
.bp-days b{font-size:15u;font-weight:600}
.bp-days .on{background:#18181b;color:#fff}
.bp-days .on i{color:#d4d4d8}
.bp-days .off{opacity:.35}
.bp-times{display:grid;grid-template-columns:repeat(3,1fr);gap:8u;margin:8u 0 16u}
.bp-times i{display:grid;place-items:center;height:36u;border-radius:9u;font-size:13u;font-style:normal;font-weight:500;box-shadow:inset 0 0 0 1u #e4e4e7}
.bp-times i.on{box-shadow:inset 0 0 0 2u #18181b}
`)
