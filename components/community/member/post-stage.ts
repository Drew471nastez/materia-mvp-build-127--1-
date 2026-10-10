"use client"

/**
 * ===========================================================================
 *  THE OPENED POST'S MOVES, DRAWN ON THE COMPOSITOR (round 17)
 * ===========================================================================
 * post-morph.ts holds the numbers and the rules; this puts them on the
 * screen. Every move here is a set of Web Animations started together, on
 * `translate`, `scale` and `opacity` only, so once started the compositor
 * runs them to the end whatever the main thread is doing. JavaScript sets
 * values only while a finger has the post; the moment it lets go, the rest
 * is one more set of animations.
 *
 * THE PARTS (post-fullscreen.tsx draws them, outermost first):
 *
 *   layer      the fixed layer over the community; hidden on the frame
 *              after a close lands
 *   scrim      a light dim over the community (the community itself never
 *              moves, scales or blurs)
 *   lift       what a finger moves (a pull down, the app's edge swipe), and
 *              what the sheet, push and fade styles move
 *   clips      the container's four clip layers (post-morph.ts says why
 *              four); they clip only while something moves
 *   cloneHost  where the copy of the card is put for a container move
 *   page       the opened post itself, which fades through
 *
 * `will-change` is on the moving parts only while they move, and comes off
 * when they stop.
 */
import { CLIPS, CLIP_CORNER, EASE, FADE_SPLIT, GONE, PREPARE_CAP_MS, SCRIM, SPRING_BACK_MS, awayFor, clipOffsets, fadeInKeyframes, fadeOutKeyframes, followFor, riseInKeyframes, riseOutKeyframes, msFor, screenRect, scrimFor, styleFor, type PostMotionStyle, type Rect, type Screen } from "./post-morph"

export interface PostStageParts {
  layer: HTMLElement
  scrim: HTMLElement
  lift: HTMLElement
  /** The four clips, outermost first (post-morph.ts CLIPS). */
  clips: HTMLElement[]
  cloneHost: HTMLElement
  page: HTMLElement
}

export interface PostStage {
  /** In: from the card (container) or from the style's own place, over msFor(style). Resolves once it has arrived. `prepare` is waited for first, at most PREPARE_CAP_MS. */
  open(o: { style: PostMotionStyle; origin: HTMLElement | null; reduced: boolean; prepare?: () => Promise<unknown> }): Promise<void>
  /** Out: into the card (container) or to the style's own place, from wherever a finger left it. Resolves on the frame after it lands, with the layer hidden. */
  close(o: { style: PostMotionStyle; origin: HTMLElement | null; reduced: boolean }): Promise<void>
  /** A finger has it: `dx` across, `offset` down. */
  follow(dx: number, offset: number): void
  /** Let go short of closing: back to rest. */
  springBack(): Promise<void>
  /** Every move stopped where it is (a finger caught it), its place kept. */
  stop(): void
  /** Whether something is moving now. */
  moving(): boolean
}

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))

/*
  READY, THEN DRAWN, THEN MOVED. What `prepare` waits for (the comments' data) resolves in a microtask, and the render it
  causes is React's next task: started on that microtask, the move would carry that render (about 100ms at 4x CPU) in its
  first frames. So once ready (or at the cap), a task goes by for that render, then a frame for its paint, and only then the
  move starts.
*/
async function readyThenDrawn(ready: Promise<unknown>, cap: number): Promise<void> {
  await Promise.race([ready, sleep(cap)])
  await sleep(0)
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
}

/** A box as a plain rectangle. */
function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

/**
 * A COPY OF THE CARD, DRAWN THE SAME (the close lands on it). Its own box, its inherited type, its scroll positions (a row
 * of pictures scrolled along stays where it was), never a second element the page can find as the post (no data-post, no
 * ids, inert, hidden from a screen reader).
 */
export function cloneCard(card: HTMLElement, r: Rect): HTMLElement {
  const c = card.cloneNode(true) as HTMLElement
  c.removeAttribute("data-post")
  c.removeAttribute("id")
  c.setAttribute("data-post-clone", "")
  c.setAttribute("aria-hidden", "true")
  c.inert = true
  for (const el of Array.from(c.querySelectorAll("[id], [data-post]"))) {
    el.removeAttribute("id")
    el.removeAttribute("data-post")
  }
  for (const v of Array.from(c.querySelectorAll("video"))) {
    v.removeAttribute("autoplay")
    v.muted = true
  }
  const cs = getComputedStyle(card)
  const st = c.style
  st.position = "absolute"
  st.left = "0px"
  st.top = "0px"
  st.width = `${r.width}px`
  st.height = `${r.height}px`
  st.margin = "0px"
  st.boxSizing = "border-box"
  st.pointerEvents = "none"
  st.translate = "none"
  st.scale = "none"
  st.fontFamily = cs.fontFamily
  st.fontSize = cs.fontSize
  st.lineHeight = cs.lineHeight
  st.color = cs.color
  st.letterSpacing = cs.letterSpacing
  return c
}

/** Put a copy's scroll positions back to the card's (only once the copy is in the page: a box with no layout has no scroll). */
function copyScroll(from: HTMLElement, to: HTMLElement) {
  const a = from.querySelectorAll<HTMLElement>("*")
  const b = to.querySelectorAll<HTMLElement>("*")
  if (a.length !== b.length) return
  for (let i = 0; i < a.length; i++) {
    if (a[i].scrollLeft) b[i].scrollLeft = a[i].scrollLeft
    if (a[i].scrollTop) b[i].scrollTop = a[i].scrollTop
  }
}

/** Every picture in a box decoded (or given up on), for at most `cap` ms. */
export async function decodeIn(boxes: (Element | null)[], cap = PREPARE_CAP_MS): Promise<void> {
  const imgs = boxes.flatMap((b) => (b ? Array.from(b.querySelectorAll("img")) : [])).slice(0, 8)
  const all = Promise.all(imgs.map((i) => (typeof i.decode === "function" ? i.decode().catch(() => undefined) : undefined)))
  await Promise.race([all, sleep(cap)])
}

export function postStage(parts: PostStageParts): PostStage {
  const { layer, scrim, lift, clips, cloneHost, page } = parts
  let live: Animation[] = []
  let clone: HTMLElement | null = null
  /* The scrim at rest for the style the post opened with (none for the quiet ones). */
  let restScrim = 0
  const screen = (): Screen => ({ width: layer.clientWidth || window.innerWidth, height: layer.clientHeight || window.innerHeight })
  const movers = () => [lift, scrim, page, ...clips, ...(clone ? [clone] : [])]

  /* While anything moves: the clips clip, the moving parts are their own layers. Off again the moment it stops. */
  const setMoving = (on: boolean, radius = 0, morph = false) => {
    layer.toggleAttribute("data-moving", on)
    /* The container's white is the container move's alone: for any other style it would be a white screen under the post. */
    layer.toggleAttribute("data-morph", on && morph)
    for (const el of movers()) el.style.willChange = on ? (el === scrim || el === page || el === clone ? "opacity" : "translate, scale") : ""
    clips.forEach((el, i) => {
      el.style[CLIP_CORNER[CLIPS[i]]] = on && radius ? `${radius}px` : ""
    })
  }
  const clearClone = () => {
    clone?.remove()
    clone = null
  }
  /* Rest: nothing of ours left on any part (the page is exactly where its own layout puts it). */
  const toRest = () => {
    for (const a of live) a.cancel()
    live = []
    for (const el of [lift, ...clips]) {
      el.style.translate = ""
      el.style.scale = ""
    }
    lift.style.opacity = ""
    page.style.opacity = ""
    scrim.style.opacity = String(restScrim)
    clearClone()
    setMoving(false)
  }
  const run = (el: HTMLElement, frames: Keyframe[], ms: number, easing: string) => {
    const a = el.animate(frames, { duration: ms, easing, fill: "forwards" })
    live.push(a)
    return a
  }
  /* Every animation of the move, started in one go and finished together. */
  const finished = (ms: number) =>
    new Promise<void>((done) => {
      let over = false
      const end = () => {
        if (over) return
        over = true
        done()
      }
      const first = live[0]
      if (first) first.finished.then(end, end)
      /* A page in the background draws no frames: it still arrives. */
      window.setTimeout(end, ms + 250)
    })
  const clipFrames = (from: Rect, to: Rect, s: Screen) => {
    const a = clipOffsets(from, s)
    const b = clipOffsets(to, s)
    return CLIPS.map((name) => [{ translate: `${a[name].x}px ${a[name].y}px` }, { translate: `${b[name].x}px ${b[name].y}px` }])
  }
  const stop = () => {
    if (!live.length) return
    for (const a of live) {
      try {
        a.commitStyles()
      } catch {
        /* A part that left the page has nothing to keep. */
      }
      a.cancel()
    }
    live = []
  }

  return {
    async open({ style: chosen, origin, reduced, prepare }) {
      stop()
      const s = screen()
      const from = origin ? rectOf(origin) : null
      const style = styleFor(chosen, from, s, reduced)
      const ms = msFor(style, "open")
      restScrim = scrimFor(style)
      /*
        PREPARED BEFORE IT MOVES, unseen: while the post is laid out and its pictures decoded the whole layer is at GONE (not
        hidden: a hidden layer is neither painted nor rastered, and that work then lands in the move's first frames).
      */
      layer.style.opacity = String(GONE)
      if (style === "container" && origin && from) {
        clone = cloneCard(origin, from)
        cloneHost.appendChild(clone)
        copyScroll(origin, clone)
        const radius = parseFloat(getComputedStyle(origin).borderTopLeftRadius) || 0
        setMoving(true, radius, true)
        const frames = clipFrames(from, screenRect(s), s)
        page.style.opacity = String(GONE)
        scrim.style.opacity = "0"
        /*
          The clips stay open while it is prepared, so every tile of the post is rastered now: cut to the card's rectangle, only
          that part was, and the rest had to be rastered as the container uncovered it (the move stopped for it).
        */
        await readyThenDrawn(Promise.all([prepare?.(), decodeIn([clone, page])]), PREPARE_CAP_MS)
        clips.forEach((el, i) => (el.style.translate = String(frames[i][0].translate)))
        layer.style.opacity = ""
        clips.forEach((el, i) => run(el, frames[i], ms, EASE))
        run(page, fadeInKeyframes(), ms, "linear")
        run(clone, fadeOutKeyframes(), ms, "linear")
        run(scrim, [{ opacity: 0 }, { opacity: restScrim }], ms, EASE)
        await finished(ms)
        toRest()
        return
      }
      /* The rise, the sheet, the push, the fade, and reduced motion: the whole layer moves (or only fades). */
      const away = awayFor(style, s)
      const dur = ms
      setMoving(true)
      /*
        The lift moves (translate only); the PAGE fades, as in the container: an opacity on the lift is an opacity over every
        layer inside it at once (the scroller, the sticky comment box, the top), and measured that way the move stopped for
        up to 105ms at 4x CPU where the page's own fade never did.
      */
      lift.style.translate = away.translate
      page.style.opacity = String(away.opacity)
      scrim.style.opacity = "0"
      await readyThenDrawn(Promise.all([prepare?.(), decodeIn([page])]), PREPARE_CAP_MS)
      layer.style.opacity = ""
      run(lift, [{ translate: away.translate }, { translate: "0px 0px" }], dur, style === "reduced" ? "linear" : EASE)
      if (away.opacity < 1) run(page, style === "rise" ? riseInKeyframes() : [{ opacity: away.opacity }, { opacity: 1 }], dur, style === "rise" ? "linear" : style === "reduced" ? "linear" : EASE)
      if (restScrim > 0) run(scrim, [{ opacity: 0 }, { opacity: restScrim }], dur, EASE)
      await finished(dur)
      toRest()
    },

    async close({ style: chosen, origin, reduced }) {
      stop()
      const s = screen()
      const to = origin ? rectOf(origin) : null
      const style = styleFor(chosen, to, s, reduced)
      const ms = msFor(style, "close")
      /* Where a finger left it (or rest). */
      const liftFrom = { translate: lift.style.translate || "0px 0px", scale: lift.style.scale || "1", opacity: lift.style.opacity || "1" }
      const scrimFrom = Number(getComputedStyle(scrim).opacity)
      if (style === "container" && origin && to) {
        clone = cloneCard(origin, to)
        clone.style.opacity = String(GONE)
        cloneHost.appendChild(clone)
        copyScroll(origin, clone)
        const radius = parseFloat(getComputedStyle(origin).borderTopLeftRadius) || 0
        setMoving(true, radius, true)
        const frames = clipFrames(screenRect(s), to, s)
        clips.forEach((el, i) => run(el, frames[i], ms, EASE))
        run(lift, [liftFrom, { translate: "0px 0px", scale: "1", opacity: 1 }], ms, EASE)
        run(page, fadeOutKeyframes(), ms, "linear")
        run(clone, fadeInKeyframes(), ms, "linear")
        run(scrim, [{ opacity: scrimFrom }, { opacity: 0 }], ms, EASE)
        await finished(ms)
        /* LANDED: the copy is exactly on the card. Hidden on the next frame, so the real card is what shows; nothing moves after. */
        layer.style.visibility = "hidden"
        /* Nothing moves any more (a kept sheet's idle build waits on this mark: components/ui/bottom-sheet.tsx). */
        layer.removeAttribute("data-moving")
        return
      }
      const away = awayFor(style, s)
      const dur = ms
      setMoving(true)
      /* From a finger (the post shrunk and moved): on from there, the same short way further, never back up to full size. */
      const pulled = liftFrom.scale !== "1" || liftFrom.translate !== "0px 0px"
      const [fx, fy] = liftFrom.translate.split(" ").map((v) => parseFloat(v) || 0)
      const [ax, ay] = away.translate.split(" ").map((v) => parseFloat(v) || 0)
      const target = pulled && style !== "sheet" && style !== "push" ? { translate: `${fx + ax}px ${fy + ay}px`, scale: liftFrom.scale } : { translate: away.translate, scale: "1" }
      run(lift, [{ translate: liftFrom.translate, scale: liftFrom.scale }, target], dur, style === "reduced" ? "linear" : EASE)
      if (away.opacity < 1) run(page, style === "rise" ? riseOutKeyframes() : [{ opacity: 1 }, { opacity: away.opacity }], dur, style === "rise" ? "linear" : style === "reduced" ? "linear" : EASE)
      if (scrimFrom > 0) run(scrim, [{ opacity: scrimFrom }, { opacity: 0 }], dur, EASE)
      await finished(dur)
      layer.style.visibility = "hidden"
      layer.removeAttribute("data-moving")
    },

    follow(dx, offset) {
      if (live.length) stop()
      if (!layer.hasAttribute("data-moving")) setMoving(true, 16)
      const f = followFor(dx, offset, screen())
      lift.style.translate = f.translate
      lift.style.scale = String(f.scale)
      /* The scrim lifts from where it rests for this style (none for the quiet ones). */
      scrim.style.opacity = String(restScrim * (f.scrim / SCRIM))
    },

    async springBack() {
      const from = { translate: lift.style.translate || "0px 0px", scale: lift.style.scale || "1" }
      const scrimFrom = Number(getComputedStyle(scrim).opacity)
      stop()
      run(lift, [from, { translate: "0px 0px", scale: "1" }], SPRING_BACK_MS, EASE)
      if (scrimFrom > 0 || restScrim > 0) run(scrim, [{ opacity: scrimFrom }, { opacity: restScrim }], SPRING_BACK_MS, EASE)
      await finished(SPRING_BACK_MS)
      toRest()
    },

    stop,
    moving: () => live.length > 0 || layer.hasAttribute("data-moving"),
  }
}

/** The fade's split, for a caller that has to know when the outgoing content has gone. */
export { FADE_SPLIT }
