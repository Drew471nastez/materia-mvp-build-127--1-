/**
 * ===========================================================================
 *  THE CONFIRMATION ON A PUBLIC PAGE: A DARK PILL, ONE LINE, GONE BY ITSELF
 * ===========================================================================
 * The creator page and the product page have no toaster (that lives in the
 * /app shell), and each place that needed to say "done" invented its own:
 * green text pushed into the subscribe bar, which made the bar taller and
 * moved the whole page down, and a "Copied!" swapped into a button label.
 *
 * This is the one they share: near-black, white text, a white mark, the
 * same shape the app's own toasts have on a phone. At the top on a phone,
 * where nothing on these pages lives (the buy bar owns the bottom), and at
 * the bottom centre on a computer. It floats, so it moves nothing under it.
 *
 * Plain DOM rather than a React tree, so any client component can call it
 * without a provider being mounted somewhere above it, and so it survives
 * the component that called it unmounting. The text is set with
 * `textContent`, never as markup.
 *
 * Motion is opacity and transform only, on the compositor, and none at all
 * for someone who has asked for less.
 */

type Mark = "check" | "link"

const MARKS: Record<Mark, string> = {
  check:
    '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true"><path d="M3.5 8.4l2.9 2.9 6.1-6.6" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  link:
    '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true"><path d="M6.6 9.4l2.8-2.8M7.3 4.6l.9-.9a2.8 2.8 0 014 4l-.9.9M8.7 11.4l-.9.9a2.8 2.8 0 01-4-4l.9-.9" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/></svg>',
}

const SHOW_MS = 2200
const IN = { duration: 240, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
const OUT = { duration: 180, easing: "cubic-bezier(0.4, 0, 1, 1)" }

let live: { el: HTMLDivElement; timer: number } | null = null

function onPhone() {
  return window.matchMedia?.("(max-width: 639px)").matches ?? false
}

function calm() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
}

export function showPillToast(
  text: string,
  {
    mark = "check",
    at,
  }: {
    mark?: Mark
    /**
     * Where on a phone. The top by default, which on the product page is
     * clear of the buy bar at the bottom. The creator page's subscribe bar
     * IS the top of its page, often near-black, so its confirmation goes
     * to the bottom instead of disappearing into the bar it came from.
     */
    at?: "top" | "bottom"
  } = {},
) {
  if (typeof document === "undefined") return

  /* A second confirmation replaces the first rather than stacking under it. */
  if (live) {
    window.clearTimeout(live.timer)
    live.el.remove()
    live = null
  }

  const phone = onPhone()
  const top = phone && at !== "bottom"
  const native = document.documentElement.classList.contains("capacitor")
  const el = document.createElement("div")
  el.setAttribute("role", "status")
  el.setAttribute("aria-live", "polite")
  el.setAttribute("data-pill-toast", "")
  el.style.cssText = [
    "position:fixed",
    "left:50%",
    top
      ? `top:calc(env(safe-area-inset-top, 0px) + ${native ? 80 : 12}px)`
      : `bottom:calc(env(safe-area-inset-bottom, 0px) + ${phone ? 20 : 24}px)`,
    "z-index:2147483600",
    "display:flex",
    "align-items:center",
    "gap:8px",
    "max-width:calc(100vw - 32px)",
    "padding:9px 15px 9px 12px",
    "border-radius:999px",
    "background:#111113",
    "color:#fff",
    "font:500 13.5px/18px Inter, ui-sans-serif, system-ui, -apple-system, sans-serif",
    "letter-spacing:-0.005em",
    /* The hairline is for a dark page, where a shadow is not seen. */
    "box-shadow:0 0 0 1px rgba(255,255,255,0.08), 0 1px 2px rgba(0,0,0,0.14), 0 12px 32px -10px rgba(0,0,0,0.42)",
    "pointer-events:none",
    "transform:translateX(-50%)",
    "white-space:nowrap",
  ].join(";")

  const icon = document.createElement("span")
  icon.style.cssText = "display:flex;flex-shrink:0"
  icon.innerHTML = MARKS[mark]
  const label = document.createElement("span")
  label.style.cssText = "overflow:hidden;text-overflow:ellipsis"
  label.textContent = text
  el.append(icon, label)
  document.body.appendChild(el)

  const from = `translateX(-50%) translateY(${top ? -10 : 10}px) scale(0.96)`
  const rest = "translateX(-50%) translateY(0) scale(1)"
  if (!calm() && typeof el.animate === "function") {
    el.animate([{ opacity: 0, transform: from }, { opacity: 1, transform: rest }], IN)
  }

  const timer = window.setTimeout(() => {
    const done = () => {
      el.remove()
      if (live?.el === el) live = null
    }
    if (calm() || typeof el.animate !== "function") return done()
    const a = el.animate([{ opacity: 1, transform: rest }, { opacity: 0, transform: from }], { ...OUT, fill: "forwards" })
    a.onfinish = done
    a.oncancel = done
  }, SHOW_MS)
  live = { el, timer }
}
