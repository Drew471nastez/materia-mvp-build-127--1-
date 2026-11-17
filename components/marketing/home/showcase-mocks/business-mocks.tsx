import { ArrowDownToLine, CalendarDays, Check, CheckCircle2, Heart, MessageCircle, Play, Users, Video } from "lucide-react"
import { useEffect, useRef, type CSSProperties } from "react"
import { Pic, pic, u } from "./frame"

/*
  WHAT A STOREFRONT SELLS, AS SMALL SCENES (landing rounds 8 to 16).
  Each kind of thing sold is one scene on its own calm ground: the thing
  itself, photographed, and the Storelib page that sells it, with one short
  moment playing while it is shown.

    Digital product   A cookbook bought, then opening to its first spread
                      (round 16)
    Physical product  A line of store designs for goods you ship, turning in
                      perspective by itself and under a drag (round 14)
    Course            Mixing in key, Tomás Reyes's course for new DJs (kept)
    Community         Applied AI Club, under its photograph (round 13: the
                      owner disliked the green banner)
    Booking           A 1:1 training plan call with Talia Moreno (kept)

  Round 12, the owner liked the course, the community and the booking, and
  not the digital row of covers ("the high-end Lightroom presets") or the
  physical tee, cap, tote and print. Round 13 replaced round 12's e-book and
  face oil with what the owner named: the mobility course and Ancestral
  Kitchen, and the store designs.

  Round 14 made the digital and physical scenes the two a visitor can use
  (business-carousel.tsx draws them without the picture wrapper, and tells
  them, as `on`, when they are shown and on screen). Round 15 made the
  digital scene a picture again (the owner disliked the shelf), so the line
  of store designs is the one a visitor can use.

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
  Round 16, the owner asked for another picture of a digital product: the
  product page with a buyer's library (round 15) read as two screens of UI.
  It is one thing now, large and calm: Ruth Calder's cookbook, Ancestral
  Kitchen, closed on a linen ground beside its buy card. Buy is pressed, the
  button turns into Download PDF, and the book opens to its first spread: a
  photograph of the soup on the left page, its recipe on the right.

  Chosen over a video course player (the Courses card beside it already is
  one), a sample pack's waveform (a sound drawn as bars is the least real
  looking of the three) and a grid of covers (round 12's row of covers was
  disliked): a book opening is a picture anyone reads at a glance, and it is
  the only scene of the five with a single object at its middle, so it sits
  well beside the course page, the club and the coach.

  The opening is three flat layers, not a 3D scene: the cover turns away on
  its left edge to a quarter turn (edge on, gone), then the left page turns
  in from a quarter turn on the spine, while the book slides from centred
  closed to centred open. Each is a CSS animation on transform and opacity
  with its own perspective(), run once per turn under `.bz-on` and paused
  off screen (business-carousel.tsx). Without motion the scene stands at its
  end: the book open, the PDF paid for.

  Pictures: the cover is cut from the Ancestral Kitchen mockup the page
  already used (public/home/sell-map), the soup is an Unsplash photograph
  (photo-1476718406336), both re-encoded small in public/home/showcase.
*/
export const DIGITAL_BOOK = {
  name: "Ancestral Kitchen",
  kind: "E-book, PDF",
  by: "Ruth Calder",
  price: "$34",
  pages: 212,
  cover: pic("dg-kitchen-cover"),
  photo: pic("dg-kitchen-soup"),
  recipe: "Roasted squash soup",
  chapter: "Soups",
  serves: "Serves 4 · 1 hour",
  about: "80 recipes from whole foods, with a shopping list for every week.",
  ingredients: ["1 butternut squash", "2 shallots", "1 tbsp cumin seeds", "750 ml stock", "Feta and pumpkin seeds"],
  method: "Roast the squash until soft and dark at the edges, about 40 minutes.",
} as const

export function DigitalScene() {
  const b = DIGITAL_BOOK
  return (
    <div className="bs bs-digital">
      <div className="bk">
        <div className="bk-page bk-right">
          <span className="bk-chap">{b.chapter}</span>
          <b className="bk-title">{b.recipe}</b>
          <span className="bk-serves">{b.serves}</span>
          <ul className="bk-ing">
            {b.ingredients.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p className="bk-method">
            <i>1</i>
            {b.method}
          </p>
          <span className="bk-no">15</span>
        </div>
        <div className="bk-page bk-left">
          <Still src={b.photo} w={560} h={720} />
        </div>
        <div className="bk-cover">
          <Still src={b.cover} w={396} h={510} />
        </div>
      </div>
      <div className="bs-card bk-buy">
        <span className="bs-kicker">{b.kind}</span>
        <h4>{b.name}</h4>
        <span className="bs-by">
          by {b.by} · {b.pages} pages
        </span>
        <span className="bs-price">{b.price}</span>
        <span className="bs-desc">{b.about}</span>
        <span className="bk-paid">
          <CheckCircle2 /> Paid, and in your library
        </span>
        <span className="bs-btn bk-btn">
          <span className="a">Buy for {b.price}</span>
          <span className="b">
            <ArrowDownToLine /> Download PDF
          </span>
        </span>
      </div>
    </div>
  )
}

/* ================================================================ Physical product */
/*
  Round 13 made the physical card a line of store designs turning in
  perspective: one in front, the others stacked behind it on each side.
  Round 14, the owner: keep it turning by itself, but let people drag it
  (a mouse or a finger), very smooth, and make it far cheaper to run; and
  the grey behind it was too grey.

  So the line is moved by one position, `q`, and each card's place follows
  from how far it is from the front (`i - q`): the front, two to each side,
  and one hidden far behind, where a card crosses from one side to the
  other unseen. Between places everything is linear, so any position is a
  picture.

    Dragging      pointer events on the stage, `q` follows the finger and
                  the cards are drawn once a frame; the stage takes only
                  sideways drags (touch-action: pan-y), so the page still
                  scrolls under a thumb moving up or down.
    Letting go    the line glides on with the speed it had and stops on a
                  design (never more than two away); a tap on a side card
                  brings that one to the front.
    Turning       when nobody has touched it for a moment, one design every
                  STORE_STEP_S, while its scene is shown and on screen.

  Every glide is one Web Animation per card, keyframed at each place it
  passes, on transform and opacity: it runs on the compositor, nothing
  ticks between glides and nothing at all while the scene is away. The
  cards are flat siblings under one perspective, drawn in an order set
  from their distance to the front (storeLayer), not a 3D scene the
  compositor sorts every frame. The card
  hidden behind is hidden for real (visibility), so five pictures are drawn
  at most, each a 4:5 webp at about its drawn size. With reduced motion the
  line stands still and a drag or a tap moves it without gliding.

  Round 15, the owner: smoother, cleaner and more 3D. The side cards stand
  further back, turn a little more and are drawn a little smaller (a scale on
  top of the depth), under a closer perspective, over a soft floor shadow.
  A step is longer, on an even ease in and out. The drawing order no longer
  changes on a timer beside the glide (a late timer was a card popping over
  another): each card's order is keyframed with its glide, on the same clock,
  so it swaps exactly half way, wherever the glide is. During a drag the
  order and visibility are written only when they change.
*/
export const STORE_DESIGNS = ["sora", "shine", "sunbalm", "lunea", "fusion", "vision"] as const
/** Widths each design is saved at (public/home/showcase/bt-<id>-<w>.webp), 4:5. */
export const STORE_DESIGN_WIDTHS = [380, 560] as const
/** One move of the line: a hold, then the glide to the next place (seconds). */
export const STORE_STEP_S = 2.4
export const STORE_GLIDE_S = 1.1
/** How long the line waits after a drag or a tap before it turns by itself again. */
export const STORE_IDLE_MS = 3200
/* The places, by distance from the front (-3 to 3; -3 and 3 are the same place, far behind, unseen). */
const PLACE_X = [0, -452, -268, 0, 268, 452, 0]
const PLACE_Z = [-820, -500, -240, 0, -240, -500, -820]
const PLACE_R = [0, 38, 28, 0, -28, -38, 0]
const PLACE_S = [0.84, 0.88, 0.94, 1, 0.94, 0.88, 0.84]
const PLACE_O = [0, 0.55, 1, 1, 1, 0.55, 0]
type Scale = { x: number; z: number; w: number }
/** A computer draws the line at a 336u stage; a phone a little smaller and closer together. */
const DESK: Scale = { x: 1, z: 1, w: 336 }
const PHONE: Scale = { x: 0.56, z: 0.7, w: 276 }
const n6 = STORE_DESIGNS.length
/** Distance from the front, wrapped into [-3, 3). */
const wrapK = (k: number) => ((((k + n6 / 2) % n6) + n6) % n6) - n6 / 2
/** A card's place at any distance from the front: x and z in design units, turn in degrees, opacity. */
export function storePlace(k: number) {
  const w = wrapK(k) + 3
  const a = Math.floor(w)
  const b = Math.min(a + 1, 6)
  const f = w - a
  const mix = (t: readonly number[]) => t[a] + (t[b] - t[a]) * f
  return { x: mix(PLACE_X), z: mix(PLACE_Z), r: mix(PLACE_R), s: mix(PLACE_S), o: mix(PLACE_O) }
}
const placeCss = (k: number, s: Scale) => {
  const p = storePlace(k)
  return `transform:translate3d(${+(p.x * s.x).toFixed(1)}u,0,${+(p.z * s.z).toFixed(1)}u) rotateY(${p.r}deg) scale(${p.s});opacity:${p.o}`
}
/** Which card is drawn over which: the nearer the front, the higher (3 in front, 0 far behind); it changes only half way between two places. */
export const storeLayer = (k: number) => 3 - Math.round(Math.abs(wrapK(k)))
/* Each card's resting place before the script takes over (and without it): the line whole, the first design in front. */
const storeLineCss = (s: Scale) =>
  STORE_DESIGNS.map((_, i) => `.bt-card:nth-child(${i + 1}){${placeCss(i, s)};z-index:${storeLayer(i)}${storePlace(i).o ? "" : ";visibility:hidden"}}`).join("")
const STORE_LINE = storeLineCss(DESK)
const STORE_LINE_PHONE = storeLineCss(PHONE)

/* Easing as a curve the script can also read, so a glide can be stopped by a finger exactly where it is. */
const bez = (a: number, b: number) => (s: number) => 3 * a * s * (1 - s) * (1 - s) + 3 * b * s * s * (1 - s) + s * s * s
const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const X = bez(x1, x2)
  const Y = bez(y1, y2)
  return {
    css: `cubic-bezier(${x1},${y1},${x2},${y2})`,
    at: (t: number) => {
      let lo = 0
      let hi = 1
      for (let k = 0; k < 18; k++) {
        const m = (lo + hi) / 2
        if (X(m) < t) lo = m
        else hi = m
      }
      return Y((lo + hi) / 2)
    },
  }
}
type Curve = ReturnType<typeof curve>
/* Round 15: an even ease in and out for a step (no lurch at the start), a long soft settle for a fling. */
const WALK = curve(0.65, 0, 0.35, 1)
const FLING = curve(0.16, 0.84, 0.3, 1)

type StoreLine = { live: (on: boolean) => void; stop: () => void }

/** The line's engine: plain DOM on the stage React drew once (its cards never re-render). */
function storeLine(stage: HTMLElement): StoreLine {
  const cards = Array.from(stage.children) as HTMLElement[]
  const n = cards.length
  const reduce = matchMedia("(prefers-reduced-motion: reduce)")
  const phone = matchMedia("(max-width: 767px)")
  let scale = DESK
  let unit = 1
  let q = 0
  let on = false
  let anims: Animation[] = []
  let glide: { from: number; to: number; start: number; dur: number; ease: Curve } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let raf = 0
  /* What each card was last given, so a drag frame writes only what changed. */
  const shown: { z: number; v: boolean }[] = cards.map(() => ({ z: -1, v: true }))
  let idleUntil = 0
  let drag: { id: number; x0: number; q0: number; moved: boolean; pts: [number, number][] } | null = null

  const now = () => performance.now()
  const measure = () => {
    scale = phone.matches ? PHONE : DESK
    const w = stage.offsetWidth
    if (w > 0) unit = w / scale.w
  }
  const frame = (k: number) => {
    const p = storePlace(k)
    return {
      transform: `translate3d(${(p.x * scale.x * unit).toFixed(2)}px,0,${(p.z * scale.z * unit).toFixed(2)}px) rotateY(${p.r.toFixed(2)}deg) scale(${p.s.toFixed(4)})`,
      opacity: +p.o.toFixed(3),
    }
  }
  const paint = (at: number) => {
    cards.forEach((c, i) => {
      const f = frame(i - at)
      c.style.transform = f.transform
      c.style.opacity = String(f.opacity)
      show(i, f.opacity > 0.001)
    })
    order(at)
  }
  const show = (i: number, v: boolean) => {
    if (shown[i].v === v) return
    shown[i].v = v
    cards[i].style.visibility = v ? "visible" : "hidden"
  }
  /* The cards are flat siblings under the stage's perspective (no preserve-3d: the compositor then draws five plain quads in order, far cheaper than sorting a 3D scene), so their order is set here. */
  const order = (at: number) =>
    cards.forEach((c, i) => {
      const z = storeLayer(i - at)
      if (shown[i].z === z) return
      shown[i].z = z
      c.style.zIndex = String(z)
    })
  /** Where the line is now, mid glide or not. */
  const where = () => (glide ? glide.from + (glide.to - glide.from) * glide.ease.at(Math.min(1, (now() - glide.start) / glide.dur)) : q)
  const halt = () => {
    if (!glide) return
    q = where()
    glide = null
    paint(q)
    anims.forEach((a) => a.cancel())
    anims = []
  }
  /* At rest: the position kept small, and the next turn planned. */
  const settle = () => {
    q = ((q % n) + n) % n
    clearTimeout(timer)
    if (!on || drag || reduce.matches) return
    const hold = (STORE_STEP_S - STORE_GLIDE_S) * 1000
    timer = setTimeout(() => glideTo(Math.round(q) + 1, STORE_GLIDE_S * 1000, WALK), Math.max(hold, idleUntil - now()))
  }
  function glideTo(to: number, dur: number, ease: Curve) {
    halt()
    clearTimeout(timer)
    const from = q
    if (reduce.matches || dur <= 0 || Math.abs(to - from) < 0.001) {
      q = to
      paint(q)
      settle()
      return
    }
    /* A keyframe at every place a card passes, so each glide follows the same path as a drag. */
    const dir = Math.sign(to - from)
    const stops = [from]
    for (let s = dir > 0 ? Math.floor(from) + 1 : Math.ceil(from) - 1; dir > 0 ? s < to : s > to; s += dir) stops.push(s)
    stops.push(to)
    const span = Math.abs(to - from)
    const timing: KeyframeAnimationOptions = { duration: dur, easing: ease.css, fill: "forwards" }
    anims = cards.flatMap((c, i) => {
      const at = (s: number) => Math.abs(s - from) / span
      const frames = stops.map((s) => ({ ...frame(i - s), offset: at(s) }))
      if (frames.some((f) => f.opacity > 0.001)) show(i, true)
      /*
        Two animations on one clock: the move (transform and opacity, on the compositor) and the drawing order. The
        order is keyframed at the places and at every half way point between them, held on each side, so it swaps
        exactly when the card is half way, at the same eased moment as the move, with no timer to run late.
      */
      const zs: Keyframe[] = [{ zIndex: storeLayer(i - stops[0]), offset: 0 }]
      for (let k = 1; k < stops.length; k++) {
        const a = stops[k - 1]
        const b = stops[k]
        const h = Math.floor(Math.min(a, b)) + 0.5
        if (h > Math.min(a, b) && h < Math.max(a, b)) {
          zs.push({ zIndex: storeLayer(i - a), offset: at(h) })
          zs.push({ zIndex: storeLayer(i - b), offset: at(h) })
        }
        zs.push({ zIndex: storeLayer(i - b), offset: at(b) })
      }
      shown[i].z = -1
      return [c.animate(frames, timing), c.animate(zs, timing)]
    })
    const mine = { from, to, start: now(), dur, ease }
    glide = mine
    anims[0].onfinish = () => {
      if (glide !== mine) return
      glide = null
      q = to
      paint(q)
      anims.forEach((a) => a.cancel())
      anims = []
      settle()
    }
  }
  /** Card positions per pixel of drag: one design per side card's distance, a little more. */
  const pitch = () => Math.max(1, 262 * scale.x * unit * 1.15)

  const down = (e: PointerEvent) => {
    if (drag || (e.pointerType === "mouse" && e.button !== 0)) return
    halt()
    clearTimeout(timer)
    drag = { id: e.pointerId, x0: e.clientX, q0: q, moved: false, pts: [[now(), e.clientX]] }
  }
  const move = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return
    const dx = e.clientX - drag.x0
    if (!drag.moved) {
      if (Math.abs(dx) < 6) return
      drag.moved = true
      stage.setPointerCapture?.(e.pointerId)
      stage.setAttribute("data-drag", "")
    }
    drag.pts.push([now(), e.clientX])
    if (drag.pts.length > 6) drag.pts.shift()
    q = drag.q0 - dx / pitch()
    if (!raf)
      raf = requestAnimationFrame(() => {
        raf = 0
        paint(q)
      })
  }
  const up = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return
    const d = drag
    drag = null
    stage.removeAttribute("data-drag")
    cancelAnimationFrame(raf)
    raf = 0
    idleUntil = now() + STORE_IDLE_MS
    const base = Math.round(d.q0)
    if (!d.moved) {
      /* A tap: a side card comes to the front. */
      const i = cards.indexOf((e.target as Element | null)?.closest?.(".bt-card") as HTMLElement)
      const k = i >= 0 ? Math.round(wrapK(i - base)) : 0
      if (k && e.type === "pointerup") glideTo(base + k, 520 + 160 * Math.abs(k), FLING)
      else settle()
      return
    }
    /* Let go: on with the speed it had, to the design nearest where that carries it (at most two away). */
    const [t0, x0] = d.pts[0]
    const [t1, x1] = d.pts[d.pts.length - 1]
    const v = e.type === "pointerup" && now() - t1 < 90 && t1 > t0 ? -(x1 - x0) / (t1 - t0) / pitch() : 0
    let to = Math.round(q + v * 240)
    if (to === base && Math.abs(q - d.q0) > 0.18) to = base + Math.sign(q - d.q0)
    to = Math.max(base - 2, Math.min(base + 2, to))
    glideTo(to, Math.min(760, 320 + 300 * Math.abs(to - q)), FLING)
  }
  const key = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0
    if (!step) return
    e.preventDefault()
    idleUntil = now() + STORE_IDLE_MS
    glideTo(Math.round(where()) + step, 560, FLING)
  }
  const resize = () => {
    measure()
    halt()
    paint(q)
    if (!drag) settle()
  }

  measure()
  paint(q)
  stage.addEventListener("pointerdown", down)
  stage.addEventListener("pointermove", move)
  stage.addEventListener("pointerup", up)
  stage.addEventListener("pointercancel", up)
  stage.addEventListener("keydown", key)
  phone.addEventListener("change", resize)
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null
  ro?.observe(stage)
  return {
    live(v) {
      on = v
      if (!on) clearTimeout(timer)
      else if (!glide && !drag) settle()
    },
    stop() {
      clearTimeout(timer)
      cancelAnimationFrame(raf)
      anims.forEach((a) => a.cancel())
      ro?.disconnect()
      phone.removeEventListener("change", resize)
      stage.removeEventListener("pointerdown", down)
      stage.removeEventListener("pointermove", move)
      stage.removeEventListener("pointerup", up)
      stage.removeEventListener("pointercancel", up)
      stage.removeEventListener("keydown", key)
    },
  }
}

export function PhysicalScene({ on = false }: { on?: boolean }) {
  const stage = useRef<HTMLDivElement>(null)
  const line = useRef<StoreLine | null>(null)
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const l = storeLine(el)
    line.current = l
    return () => {
      l.stop()
      line.current = null
    }
  }, [])
  useEffect(() => {
    line.current?.live(on)
  }, [on])
  return (
    <div className="bs bs-store">
      <div ref={stage} className="bt-stage" tabIndex={0} aria-label="Store designs. Drag them, or use the arrow keys, to see the next one.">
        {STORE_DESIGNS.map((id) => (
          <span key={id} className="bt-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/home/showcase/bt-${id}-${STORE_DESIGN_WIDTHS[0]}.webp`}
              srcSet={STORE_DESIGN_WIDTHS.map((w) => `/home/showcase/bt-${id}-${w}.webp ${w}w`).join(", ")}
              sizes="(max-width: 767px) 66vw, (max-width: 1279px) 27vw, 21vw"
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
.bz-on .bs-card,.bz-on .bs-com,.bz-on .bs-ccard{animation:bz-rise .8s ${E} .1s backwards}
.bz-on .bs-coach-pic,.bz-on .bo-main-pic{animation:bz-push 7s cubic-bezier(.25,.6,.3,1) both}

/* digital (round 16): bought, then the book opens. The book fades in where it stands (its transform is the slide). */
.bz-on .bk{animation:bk-fade .6s ease .1s backwards,bk-slide 1.3s cubic-bezier(.45,0,.2,1) 1.8s both}
.bz-on .bk-btn{animation:bz-press .36s ease 1.1s both}
.bz-on .bk-btn>.a{animation:bz-out .3s ease 1.2s both}
.bz-on .bk-btn>.b{animation:bz-in .4s ${E} 1.35s both}
.bz-on .bk-paid{animation:bz-up-in .5s ${E} 1.5s both}
/* The right page waits under the closed cover, drawn only once the cover lifts: a fade of the whole book is not promised to group its 3D layers, so the page showed through the cover as it faded in. */
.bz-on .bk-right{animation:bk-fade .01s linear 1.8s backwards}
.bz-on .bk-cover{animation:bk-cover .55s cubic-bezier(.55,0,.9,.55) 1.8s both}
.bz-on .bk-left{animation:bk-left .8s cubic-bezier(.1,.45,.25,1) 2.35s both}

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
@keyframes bk-fade{from{opacity:0}}
@keyframes bk-slide{from{transform:translate3d(var(--bk-shift),0,0)}}
@keyframes bk-cover{0%{opacity:1;transform:rotateY(0deg)}99%{opacity:1}100%{opacity:0;transform:rotateY(-90deg)}}
@keyframes bk-left{0%{opacity:0;transform:rotateY(90deg)}1%{opacity:1}100%{opacity:1;transform:rotateY(0deg)}}
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

/*
  digital (round 16): the cookbook and its buy card on a warm linen ground. The book is a box as wide as its open
  spread, with a perspective for its pages: the right page, the left page and the cover are flat siblings (no
  preserve-3d), drawn in their order, each turned on its own hinge (the cover on its left edge, the left page on the
  spine). At rest the book is open and the cover turned away; the moment (MOTION) starts it closed and centred.
*/
.bs-digital{background:#eee9e1}
.bk{--bk-shift:-140u;position:absolute;left:84u;top:104u;width:560u;height:362u;perspective:1600u}
.bk-page{position:absolute;top:0;bottom:0;width:50%;background:#fbf8f3;box-shadow:0 0 0 1u rgba(60,45,30,.06),0 26u 44u -26u rgba(60,45,30,.4)}
.bk-right{right:0;display:flex;flex-direction:column;padding:34u 30u 0 34u;border-radius:0 4u 4u 0;background:linear-gradient(to right,rgba(60,45,30,.1),rgba(60,45,30,0) 9%),#fbf8f3;color:#2b2420}
.bk-left{left:0;overflow:hidden;border-radius:4u 0 0 4u;transform-origin:100% 50%}
.bk-left::after{content:"";position:absolute;inset:0;background:linear-gradient(to left,rgba(40,30,20,.2),rgba(40,30,20,0) 10%);pointer-events:none}
.bk-cover{position:absolute;right:0;top:0;bottom:0;width:50%;overflow:hidden;border-radius:2u 6u 6u 2u;transform-origin:0 50%;transform:rotateY(-90deg);opacity:0;box-shadow:0 0 0 1u rgba(60,45,30,.08),0 26u 44u -24u rgba(60,45,30,.45)}
.bk-chap{font-size:9.5u;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#9a6b3f}
.bk-title{margin-top:8u;font-family:Georgia,"Times New Roman",serif;font-size:24u;font-weight:400;line-height:1.1;letter-spacing:-.01em}
.bk-serves{margin-top:8u;font-size:10.5u;color:#857a70}
.bk-ing{margin:16u 0 0;padding:0;list-style:none;border-top:1u solid #ebe4da}
.bk-ing li{padding:6u 0;border-bottom:1u solid #ebe4da;font-size:11u;line-height:1.3;color:#4a403a}
.bk-method{display:flex;gap:8u;margin:14u 0 0;font-size:11u;line-height:1.5;color:#4a403a}
.bk-method i{flex:none;font-family:Georgia,serif;font-size:15u;font-style:normal;line-height:1.1;color:#9a6b3f}
.bk-no{position:absolute;left:0;right:0;bottom:14u;font-size:9.5u;text-align:center;color:#a39a91}
.bk-buy{left:704u;top:104u;width:320u;height:362u}
.bk-buy .bs-by{margin-top:6u!important}
.bk-btn{display:grid;overflow:hidden}
.bk-btn>span{grid-area:1/1;display:flex;align-items:center;gap:8u}
.bk-btn>.a{opacity:0}
.bk-paid{display:flex;align-items:center;gap:7u;margin:auto 0 12u;font-size:13u;font-weight:500;color:#3f3f46}
.bk-paid svg{width:16u;height:16u;color:#16a34a}
.bk-paid+.bk-btn{margin-top:0}

/* physical (round 14): store designs for goods you ship, a line turning in perspective in clean light (round 13's flat grey was too grey). The stage gives the perspective and takes the drag; the cards are flat siblings in the order the script sets (round 14: preserve-3d made the compositor sort a 3D scene every frame; without it a turn drops a quarter as many frames at 1920), each one flat picture with its corners and shadow drawn once. */
.bs-store{background:radial-gradient(70% 80% at 50% 46%,#fff 0%,#f7f9fb 46%,#e9eef4 100%)}
.bt-stage{position:absolute;left:50%;top:50%;width:336u;height:420u;margin:-212u 0 0 -168u;perspective:1200u;perspective-origin:50% 42%;pointer-events:auto;touch-action:pan-y;cursor:grab;outline:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
.bt-stage[data-drag]{cursor:grabbing}
/* Round 15: a soft floor under the line, drawn once, so the cards stand in a room rather than float. */
.bt-stage::before{content:"";position:absolute;left:-18%;right:-18%;bottom:-34u;height:60u;border-radius:50%;background:radial-gradient(closest-side,rgba(16,24,40,.16),rgba(16,24,40,0));pointer-events:none}
.bt-stage:focus-visible::after{content:"";position:absolute;inset:-10u;border-radius:20u;box-shadow:0 0 0 2u #18181b}
.bt-card{position:absolute;inset:0;border-radius:14u;overflow:hidden;background:#fff;box-shadow:0 0 0 1u rgba(16,24,40,.06),0 2u 4u rgba(16,24,40,.05),0 22u 40u -22u rgba(16,24,40,.38)}
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

  .bk{--bk-shift:-79u;left:22u;top:22u;width:316u;height:204u;perspective:900u}
  .bk-right{padding:16u 12u 0 16u}
  .bk-chap{font-size:6.5u}
  .bk-title{margin-top:4u;font-size:13u}
  .bk-serves{margin-top:4u;font-size:7u}
  .bk-ing{margin-top:8u}
  .bk-ing li{padding:3u 0;font-size:7u}
  .bk-method{display:none}
  .bk-no{bottom:7u;font-size:6.5u}
  .bk-buy{left:14u;right:14u;top:250u;bottom:14u;width:auto;height:auto}
  .bk-paid{font-size:12.5u}

  .bt-stage{width:276u;height:345u;margin:-172u 0 0 -138u;perspective:950u}
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

  .bs-com{left:12u;right:12u;top:12u;bottom:auto;width:auto;height:326u}
  .bs-com-cover{height:104u}
  .bs-com-logo{left:16u;top:14u;gap:8u}
  .bs-com-logo svg{width:24u;height:24u}
  .bs-com-logo b{font-size:13u}
  .bs-com-word{left:16u;bottom:12u;gap:3u}
  .bs-com-word b{font-size:20u}
  .bs-com-word i{font-size:11.5u}
  .bs-com-host{right:14u;top:15u}
  .bs-com-host .smk-pic{width:24u;height:24u}
  .bs-com-host em{display:none}
  .bs-com-body{padding:14u 16u 0}
  .bs-com-head{display:grid;gap:10u;align-items:start}
  .bs-com-head h4{font-size:20u}
  .bs-com-head .bs-btn{height:40u}
  .bs-event{margin-top:12u;padding:8u 10u}
  .bs-date{width:40u;height:42u}
  .bs-event em,.bs-spaces{display:none}
  .bs-feed{left:12u;right:12u;top:350u;gap:10u}
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
