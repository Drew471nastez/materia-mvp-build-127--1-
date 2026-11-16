"use client"

import { Fragment, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { DotField } from "@/components/marketing/home/dot-field"
import type { FaqTopic } from "@/lib/marketing/faq-page"

/*
  /faq, LANDING ROUND 13 (the owner: "make the FAQ page more modern, adapted
  to our design, inherit the landing page's look, very smooth and clean").

  It is built from the home page's own parts, so it reads as the same product:

    the top     the near-black of the header and of the home page's closing
                call, with the same drifting dot field (DotField, paused off
                screen), the landing's display type (500 weight, tight
                tracking) and a search field drawn like the closing call's
                email field
    the sheet   a white sheet with rounded top corners lapping over the dark,
                as the home page's light sections lap over its dark ones
    the rows    the home page's FAQ rows: light grey, a plus that turns into
                a minus, the answer opening by its grid row (0fr to 1fr), so
                nothing is measured and only the open row's height moves

  Topics: a sticky list beside the questions from 1024px, a sticky row of
  chips under the header below that. The header's height is measured once
  (#platform-header-root) and shared as --fq-top, which both the sticky
  offsets and the scroll margins read, so the two can never disagree.

  Every question has an address (/faq#<id>, lib/marketing/faq-page.ts): it
  opens and comes into view when the page loads at it, and opening one writes
  it to the address bar, so the link can be copied from there.

  Motion is transform and opacity only, apart from the answer's own row
  height; nothing runs off screen, and reduced motion turns all of it off.
*/

const CSS = `
.fq{--fq-top:64px;--fq-chips:60px;--fq-ink:#18181b;--fq-muted:#6b6874;--fq-soft:#55535c;--fq-line:#e9e9ee;--fq-row:#f5f5f6;--fq-row-hover:#efeff1;--fq-r:clamp(28px,4vw,56px);--fq-edge:clamp(20px,5.15vw,84px);color:var(--fq-ink);background:#fff}
@media (min-width:768px){.fq{--fq-top:69px}}
@media (min-width:1024px){.fq{--fq-chips:0px}}

/* The top: dark, the dots, the heading and the search. */
.fq-top{position:relative;isolation:isolate;overflow:clip;background:#16161a;color:#fafafa;padding:clamp(44px,7vw,112px) var(--fq-edge) calc(clamp(52px,6.4vw,104px) + var(--fq-r))}
.fq-top-in{position:relative;z-index:1;max-width:880px;margin:0 auto;text-align:center}
.fq-title{margin:0 auto;max-width:14ch;font-size:clamp(44px,6.2vw,92px);font-weight:500;line-height:1.02;letter-spacing:-.05em;color:#fafafa;text-wrap:balance}
.fq-title span{color:#a3a0ac}
.fq-lede{margin:20px auto 0;max-width:44ch;font-size:clamp(16px,1.35vw,19px);line-height:1.55;color:#a3a0ac;text-wrap:balance}
.fq-search{position:relative;max-width:560px;margin:clamp(28px,3vw,40px) auto 0}
.fq-field{display:flex;align-items:center;gap:12px;height:60px;padding:0 8px 0 22px;border-radius:999px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.14);box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 12px 32px -18px rgba(0,0,0,.6);transition:border-color .2s ease,background-color .2s ease}
.fq-field:hover{border-color:rgba(255,255,255,.2)}
.fq-field:focus-within{border-color:rgba(255,255,255,.38);background:rgba(255,255,255,.08)}
.fq-field svg{flex:none;color:#8d8a97}
.fq-field input{flex:1;min-width:0;height:100%;padding:0;border:0;background:transparent;color:#fafafa;font:inherit;font-size:16px;outline:none;-webkit-appearance:none;appearance:none}
.fq-field input::placeholder{color:#8d8a97}
.fq-field input::-webkit-search-cancel-button{display:none}
.fq-clear{flex:none;display:grid;place-items:center;width:44px;height:44px;border:0;border-radius:999px;background:transparent;color:#a3a0ac;cursor:pointer;opacity:0;transform:scale(.85);pointer-events:none;transition:opacity .2s ease,transform .25s cubic-bezier(.22,1,.36,1),background-color .2s ease,color .2s ease}
.fq-clear[data-on]{opacity:1;transform:none;pointer-events:auto}
.fq-clear:hover{background:rgba(255,255,255,.08);color:#fff}
.fq-clear:focus-visible{outline:2px solid #fff;outline-offset:-2px}
.fq-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
@media (prefers-reduced-motion:no-preference){
  .fq-top-in > *{animation:fq-in .8s cubic-bezier(.22,1,.36,1) both}
  .fq-top-in > :nth-child(2){animation-delay:.06s}
  .fq-top-in > :nth-child(3){animation-delay:.12s}
}
@keyframes fq-in{from{opacity:0;transform:translate3d(0,14px,0)}to{opacity:1;transform:none}}

/* The sheet: white, its rounded top over the dark. */
.fq-sheet{position:relative;z-index:1;margin-top:calc(var(--fq-r) * -1);border-radius:var(--fq-r) var(--fq-r) 0 0;background:#fff;padding:clamp(8px,2vw,24px) var(--fq-edge) clamp(72px,8vw,128px)}
.fq-grid{max-width:1180px;margin:0 auto}
@media (min-width:1024px){.fq-grid{display:grid;grid-template-columns:220px minmax(0,1fr);gap:clamp(48px,6vw,112px);padding-top:clamp(40px,4vw,64px)}}

/* Topics: chips under the header on a phone and a tablet, a list beside the questions from 1024px. */
.fq-nav{position:sticky;top:var(--fq-top);z-index:5;margin:0 calc(var(--fq-edge) * -1);background:rgba(255,255,255,.94);-webkit-backdrop-filter:saturate(160%) blur(12px);backdrop-filter:saturate(160%) blur(12px)}
.fq-nav::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;background:var(--fq-line);opacity:0;transition:opacity .2s ease}
.fq-nav[data-stuck]::after{opacity:1}
.fq-nav ol{display:flex;gap:8px;margin:0;padding:12px var(--fq-edge);height:var(--fq-chips);box-sizing:border-box;list-style:none;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none;scroll-padding-inline:var(--fq-edge)}
.fq-nav ol::-webkit-scrollbar{display:none}
.fq-nav li{flex:none}
.fq-nav a{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 15px;border-radius:999px;background:var(--fq-row);color:var(--fq-soft);font-size:14px;font-weight:500;line-height:1;text-decoration:none;white-space:nowrap;transition:background-color .2s ease,color .2s ease,opacity .2s ease}
.fq-nav a:hover{color:var(--fq-ink)}
.fq-nav a[aria-current="true"]{background:var(--fq-ink);color:#fff}
.fq-nav a:focus-visible{outline:2px solid var(--fq-ink);outline-offset:2px}
.fq-nav a[data-empty]{opacity:.4;pointer-events:none;background:var(--fq-row);color:var(--fq-soft)}
.fq-count{font-size:12px;font-variant-numeric:tabular-nums;opacity:.6}
.fq-nav-label{display:none}
.fq-nav-bar{display:none}
@media (min-width:1024px){
  .fq-nav{top:calc(var(--fq-top) + 40px);align-self:start;margin:0;background:none;-webkit-backdrop-filter:none;backdrop-filter:none}
  .fq-nav::after{display:none}
  .fq-nav-label{display:block;margin:0 0 14px;color:var(--fq-muted);font-size:13px;font-weight:500;letter-spacing:.01em}
  .fq-nav-list{position:relative;padding-left:16px}
  .fq-nav-list::before{content:"";position:absolute;left:0;top:0;bottom:0;width:1px;background:var(--fq-line)}
  .fq-nav-bar{display:block;position:absolute;left:0;top:0;width:1px;height:40px;background:var(--fq-ink);transform:translate3d(0,calc(var(--fq-active,0) * 40px),0);transition:transform .45s cubic-bezier(.22,1,.36,1)}
  .fq-nav ol{display:block;height:auto;padding:0;overflow:visible}
  .fq-nav a{display:flex;justify-content:space-between;height:40px;padding:0;border-radius:0;background:none;font-size:15px;color:var(--fq-muted)}
  .fq-nav a[aria-current="true"],.fq-nav a[data-empty]{background:none}
  .fq-nav a[aria-current="true"]{color:var(--fq-ink)}
  .fq-nav a:focus-visible{outline-offset:4px;border-radius:4px}
  .fq-count{font-size:13px;opacity:.7}
}

/* The questions. */
.fq-status{margin:22px 0 0;color:var(--fq-muted);font-size:15px;line-height:1.5}
.fq-status:empty{display:none}
.fq-group{padding-top:clamp(36px,4vw,56px);scroll-margin-top:calc(var(--fq-top) + var(--fq-chips) - 12px)}
.fq-group:first-of-type{padding-top:clamp(24px,3vw,32px)}
@media (min-width:1024px){.fq-group:first-of-type{padding-top:0}.fq-group{scroll-margin-top:calc(var(--fq-top) + 8px)}}
.fq-group[hidden]{display:none}
.fq-h2{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin:0 0 18px;font-size:clamp(26px,2.5vw,36px);font-weight:500;line-height:1.15;letter-spacing:-.035em;color:var(--fq-ink)}
.fq-h2 a{color:inherit;text-decoration:none}
.fq-rows{display:grid;gap:6px}
.fq-item{border-radius:12px;background:var(--fq-row);scroll-margin-top:calc(var(--fq-top) + var(--fq-chips) + 16px);transition:background-color .2s ease}
@media (min-width:1024px){.fq-item{scroll-margin-top:calc(var(--fq-top) + 32px)}}
.fq-item[hidden]{display:none}
@media (hover:hover){.fq-item:hover{background:var(--fq-row-hover)}}
.fq-item h3{margin:0}
.fq-q{display:flex;width:100%;align-items:center;justify-content:space-between;gap:20px;padding:19px 18px;border:0;border-radius:12px;background:none;color:var(--fq-ink);font:inherit;font-size:16px;font-weight:500;letter-spacing:-.01em;line-height:1.4;text-align:left;cursor:pointer}
.fq-q:focus-visible{outline:2px solid var(--fq-ink);outline-offset:-2px}
.fq-mark{position:relative;flex:none;width:16px;height:16px;color:#3f3f46}
.fq-mark::before,.fq-mark::after{content:"";position:absolute;left:0;top:7.25px;width:16px;height:1.5px;border-radius:2px;background:currentColor;transition:transform .35s cubic-bezier(.22,1,.36,1)}
.fq-mark::after{transform:rotate(90deg)}
.fq-q[aria-expanded="true"] .fq-mark::after{transform:rotate(0deg)}
.fq-a{display:grid;grid-template-rows:0fr;transition:grid-template-rows .4s cubic-bezier(.22,1,.36,1)}
.fq-item[data-open] .fq-a{grid-template-rows:1fr}
.fq-a-in{min-height:0;overflow:hidden}
.fq-a p{margin:0;padding:0 44px 22px 18px;color:var(--fq-soft);font-size:15px;line-height:1.65;opacity:0;transform:translate3d(0,-4px,0);transition:opacity .3s ease,transform .4s cubic-bezier(.22,1,.36,1);text-wrap:pretty}
.fq-item[data-open] .fq-a p{opacity:1;transform:none;transition-delay:.06s}
.fq mark{background:rgba(124,58,237,.14);color:inherit;border-radius:3px;padding:0 1px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
@media (min-width:640px){
  .fq-q{padding:24px 28px;font-size:clamp(16px,1.2vw,18px)}
  .fq-a p{padding:0 76px 26px 28px;font-size:16px}
}

/* A topic rises once as it reaches the screen; one already on screen, or one jumped to, simply shows. */
@media (prefers-reduced-motion:no-preference){
  .fq-group{transition:opacity .7s cubic-bezier(.22,1,.36,1),transform .7s cubic-bezier(.22,1,.36,1)}
  .fq-group[data-wait]{opacity:0;transform:translate3d(0,20px,0)}
}

/* Nothing found. */
.fq-none{margin:28px 0 0;padding:28px;border-radius:12px;background:var(--fq-row);color:var(--fq-soft);font-size:16px;line-height:1.6}
.fq-none strong{color:var(--fq-ink);font-weight:500}
.fq-none a{color:var(--fq-ink);text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px;text-decoration-color:#c9c9d1}
.fq-none button{padding:0;border:0;background:none;color:var(--fq-ink);font:inherit;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px;text-decoration-color:#c9c9d1;cursor:pointer}

/* The end: where to ask next. */
.fq-end{margin-top:clamp(56px,6vw,96px);padding-top:clamp(32px,3vw,44px);border-top:1px solid var(--fq-line);display:grid;gap:24px}
@media (min-width:768px){.fq-end{grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:40px}}
.fq-end h2{margin:0;font-size:clamp(26px,2.5vw,36px);font-weight:500;line-height:1.15;letter-spacing:-.035em}
.fq-end p{margin:10px 0 0;max-width:46ch;color:var(--fq-muted);font-size:16px;line-height:1.6}
.fq-end p a{color:var(--fq-ink);text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px;text-decoration-color:#c9c9d1}
.fq-end p a:hover{text-decoration-color:var(--fq-ink)}
.fq-actions{display:flex;flex-wrap:wrap;gap:10px}
.fq-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:50px;padding:0 24px;border-radius:999px;font-size:15px;font-weight:600;text-decoration:none;white-space:nowrap;transition:background-color .2s ease,border-color .2s ease,color .2s ease}
.fq-btn:focus-visible{outline:2px solid var(--fq-ink);outline-offset:3px}
.fq-btn-dark{background:var(--fq-ink);color:#fff}
.fq-btn-dark:hover{background:#2e2e33}
.fq-btn-line{border:1px solid #dcdce2;color:var(--fq-ink)}
.fq-btn-line:hover{border-color:var(--fq-ink)}
.fq-btn svg{transition:transform .25s cubic-bezier(.2,.8,.2,1)}
.fq-btn:hover svg{transform:translateX(3px)}
@media (max-width:479px){.fq-actions{flex-direction:column}.fq-btn{width:100%}}

@media (prefers-reduced-motion:reduce){
  .fq *,.fq *::before,.fq *::after{transition:none!important;animation:none!important}
}
`

/** Lower case, accents off, so "cafe" finds "café". */
function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

function wordsOf(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean)
}

/** The text with every searched word marked. Folding keeps lengths for the Latin text here, so positions carry over. */
function marked(text: string, words: string[]): ReactNode {
  if (!words.length) return text
  const folded = fold(text)
  if (folded.length !== text.length) return text
  const hits: [number, number][] = []
  for (const w of words) {
    let i = folded.indexOf(w)
    while (i !== -1) {
      hits.push([i, i + w.length])
      i = folded.indexOf(w, i + w.length)
    }
  }
  if (!hits.length) return text
  hits.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const h of hits) {
    const last = merged[merged.length - 1]
    if (last && h[0] <= last[1]) last[1] = Math.max(last[1], h[1])
    else merged.push([...h])
  }
  const out: ReactNode[] = []
  let at = 0
  merged.forEach(([s, e], k) => {
    if (s > at) out.push(<Fragment key={`t${k}`}>{text.slice(at, s)}</Fragment>)
    out.push(<mark key={`m${k}`}>{text.slice(s, e)}</mark>)
    at = e
  })
  if (at < text.length) out.push(<Fragment key="end">{text.slice(at)}</Fragment>)
  return out
}

function reduced(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

export function FaqPageClient({ topics, supportEmail, helpUrl }: { topics: FaqTopic[]; supportEmail: string; helpUrl: string }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const probeRef = useRef<HTMLDivElement>(null)
  const pendingRef = useRef<{ id: string; smooth: boolean } | null>(null)
  const chipsRef = useRef<HTMLOListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const [query, setQuery] = useState("")
  const deferred = useDeferredValue(query)
  const [active, setActive] = useState(topics[0]?.id ?? "")
  const total = useMemo(() => topics.reduce((n, t) => n + t.questions.length, 0), [topics])

  /* What the search keeps: a question stays when every word is in it or in its answer. */
  const words = useMemo(() => wordsOf(deferred), [deferred])
  const found = useMemo(() => {
    const keep = new Map<string, "q" | "a">()
    for (const t of topics)
      for (const x of t.questions) {
        const q = fold(x.q)
        const all = `${q} ${fold(x.a)}`
        if (words.every((w) => all.includes(w))) keep.set(x.id, words.every((w) => q.includes(w)) ? "q" : "a")
      }
    return keep
  }, [topics, words])
  const searching = words.length > 0
  const shown = searching ? found.size : total

  /* A search shows its answers at once: no topic waits to rise in. */
  useEffect(() => {
    if (searching) rootRef.current?.querySelectorAll(".fq-group[data-wait]").forEach((g) => g.removeAttribute("data-wait"))
  }, [searching])

  /* A short search whose words are only in the answers opens those answers, so the reason each one is here is in sight. */
  useEffect(() => {
    if (!searching || found.size > 4) return
    const inAnswer = [...found].filter(([, where]) => where === "a").map(([id]) => id)
    if (!inAnswer.length) return
    setOpen((prev) => {
      if (inAnswer.every((id) => prev.has(id))) return prev
      const next = new Set(prev)
      for (const id of inAnswer) next.add(id)
      return next
    })
  }, [searching, found])

  /* The header's height, measured once and on resize, shared as --fq-top. */
  useIsoLayoutEffect(() => {
    /* The header that loads first is a placeholder the real one replaces (conditional-header.tsx), so the bar is found again whenever its parent's children change. A bar that is not drawn yet (0 high) leaves the stylesheet's own value. */
    const root = rootRef.current
    if (!root || typeof ResizeObserver !== "function") return
    let header: HTMLElement | null = null
    const set = () => {
      if (!header?.isConnected) return
      const pos = getComputedStyle(header).position
      const h = pos === "sticky" || pos === "fixed" ? header.getBoundingClientRect().height : 0
      if (pos !== "sticky" && pos !== "fixed") root.style.setProperty("--fq-top", "0px")
      else if (h > 0) root.style.setProperty("--fq-top", `${Math.round(h * 100) / 100}px`)
    }
    const ro = new ResizeObserver(set)
    const mo = new MutationObserver(() => attach())
    const attach = () => {
      const next = document.getElementById("platform-header-root")
      if (!next || next === header) return
      if (header) ro.unobserve(header)
      header = next
      ro.observe(header)
      mo.disconnect()
      if (header.parentElement) mo.observe(header.parentElement, { childList: true })
      set()
    }
    const onResize = () => {
      attach()
      set()
    }
    attach()
    window.addEventListener("resize", onResize)
    return () => {
      ro.disconnect()
      mo.disconnect()
      window.removeEventListener("resize", onResize)
    }
  }, [])

  /* Topics below the screen wait to rise in; the rest show at once. */
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof IntersectionObserver !== "function" || reduced()) return
    const groups = [...root.querySelectorAll<HTMLElement>(".fq-group")].filter((g) => g.getBoundingClientRect().top > window.innerHeight)
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting && e.boundingClientRect.top > 0) continue
          e.target.removeAttribute("data-wait")
          io.unobserve(e.target)
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    )
    for (const g of groups) {
      g.setAttribute("data-wait", "")
      io.observe(g)
    }
    return () => {
      io.disconnect()
      for (const g of groups) g.removeAttribute("data-wait")
    }
  }, [])

  /* The topic being read: the one crossing a thin band a third of the way down the screen. */
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof IntersectionObserver !== "function") return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id)
      },
      { rootMargin: "-30% 0px -66% 0px" },
    )
    root.querySelectorAll(".fq-group").forEach((g) => io.observe(g))
    return () => io.disconnect()
  }, [])

  /* The chip row: a hairline once it sits under the header. */
  useEffect(() => {
    const nav = navRef.current
    const probe = probeRef.current
    if (!nav || !probe || typeof IntersectionObserver !== "function") return
    const top = parseFloat(getComputedStyle(nav).top) || 0
    const io = new IntersectionObserver(([e]) => nav.toggleAttribute("data-stuck", !e.isIntersecting && e.boundingClientRect.top < top + 1), {
      rootMargin: `-${Math.ceil(top) + 1}px 0px 0px 0px`,
    })
    io.observe(probe)
    return () => io.disconnect()
  }, [])

  /* The active chip slides into view inside its own row (the row scrolls, never the page). */
  useEffect(() => {
    const row = chipsRef.current
    if (!row || row.scrollWidth <= row.clientWidth) return
    const chip = row.querySelector<HTMLElement>(`a[href="#${active}"]`)
    if (!chip) return
    const left = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2
    row.scrollTo({ left: Math.max(0, left), behavior: reduced() ? "auto" : "smooth" })
  }, [active])

  /* An address that names a question opens it and brings it into view; one that names a topic goes there. */
  const goTo = useCallback((hash: string, smooth: boolean) => {
    const id = decodeURIComponent(hash.replace(/^#/, ""))
    if (!id) return
    const el = document.getElementById(id)
    if (!el || !rootRef.current?.contains(el)) return
    el.closest(".fq-group")?.removeAttribute("data-wait")
    if (el.classList.contains("fq-item")) {
      setOpen((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
    }
    /* A question the search has hidden: the search is cleared first, and the scroll waits until it is drawn again (the effect below). */
    if (el.closest("[hidden]")) {
      pendingRef.current = { id, smooth }
      setQuery("")
      return
    }
    requestAnimationFrame(() => el.scrollIntoView({ block: "start", behavior: smooth && !reduced() ? "smooth" : "auto" }))
  }, [])

  useEffect(() => {
    const pending = pendingRef.current
    if (searching || !pending) return
    pendingRef.current = null
    const el = document.getElementById(pending.id)
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: "start", behavior: pending.smooth && !reduced() ? "smooth" : "auto" }))
  }, [searching])

  useEffect(() => {
    if (location.hash) goTo(location.hash, false)
    const onHash = () => goTo(location.hash, true)
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [goTo])

  /* "/" anywhere on the page goes to the search, as on most sites with one. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const toggle = (id: string) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        if (location.hash === `#${id}`) history.replaceState(history.state, "", location.pathname + location.search)
      } else {
        next.add(id)
        history.replaceState(history.state, "", `#${id}`)
      }
      return next
    })
  }

  const jump = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    setActive(id)
    history.replaceState(history.state, "", `#${id}`)
    goTo(`#${id}`, true)
  }

  const clear = () => {
    setQuery("")
    inputRef.current?.focus()
  }

  const counts = useMemo(() => new Map(topics.map((t) => [t.id, searching ? t.questions.filter((x) => found.has(x.id)).length : t.questions.length])), [topics, searching, found])
  const activeIndex = Math.max(0, topics.findIndex((t) => t.id === active))

  /* A search that leaves the marked topic empty marks the first topic it kept. */
  useEffect(() => {
    if (!searching || (counts.get(active) ?? 0) > 0) return
    const first = topics.find((t) => (counts.get(t.id) ?? 0) > 0)
    if (first) setActive(first.id)
  }, [searching, counts, active, topics])

  return (
    <div className="fq" ref={rootRef}>
      <style href="faq-page" precedence="default">{CSS}</style>

      <section className="fq-top" aria-labelledby="fq-title">
        <DotField fade="edges" scatter />
        <div className="fq-top-in">
          <h1 id="fq-title" className="fq-title">
            What sellers ask{"\u00a0"}us, <span>answered</span>
          </h1>
          <p className="fq-lede">
            {total} answers on plans, fees, payouts, your website and Explore. Search them, or pick a topic.
          </p>
          <form className="fq-search" role="search" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="fq-q" className="fq-sr">Search the questions</label>
            <div className="fq-field">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={inputRef}
                id="fq-q"
                type="search"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="search"
                placeholder="Search the answers"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && query) {
                    e.preventDefault()
                    setQuery("")
                  }
                }}
              />
              <button type="button" className="fq-clear" data-on={query ? "" : undefined} tabIndex={query ? 0 : -1} aria-label="Clear the search" onClick={clear}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          </form>
        </div>
      </section>

      <div className="fq-sheet">
        {/* Where the chip row starts: once this has gone under the header, the row is stuck and draws its hairline. */}
        <div ref={probeRef} aria-hidden="true" />
        <div className="fq-grid">
          <nav className="fq-nav" ref={navRef} aria-label="Topics">
            <p className="fq-nav-label">Topics</p>
            <div className="fq-nav-list" style={{ "--fq-active": activeIndex } as CSSProperties}>
              <span className="fq-nav-bar" aria-hidden="true" />
              <ol ref={chipsRef}>
                {topics.map((t) => {
                  const n = counts.get(t.id) ?? 0
                  return (
                    <li key={t.id}>
                      <a href={`#${t.id}`} aria-current={active === t.id ? "true" : undefined} data-empty={searching && !n ? "" : undefined} onClick={(e) => jump(e, t.id)}>
                        {t.label}
                        <span className="fq-count">{n}</span>
                      </a>
                    </li>
                  )
                })}
              </ol>
            </div>
          </nav>

          <div>
            <p className="fq-status" role="status" aria-live="polite">
              {searching && shown > 0 ? `${shown} ${shown === 1 ? "answer" : "answers"} for “${deferred.trim()}”` : ""}
            </p>
            {searching && shown === 0 ? (
              <p className="fq-none">
                Nothing here mentions <strong>{`“${deferred.trim()}”`}</strong>. Try another word, <button type="button" onClick={clear}>clear the search</button>, or write to <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
              </p>
            ) : null}

            {topics.map((t) => {
              const n = counts.get(t.id) ?? 0
              return (
                <section key={t.id} id={t.id} className="fq-group" aria-labelledby={`${t.id}-h`} hidden={searching && !n}>
                  <h2 id={`${t.id}-h`} className="fq-h2">{t.title}</h2>
                  <div className="fq-rows">
                    {t.questions.map((x) => {
                      const isOpen = open.has(x.id)
                      return (
                        <div key={x.id} id={x.id} className="fq-item" data-open={isOpen ? "" : undefined} hidden={searching && !found.has(x.id)}>
                          <h3>
                            <button type="button" className="fq-q" id={`${x.id}-q`} aria-expanded={isOpen} aria-controls={`${x.id}-a`} onClick={() => toggle(x.id)}>
                              <span>{marked(x.q, words)}</span>
                              <span className="fq-mark" aria-hidden="true" />
                            </button>
                          </h3>
                          {/* inert while closed: a closed answer is not read out and holds no tab stop, but its words are in the page. */}
                          <div className="fq-a" id={`${x.id}-a`} role="region" aria-labelledby={`${x.id}-q`} inert={!isOpen}>
                            <div className="fq-a-in">
                              <p>{marked(x.a, words)}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            })}

            <div className="fq-end">
              <div>
                <h2>Still have a question?</h2>
                <p>
                  Write to <a href={`mailto:${supportEmail}`}>{supportEmail}</a> and we will answer it, or look it up in the Help Center, where the step by step guides are.
                </p>
              </div>
              <div className="fq-actions">
                <a className="fq-btn fq-btn-dark" href={`mailto:${supportEmail}`}>
                  Email support
                </a>
                <a className="fq-btn fq-btn-line" href={helpUrl}>
                  Help Center
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
