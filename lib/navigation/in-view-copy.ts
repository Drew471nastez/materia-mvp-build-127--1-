"use client"

/**
 * ===========================================================================
 *  A COPY OF WHAT THE WINDOW SHOWS, FOR IT TO GO OUT ON (round 31)
 * ===========================================================================
 * A crossfade wants the thing that is leaving, and a deep clone of it (as
 * lib/navigation/leaving-still.ts copyFor makes) costs what the thing holds:
 * a community's feed or Explore's grid is thousands of nodes, and copying
 * them is a long task in the very frame that should be moving. Only what is
 * in the window is ever seen, so only that is copied: an element wholly
 * above or below the window is copied as an empty box of its own size (its
 * own classes, so its margins and its place in a flex or grid row are
 * kept), and everything that crosses the window is copied whole. A
 * screenful is a few hundred nodes, whatever the page holds.
 *
 * What a clone does not carry is left out on purpose: no ids (they must not
 * exist twice), no frame or player (it would load again; a box of its size
 * stands in for the fifth of a second it is seen), no script. The marks a
 * caller names are taken off, so no query for the live page finds the copy.
 */

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "IFRAME", "VIDEO", "OBJECT", "EMBED", "AUDIO", "CANVAS"])

function unmark(el: Element, marks: readonly string[]) {
  if (el.hasAttribute("id")) el.removeAttribute("id")
  for (const a of marks) if (el.hasAttribute(a)) el.removeAttribute(a)
}

function copyInto(el: Element, bottom: number, marks: readonly string[]): Element {
  const copy = el.cloneNode(false) as Element
  unmark(copy, marks)
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 3) {
      copy.appendChild(child.cloneNode(false))
      continue
    }
    if (!(child instanceof Element)) continue
    if (child instanceof SVGElement) {
      /* A drawing is small and whole: copied as it is. */
      const svg = child.cloneNode(true) as Element
      unmark(svg, marks)
      copy.appendChild(svg)
      continue
    }
    const r = child.getBoundingClientRect()
    if (SKIP_TAGS.has(child.tagName)) {
      if (r.width && r.height) {
        const box = document.createElement("div")
        box.style.cssText = `display:inline-block;width:${Math.round(r.width)}px;height:${Math.round(r.height)}px`
        copy.appendChild(box)
      }
      continue
    }
    if (r.width === 0 && r.height === 0) {
      /* No box of its own (display: contents, or nothing in it): what is in it decides. */
      if (getComputedStyle(child).display === "contents") copy.appendChild(copyInto(child, bottom, marks))
      else {
        const empty = child.cloneNode(false) as Element
        unmark(empty, marks)
        copy.appendChild(empty)
      }
      continue
    }
    if (r.bottom < 0 || r.top > bottom) {
      const box = child.cloneNode(false) as HTMLElement
      unmark(box, marks)
      if (box.style) box.style.cssText += `;height:${r.height}px;min-height:${r.height}px;max-height:${r.height}px;overflow:hidden;visibility:hidden`
      copy.appendChild(box)
      continue
    }
    copy.appendChild(copyInto(child, bottom, marks))
  }
  return copy
}

/** A copy of `el`: whole where the window (0 to `bottom`) shows it, an empty box of the same size everywhere else. */
export function copyInView(el: Element, bottom: number, marks: readonly string[] = []): HTMLElement {
  return copyInto(el, bottom, marks) as HTMLElement
}
