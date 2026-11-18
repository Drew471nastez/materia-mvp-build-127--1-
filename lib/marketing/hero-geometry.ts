/** Width changes (rotation/window resizing) may rebuild the layout. Browser
 * toolbar/keyboard height changes must not change its safe-area geometry. This
 * self-contained function also runs while the server HTML is being parsed. */
export function freezeHeroGeometry(hero: HTMLElement | null) {
  if (!hero || document.hidden) return
  const width = document.documentElement.clientWidth
  if (Number(hero.dataset.geometryWidth) === width) return
  const root = document.documentElement
  for (const name of [
    "--hero-stable-safe-bottom",
    "--hero-stable-row-top",
    "--hero-stable-header-height",
  ])
    root.style.removeProperty(name)
  const touch =
    navigator.maxTouchPoints > 0 ||
    matchMedia("(pointer:coarse)").matches ||
    width < 768
  hero.toggleAttribute(
    "data-stable-touch",
    matchMedia("(pointer:coarse)").matches || (touch && width < 1024),
  )
  if (touch) {
    const css = getComputedStyle(hero)
    const bottom = css.getPropertyValue("--home-env-bottom").trim() || "0px"
    const top = Math.max(
      10.65, // round 61: the phone header's top rail, 2% off the bar (app/globals.css)
      parseFloat(css.getPropertyValue("--home-env-top")) || 0,
    )
    root.style.setProperty("--hero-stable-safe-bottom", bottom)
    if (width < 768 && !root.classList.contains("capacitor")) {
      root.style.setProperty("--hero-stable-row-top", `${top}px`)
      root.style.setProperty("--hero-stable-header-height", `${top + 52.65}px`)
    }
  }
  hero.dataset.geometryWidth = String(width)
}

export const HERO_GEOMETRY_BOOT = `(${freezeHeroGeometry.toString()})(document.currentScript.closest('[data-home-hero]'));`
