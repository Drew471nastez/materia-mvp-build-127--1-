/**
 * ===========================================================================
 *  A TRANSLATED PAGE MUST NOT TAKE THE APP DOWN
 * ===========================================================================
 * "Failed to execute 'insertBefore' on 'Node': The node before which the new
 * node is to be inserted is not a child of this node." 101 times on
 * /app/products in two days, from two people.
 *
 * A browser's translator (Chrome's Translate, Safari's) replaces every text
 * node on the page with <font> elements of its own; some extensions move or
 * wrap nodes too. React still holds the nodes it made, so the next time it
 * inserts something before one of them, or removes one, the browser throws:
 * that node is no longer where React left it. The throw happens while React
 * commits, the nearest error boundary takes the page, and a person reading
 * Storelib in their own language gets "Something went wrong" instead of
 * their products. Measured on the Products list with a translator's
 * replacement played over it: Delete, refused, threw exactly this way.
 *
 * The widely used remedy (facebook/react#11538) is to let those two calls
 * forgive a node that has been moved: removing a node that is already gone
 * is nothing to do, and inserting before a node that was wrapped inserts
 * before the wrapper, or at the end when the node is gone altogether. Nothing
 * else changes: every call whose nodes are where they should be goes
 * straight to the browser's own method, untouched.
 *
 * Installed once, before the app starts (instrumentation-client.ts), and it
 * says so once in the console the first time it forgives something, so a
 * page that relies on it is findable. Takes the prototype as an argument so
 * tests/dom-guard.test.ts drives it without a browser.
 */

type Proto = {
  removeChild: (this: unknown, child: unknown) => unknown
  insertBefore: (this: unknown, node: unknown, ref: unknown) => unknown
}
type Nodeish = { parentNode?: unknown } | null | undefined

const MARK = "__storelibDomGuard"

export function installDomGuard(proto: Proto | null | undefined, warn: (message: string) => void = () => {}): boolean {
  if (!proto || (proto as unknown as Record<string, unknown>)[MARK]) return false
  const removeChild = proto.removeChild
  const insertBefore = proto.insertBefore
  let said = false
  const note = (call: string) => {
    if (said) return
    said = true
    warn(`[dom-guard] a translator or an extension changed the page; ${call} was forgiven instead of crashing it`)
  }

  proto.removeChild = function (this: unknown, child: unknown) {
    if ((child as Nodeish)?.parentNode !== this) {
      note("removeChild")
      return child
    }
    return removeChild.call(this, child)
  }

  proto.insertBefore = function (this: unknown, node: unknown, ref: unknown) {
    if (ref && (ref as Nodeish)?.parentNode !== this) {
      note("insertBefore")
      /* The wrapper the reference is inside now, if it is still in this parent; else the end. */
      let at = (ref as Nodeish)?.parentNode as Nodeish
      while (at && at.parentNode !== this) at = at.parentNode as Nodeish
      return insertBefore.call(this, node, at ?? null)
    }
    return insertBefore.call(this, node, ref)
  }

  Object.defineProperty(proto, MARK, { value: true })
  return true
}

/** The browser's Node, once. */
export function guardDomAgainstTranslators(): void {
  if (typeof window === "undefined" || typeof Node !== "function") return
  installDomGuard(Node.prototype as unknown as Proto, (m) => console.warn(m))
}
