/**
 * ===========================================================================
 *  A SECTION'S NEW MARKUP, APPLIED AS A CHANGE AND NOT AS A REPLACEMENT
 * ===========================================================================
 * A section written in .storelib is drawn from one string of markup. Setting
 * that string with `innerHTML` throws away every node in the section and
 * builds them again, so typing one letter into a hero's heading decoded its
 * picture again, restarted its video from the first frame and played its
 * entrance animation from the start: the section flashed on every edit.
 *
 * `morphInto` walks the markup the section has and the markup it should have
 * side by side, and changes only what differs: a text node's text, an
 * attribute, a child added or removed. A picture whose `src` is the same is
 * the same `<img>`, already decoded, so nothing on screen moves that the
 * edit did not change.
 *
 * Nodes are matched by position and kind: the same node type and, for an
 * element, the same tag and the same `id`. That is all a section's markup
 * needs, because an edit changes the values in it far more often than its
 * shape; when the shape does change, the nodes past the change are replaced,
 * which is what `innerHTML` did for all of them.
 *
 * The result is exactly the markup asked for: after `morphInto(el, html)`,
 * `el.innerHTML` is what a template given `html` would hold, apart from the
 * few attributes the page itself wrote (PAGE_OWNED_ATTRIBUTES below).
 * scripts/check-section-morph.mjs holds that, and that unchanged nodes stay.
 */

/** Elements whose content is text a browser reads as a whole: compared and replaced as one. */
const WHOLE = new Set(["SCRIPT", "STYLE", "TEXTAREA", "TEMPLATE"])

function sameKind(a: Node, b: Node): boolean {
  if (a.nodeType !== b.nodeType) return false
  if (a.nodeType !== Node.ELEMENT_NODE) return true
  const ea = a as Element
  const eb = b as Element
  return ea.tagName === eb.tagName && (ea.getAttribute("id") ?? "") === (eb.getAttribute("id") ?? "")
}

/**
 * WHAT THE PAGE WROTE, NOT THE MARKUP. Attributes the page sets on a
 * section's elements after they are drawn, and that no template states. The
 * new markup never has them, so a plain sync took them off every element on
 * every edit:
 *
 *   data-sl-loaded   the picture has loaded (./media-fade.ts). Taken off, the
 *                    theme's stylesheet faded every picture in the section
 *                    to nothing, and nothing put it back: a product grid
 *                    kept its names and prices and lost every photo the
 *                    moment a setting moved in the sidebar.
 *
 * Kept unless the markup states the attribute itself. A picture whose
 * address changes is still loaded again and faded in: media-fade.ts takes the
 * mark off when `src` or `srcset` changes.
 */
export const PAGE_OWNED_ATTRIBUTES: ReadonlySet<string> = new Set(["data-sl-loaded"])

function syncAttributes(have: Element, want: Element): void {
  for (const { name, value } of Array.from(want.attributes)) {
    if (have.getAttribute(name) !== value) have.setAttribute(name, value)
  }
  for (const { name } of Array.from(have.attributes)) {
    if (!want.hasAttribute(name) && !PAGE_OWNED_ATTRIBUTES.has(name)) have.removeAttribute(name)
  }
}

function morphNode(have: Node, want: Node): void {
  if (have.nodeType !== Node.ELEMENT_NODE) {
    if (have.nodeValue !== want.nodeValue) have.nodeValue = want.nodeValue
    return
  }
  const eh = have as Element
  const ew = want as Element
  if (WHOLE.has(eh.tagName)) {
    if (eh.innerHTML !== ew.innerHTML) {
      eh.replaceWith(ew)
      return
    }
    syncAttributes(eh, ew)
    return
  }
  syncAttributes(eh, ew)
  morphChildren(eh, ew)
}

function morphChildren(from: Node, to: Node): void {
  /* Captured first: a node taken from `to` into `from` leaves `to`. */
  const next = Array.from(to.childNodes)
  for (let i = 0; i < next.length; i++) {
    const want = next[i]
    const have = from.childNodes[i]
    if (!have) from.appendChild(want)
    else if (!sameKind(have, want)) from.replaceChild(want, have)
    else morphNode(have, want)
  }
  while (from.childNodes.length > next.length) from.removeChild(from.lastChild as ChildNode)
}

/** Makes `target`'s content the markup in `html`, changing only what differs. */
export function morphInto(target: Element, html: string): void {
  const template = target.ownerDocument.createElement("template")
  template.innerHTML = html
  morphChildren(target, target.ownerDocument.importNode(template.content, true))
}
