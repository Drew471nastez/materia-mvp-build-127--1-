/**
 * ===========================================================================
 *  SCROLLING TO A SECTION, AND SECTIONS ARRIVING, ON THE PAGE ITSELF
 * ===========================================================================
 * The DOM half of lib/website-builder/section-anchors.ts. One file for the
 * published page and the builder's canvas, so the two scroll on the same
 * curve, land on the same pixel and reveal the same sections.
 *
 * WHERE IT LANDS. A section lands with its top at the bottom of the sticky
 * header, measured when the scroll starts and again on its last frame, never
 * a number written down somewhere. A header that hides while the page goes
 * down and comes back on the way up (Header › Show on scroll up) is out of
 * the way at the end of a downward scroll, so it is not counted then. The
 * same number is written to `--sl-anchor-offset` on the page root, which the
 * theme's `scroll-margin-top` reads, so a jump the browser makes on its own
 * (a hash typed into the address bar, focus moving to a section) lands in
 * the same place.
 *
 * HOW IT MOVES. One requestAnimationFrame loop writes the scroll position
 * and nothing else. The target's place is read from offsetTop, which a
 * transform does not move, so a section fading up as the page arrives at it
 * cannot drag the scroll with it. Native `scroll-behavior: smooth` was the
 * alternative: it has no say over the curve or the offset, iOS before 15.4
 * ignores it, and WKWebView's own scroll view eases differently from every
 * other browser. A wheel, a touch or a key stops the scroll where it is, so
 * nobody fights it. Somebody who asked their device for less motion gets
 * the same landing with no travel.
 *
 * HOW SECTIONS ARRIVE. Only once JavaScript is running is anything hidden,
 * and then only sections wholly below the screen: what is on screen when
 * the page appears stays exactly as it was painted. Each hidden section
 * fades (and rises, or grows) when it scrolls into view, once, with the Web
 * Animations API on opacity and transforms only, so nothing is laid out
 * again and there is no shift. If anything here fails, every section is
 * simply there.
 *
 * THE BUILDER'S CANVAS PLAYS IT TOO, EDITS AND ALL. A section box is dealt
 * with once, the first time it is looked at: one on screen or above then is
 * left as painted for good, one below waits for its scroll. Looking again
 * after an edit only deals with boxes it has not seen (a section added,
 * shown again, or drawn anew), so nothing on screen ever hides and plays
 * again under a keystroke, and the canvas still arrives at the sections
 * below it as the website does.
 */
import { THEME_ROOT_ATTRIBUTE } from "./theme-css"
import {
  REVEAL_EASING,
  REVEAL_FROM,
  declaresOwnMotion,
  easeInOutCubic,
  normalizePath,
  resolveSectionHash,
  revealPlan,
  revealTiming,
  scrollDurationMs,
  type AnchorCandidate,
  type SectionAnimation,
} from "./section-anchors"

const BOX = "[data-section-box]"

/** The page root an element is drawn in, or the only one in the document. */
export function themeRootOf(el?: Element | null): HTMLElement | null {
  const own = el?.closest?.(`[${THEME_ROOT_ATTRIBUTE}]`) as HTMLElement | null | undefined
  if (own) return own
  if (typeof document === "undefined") return null
  return document.querySelector<HTMLElement>(`[${THEME_ROOT_ATTRIBUTE}]`)
}

/**
 * What scrolls the page: the builder's canvas card, or the window (null).
 * The nearest ancestor that is a scroll container with room to scroll.
 */
export function scrollerOf(root: Element): HTMLElement | null {
  let el = root.parentElement
  while (el && el !== document.body && el !== document.documentElement) {
    const oy = getComputedStyle(el).overflowY
    /* The builder's canvas is the scroller even before its page is tall enough to scroll. */
    if ((oy === "auto" || oy === "scroll") && (el.scrollHeight > el.clientHeight + 1 || el.id === "wb-preview-root")) return el
    el = el.parentElement
  }
  return null
}

/**
 * The site's header: the chrome section drawn straight into the page root,
 * or (round Q) a header of the site's own that asks to stay on screen with
 * data-storelib-sticky: its box in the page root is what sticks (theme-css.ts),
 * and the element that asked is what is measured.
 */
export function headerOf(root: Element): HTMLElement | null {
  const builtIn = root.querySelector<HTMLElement>(":scope > [data-section][data-chrome]")
  if (builtIn) return builtIn
  return root.querySelector<HTMLElement>(':scope > [data-section-box][data-chrome] [data-storelib-sticky="always"], :scope > [data-section-box][data-chrome] [data-storelib-sticky="up"]')
}

/**
 * How far below the top of the scroller a section should land: the bottom
 * of a header that stays on screen. `direction` is where the scroll is
 * going, +1 down, -1 up, 0 unknown.
 */
export function anchorOffset(root: Element, direction = 0): number {
  const header = headerOf(root)
  if (!header) return 0
  /* A header of the site's own: its box sticks, it is as tall as itself, and "up" is gone by the end of a scroll down. */
  const own = header.getAttribute("data-storelib-sticky")
  if (own) {
    const box = header.closest<HTMLElement>("[data-section-box]")
    const pos = box ? getComputedStyle(box).position : ""
    if (pos !== "sticky" && pos !== "fixed") return 0
    if (direction > 0 && own === "up") return 0
    return Math.max(0, Math.round(header.offsetHeight))
  }
  const cs = getComputedStyle(header)
  if (cs.position !== "sticky" && cs.position !== "fixed") return 0
  /* Show on scroll up: gone by the end of a scroll down. The header says
     which mode it is in with `data-sticky` (HeaderSection); `will-change:
     transform`, which it carries only in that mode, is the older sign. */
  const mode = header.getAttribute("data-sticky")
  if (direction > 0 && (mode === "scroll-up" || (!mode && /transform/.test(cs.willChange)))) return 0
  const top = parseFloat(cs.top)
  return Math.max(0, Math.round(header.offsetHeight + (Number.isFinite(top) ? top : 0)))
}

/** Written once per change, read by the theme's `scroll-margin-top`. */
export function publishAnchorOffset(root: HTMLElement): number {
  const px = anchorOffset(root, 0)
  const value = `${px}px`
  if (root.style.getPropertyValue("--sl-anchor-offset") !== value) root.style.setProperty("--sl-anchor-offset", value)
  return px
}

function boxesOf(root: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(`:scope > ${BOX}`))
}

function headingText(box: Element): string {
  return (box.querySelector("h1, h2, h3")?.textContent ?? "").replace(/\s+/g, " ").trim()
}

function candidatesIn(root: Element): { box: HTMLElement; c: AnchorCandidate }[] {
  return boxesOf(root)
    .filter((b) => !b.hasAttribute("data-chrome") && b.dataset.sectionKey)
    .map((box) => ({
      box,
      c: {
        id: box.dataset.sectionKey as string,
        type: box.dataset.sectionType ?? "",
        heading: headingText(box),
        anchor: box.dataset.anchorAlias ?? null,
      },
    }))
}

function decode(hash: string): string {
  const raw = hash.replace(/^#/, "")
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/**
 * The element a `#hash` lands on, inside this page root. Our own anchor
 * first, then any element with that id (a section's own markup can name
 * one), then the rules in resolveSectionHash.
 */
export function findSectionTarget(root: HTMLElement, hash: string): HTMLElement | null {
  const h = decode(hash).trim()
  if (!h) return null
  const esc = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(h) : h.replace(/["\\]/g, "\\$&")
  const byAnchor = root.querySelector<HTMLElement>(`${BOX}[data-anchor="${esc}"]`)
  if (byAnchor) return byAnchor
  const byId = document.getElementById(h)
  if (byId && root.contains(byId)) return byId
  const list = candidatesIn(root)
  const id = resolveSectionHash(h, list.map((x) => x.c))
  if (id) return list.find((x) => x.c.id === id)?.box ?? null
  if (h.toLowerCase() === "top") return root
  return null
}

// ── The scroll ──────────────────────────────────────────────────────────────

type Scroller = HTMLElement | null

function readScroll(sc: Scroller): number {
  return sc ? sc.scrollTop : window.scrollY
}

function writeScroll(sc: Scroller, y: number): void {
  if (sc) sc.scrollTop = y
  /* The two-number form: every browser has it, and it follows `scroll-behavior`, which is set to auto for as long as anything here scrolls. */
  else window.scrollTo(window.scrollX, y)
}

function maxScroll(sc: Scroller): number {
  if (sc) return Math.max(0, sc.scrollHeight - sc.clientHeight)
  const doc = document.scrollingElement ?? document.documentElement
  return Math.max(0, doc.scrollHeight - window.innerHeight)
}

/**
 * Where `el`'s top is in the scroller's content, untouched by transforms:
 * offsetTop up the offsetParent chain. A chain that leaves the scroller
 * without passing through it falls back to the drawn position.
 */
export function contentTop(el: HTMLElement, sc: Scroller): number {
  let y = 0
  let node: HTMLElement | null = el
  while (node) {
    y += node.offsetTop
    const parent = node.offsetParent as HTMLElement | null
    if (sc) {
      if (parent === sc) return y
      if (!parent || !sc.contains(parent)) break
    }
    node = parent
  }
  if (!sc) return y
  return sc.scrollTop + el.getBoundingClientRect().top - sc.getBoundingClientRect().top - sc.clientTop
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

interface Run {
  target: Element
  at: number
  cancel: () => void
  done: Promise<void>
}

/** One scroll per scroller. A second ask for the same place within a moment is the same scroll. */
const RUNS = new WeakMap<object, Run>()
const SAME_ASK_MS = 300
const STOPPERS = ["wheel", "touchstart", "keydown", "pointerdown"] as const

export interface ScrollOptions {
  root: HTMLElement
  scroller?: Scroller
  /** Overrides the visitor's motion setting, for a check script. */
  reduced?: boolean
}

/**
 * Scroll so `target`'s top sits at the bottom of the sticky header. Resolves
 * when it has landed, or was stopped by the person scrolling.
 */
export function scrollToElement(target: HTMLElement, opts: ScrollOptions): Promise<void> {
  const { root } = opts
  const sc = opts.scroller === undefined ? scrollerOf(root) : opts.scroller
  const key: object = sc ?? window
  const now = performance.now()
  const prev = RUNS.get(key)
  if (prev && prev.target === target && now - prev.at < SAME_ASK_MS) return prev.done
  prev?.cancel()

  const start = readScroll(sc)
  const firstDest = Math.min(maxScroll(sc), Math.max(0, contentTop(target, sc) - anchorOffset(root, 0)))
  const direction = Math.sign(firstDest - start)
  const offset = anchorOffset(root, direction)
  const destination = () => Math.min(maxScroll(sc), Math.max(0, contentTop(target, sc) - offset))
  const reduced = opts.reduced ?? prefersReducedMotion()
  const distance = destination() - start
  const duration = reduced ? 0 : scrollDurationMs(distance)

  /* A stylesheet's `scroll-behavior: smooth` would turn every frame's write
     into a scroll of its own. Off for the length of this one. */
  const styled = sc ?? document.documentElement
  const prevBehavior = styled.style.scrollBehavior
  styled.style.scrollBehavior = "auto"

  let frame = 0
  let stopped = false
  let resolve!: () => void
  const done = new Promise<void>((r) => { resolve = r })
  const finish = () => {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(frame)
    STOPPERS.forEach((t) => window.removeEventListener(t, stop, true))
    styled.style.scrollBehavior = prevBehavior
    if (RUNS.get(key) === run) RUNS.delete(key)
    resolve()
  }
  const stop = (e: Event) => {
    /* The press that started this scroll is over by now; a key that is not
       for scrolling is not a reason to stop. */
    if (e.type === "keydown" && !/^(Arrow|Page|Home|End|Space| )/.test((e as KeyboardEvent).key)) return
    finish()
  }
  const run: Run = { target, at: now, cancel: finish, done }
  RUNS.set(key, run)

  if (duration === 0) {
    writeScroll(sc, destination())
    requestAnimationFrame(() => {
      /* Something above may have finished loading in between. */
      const d = destination()
      if (Math.abs(readScroll(sc) - d) > 1) writeScroll(sc, d)
      finish()
    })
    return done
  }

  STOPPERS.forEach((t) => window.addEventListener(t, stop, { capture: true, passive: true }))
  let t0 = -1
  const step = (ts: number) => {
    if (stopped) return
    if (t0 < 0) t0 = ts
    const p = Math.min(1, (ts - t0) / duration)
    /* Read the place, then write the scroll: one read and one write a frame,
       never interleaved, so nothing is laid out twice. Read every frame
       because a picture above can finish loading mid-scroll. */
    const d = destination()
    writeScroll(sc, p >= 1 ? d : start + (d - start) * easeInOutCubic(p))
    if (p < 1) {
      frame = requestAnimationFrame(step)
      return
    }
    /* Landed. One more look a frame later for a late shift, then done. */
    frame = requestAnimationFrame(() => {
      const again = destination()
      if (Math.abs(readScroll(sc) - again) > 1) writeScroll(sc, again)
      finish()
    })
  }
  frame = requestAnimationFrame(step)
  return done
}

/**
 * Scroll to a `#hash` on this page root, if it names something here.
 * Returns false when it does not, so the caller can do what it would have.
 */
export function scrollToHash(root: HTMLElement, hash: string, opts: Omit<ScrollOptions, "root"> = {}): boolean {
  const target = findSectionTarget(root, hash)
  if (!target) return false
  void scrollToElement(target, { ...opts, root }).then(() => {
    /* Where the keyboard goes next is where the eye went. */
    if (target === root) return
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1")
    target.focus({ preventScroll: true })
  })
  return true
}

/**
 * A link on the live page that points at a section of the page it is on:
 * scrolled to, with the address's hash updated without a jump. Anything else
 * returns false and is left to the browser. The header's menu drawer calls
 * this after it has closed; everything else goes through the click handler
 * in installSectionLinks.
 */
export function followSectionLink(href: string | null | undefined, from?: Element | null): boolean {
  if (!href || typeof window === "undefined") return false
  let url: URL
  try {
    url = new URL(href, window.location.href)
  } catch {
    return false
  }
  if (url.origin !== window.location.origin) return false
  if (normalizePath(url.pathname) !== normalizePath(window.location.pathname)) return false
  if (url.search && url.search !== window.location.search) return false
  if (!url.hash || url.hash === "#") return false
  const root = themeRootOf(from)
  if (!root) return false
  if (!scrollToHash(root, url.hash)) return false
  if (window.location.hash !== url.hash) {
    try {
      window.history.pushState(window.history.state, "", url.hash)
    } catch {
      /* A sandboxed frame can refuse; the scroll still happened. */
    }
  }
  return true
}

/**
 * The live page's half: same-page section links scroll, and an address that
 * arrives with a hash lands on its section once the page has settled. The
 * builder does neither: its canvas has no address bar, and its links go
 * through the editor's own navigation (editor-navigation.ts), which calls
 * scrollToHash.
 */
export function installSectionLinks(root: HTMLElement): () => void {
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
    if (!a) return
    if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return
    if (followSectionLink(a.getAttribute("href"), root)) e.preventDefault()
  }
  /* The document, not the root: the menu drawer is drawn outside the page. */
  document.addEventListener("click", onClick)
  const undoHash = settleOnHash(root)
  return () => {
    document.removeEventListener("click", onClick)
    undoHash()
  }
}

const SETTLE_MS = 2500

/**
 * An address with a hash: land on its section, and stay landed while the
 * pictures above it load and push it down, until the person scrolls or two
 * and a half seconds pass. Instant: this is arriving, not travelling.
 */
export function settleOnHash(root: HTMLElement): () => void {
  const hash = window.location.hash
  if (!hash || hash === "#") return () => {}
  const target = findSectionTarget(root, hash)
  if (!target || target === root) return () => {}
  const sc = scrollerOf(root)
  let over = false
  const styled = sc ?? document.documentElement
  const prevBehavior = styled.style.scrollBehavior
  styled.style.scrollBehavior = "auto"
  const place = () => {
    if (over) return
    const top = contentTop(target, sc)
    const offset = anchorOffset(root, Math.sign(top - readScroll(sc)))
    const d = Math.min(maxScroll(sc), Math.max(0, top - offset))
    if (Math.abs(readScroll(sc) - d) > 1) writeScroll(sc, d)
  }
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => place()) : null
  const end = () => {
    if (over) return
    over = true
    styled.style.scrollBehavior = prevBehavior
    ro?.disconnect()
    window.removeEventListener("load", place)
    STOPPERS.forEach((t) => window.removeEventListener(t, end, true))
    window.clearTimeout(timer)
  }
  requestAnimationFrame(place)
  ro?.observe(root)
  window.addEventListener("load", place)
  STOPPERS.forEach((t) => window.addEventListener(t, end, { capture: true, passive: true }))
  const timer = window.setTimeout(end, SETTLE_MS)
  return end
}

// ── Sections arriving ───────────────────────────────────────────────────────

/** A section that brings animation of its own: its own CSS says so, or something in it is already running one. */
function ownMotion(box: HTMLElement): boolean {
  for (const style of Array.from(box.querySelectorAll("style"))) {
    if (declaresOwnMotion(style.textContent ?? "")) return true
  }
  const running = (box as HTMLElement & { getAnimations?: (o?: { subtree?: boolean }) => Animation[] }).getAnimations?.({ subtree: true }) ?? []
  return running.some((a) => typeof CSSAnimation !== "undefined" && a instanceof CSSAnimation)
}

function keyframesFor(style: Exclude<SectionAnimation, "none">): Keyframe[] {
  const from = REVEAL_FROM[style]
  const to: Keyframe = { opacity: "1" }
  const start: Keyframe = { opacity: from.opacity }
  if (from.translate) { start.translate = from.translate; to.translate = "0 0" }
  if (from.scale) { start.scale = from.scale; to.scale = "1" }
  if (from.filter) { start.filter = from.filter; to.filter = "blur(0px)" }
  return [start, to]
}

export interface Reveal {
  /** Look at the page's boxes again: any not seen before is planned, the rest are left as they are. */
  rescan: () => void
  /** Everything shown, nothing watched. */
  stop: () => void
  /**
   * The editor only: play the entrance once on the sections in view, as a
   * visitor scrolling to them would see it. `keys` names the sections whose
   * setting changed; null is every one (a theme setting changed). A section
   * that never arrives (the first, the header, one set to None) stays still.
   */
  preview: (keys: string[] | null) => void
}

/**
 * Hide the sections below the screen and bring each in as it arrives.
 * `seen` is every box already dealt with, kept across rescans so a box is
 * planned once and one already painted on screen is never hidden after it.
 * A box first seen on a later rescan (a section added in the builder,
 * another page's) is planned like any other: hidden only when it is wholly
 * below the screen.
 */
/**
 * A section's own duration and delay over the theme's (round L: a
 * component's animation timing, SectionRenderer animationTimingAttrs). The
 * delay adds to the stagger, so sections arriving together still arrive in
 * order. Reduced motion never gets here: installReveal plays nothing then.
 */
export function boxTiming(box: HTMLElement, duration: number, delay: number): { duration: number; delay: number } {
  const own = Number(box.dataset.animationDuration)
  const wait = Number(box.dataset.animationDelay)
  return {
    duration: box.dataset.animationDuration && Number.isFinite(own) ? Math.min(1500, Math.max(150, own)) : duration,
    delay: delay + (box.dataset.animationDelay && Number.isFinite(wait) ? Math.min(1000, Math.max(0, wait)) : 0),
  }
}

export function installReveal(root: HTMLElement, theme: Record<string, unknown>, opts: { reduced?: boolean } = {}): Reveal {
  const seen = new WeakSet<Element>()
  const style = new WeakMap<Element, Exclude<SectionAnimation, "none">>()
  const reduced = opts.reduced ?? prefersReducedMotion()
  const supported =
    typeof IntersectionObserver !== "undefined" && typeof Element !== "undefined" && typeof Element.prototype.animate === "function"
  if (reduced || !supported) {
    return { rescan: () => {}, stop: () => {}, preview: () => {} }
  }
  const { duration, stagger } = revealTiming(theme)
  const sc = scrollerOf(root)

  const reveal = (box: HTMLElement, delay: number) => {
    const s = style.get(box)
    if (!s || box.getAttribute("data-reveal") !== "pending") return
    let anim: Animation | null = null
    try {
      anim = box.animate(keyframesFor(s), { ...boxTiming(box, duration, delay), easing: REVEAL_EASING, fill: "backwards" })
    } catch {
      anim = null
    }
    box.setAttribute("data-reveal", "in")
    const settle = () => {
      if (box.getAttribute("data-reveal") === "in") box.removeAttribute("data-reveal")
    }
    if (anim) anim.finished.then(settle, settle)
    else settle()
  }

  const io = new IntersectionObserver(
    (entries) => {
      const arriving = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      arriving.forEach((e, i) => {
        io.unobserve(e.target)
        reveal(e.target as HTMLElement, i * stagger)
      })
    },
    /* A little before the section's top is properly in view, so it is
       already moving as the eye gets there. */
    { root: sc, rootMargin: "0px 0px -6% 0px", threshold: 0 },
  )

  /*
    Every box not dealt with yet, whatever changed: it used to be only on a
    different page, and a section list that shared any id with the last one
    marked every box seen, so in the builder nothing below the screen ever
    arrived again after the first edit. The plan is read across the whole
    page (the first section, the alternating sides) and applied to the new
    boxes only.
  */
  const rescan = () => {
    const boxes = boxesOf(root)
    if (boxes.every((b) => seen.has(b))) return
    const plan = revealPlan(
      boxes.map((b) => ({
        type: b.dataset.sectionType ?? "",
        chrome: b.hasAttribute("data-chrome"),
        animation: b.dataset.animation ?? null,
        ownMotion: ownMotion(b),
      })),
      theme,
    )
    const bottom = sc ? sc.getBoundingClientRect().bottom : window.innerHeight
    boxes.forEach((b, i) => {
      if (seen.has(b)) return
      seen.add(b)
      const s = plan[i]
      if (!s) return
      /* On screen, or above it, as the page appears or the section is put in: left exactly as painted. */
      if (b.getBoundingClientRect().top < bottom) return
      style.set(b, s)
      b.setAttribute("data-reveal", "pending")
      io.observe(b)
    })
  }

  const showAll = () => {
    for (const b of Array.from(root.querySelectorAll<HTMLElement>(`${BOX}[data-reveal]`))) b.removeAttribute("data-reveal")
  }

  const preview = (keys: string[] | null) => {
    const boxes = boxesOf(root)
    const plan = revealPlan(
      boxes.map((b) => ({ type: b.dataset.sectionType ?? "", chrome: b.hasAttribute("data-chrome"), animation: b.dataset.animation ?? null, ownMotion: ownMotion(b) })),
      theme,
    )
    const view = sc ? sc.getBoundingClientRect() : { top: 0, bottom: window.innerHeight }
    let n = 0
    boxes.forEach((b, i) => {
      const s = plan[i]
      if (!s || b.hasAttribute("data-reveal")) return
      if (keys && !keys.includes(b.dataset.sectionKey ?? "")) return
      const r = b.getBoundingClientRect()
      if (r.bottom <= view.top || r.top >= view.bottom) return
      try {
        b.animate(keyframesFor(s), { ...boxTiming(b, duration, n++ * stagger), easing: REVEAL_EASING, fill: "backwards" })
      } catch {
        /* Shown as it is. */
      }
    })
  }
  window.addEventListener("beforeprint", showAll)
  rescan()
  return {
    rescan,
    preview,
    stop: () => {
      io.disconnect()
      window.removeEventListener("beforeprint", showAll)
      showAll()
    },
  }
}
