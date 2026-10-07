/**
 * After a full-screen layer closes, iOS often delivers a click to whatever
 * sat under the finger (the header's hamburger, a tab). A short-lived shield
 * eats that echo without blocking the next intentional tap.
 */
export function swallowGhostTaps(ms = 520) {
  if (typeof document === "undefined") return
  const block = document.createElement("div")
  block.setAttribute("data-ghost-tap-shield", "")
  block.setAttribute("aria-hidden", "true")
  block.style.cssText = "position:fixed;inset:0;z-index:9999;touch-action:none"
  const eat = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
  }
  block.addEventListener("click", eat, true)
  block.addEventListener("pointerup", eat, true)
  document.body.appendChild(block)
  window.setTimeout(() => block.remove(), ms)
}
