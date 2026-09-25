"use client"

import { useLayoutEffect, useSyncExternalStore } from "react"

/**
 * ===========================================================================
 *  A CLASS ON <html> FOR AS LONG AS SOMETHING IS ON THE PAGE, FROM ITS FIRST PAINT
 * ===========================================================================
 * What `html:has(<something>)` said, without a :has() on <html>.
 *
 * A :has() whose subject is <html> is asked again whenever anything under it
 * loses its children or has its text replaced, and in Chromium each time it
 * is asked the root is restyled, which restyles every element in the
 * document (Tailwind's --spacing is in rem, so the whole page depends on the
 * root). Measured with scripts/check-app-sheets-frames.mjs: 1000 to 2800
 * elements restyled on /app when "Copy" became "Copied", when a period was
 * picked, when the home page's own timers ticked, on pages where nothing the
 * rule asked about existed. Once a document has asked such a :has(), it keeps
 * answering it for its whole life, so one rule anywhere is enough.
 *
 * So the element that the rule asked about says it is there instead, as a
 * class, and it says so exactly when the :has() would have matched:
 *
 *   SERVER HTML   a one line script, rendered where this is, runs the moment
 *                 the parser reaches it, before anything after it can paint.
 *                 That is when `:has()` began to match, and it holds if
 *                 hydration is slow or never comes.
 *   CLIENT        a layout effect, which runs in the commit that mounts the
 *                 element, before that commit paints, and its cleanup in the
 *                 commit that removes it.
 *
 * The script is drawn for the server's HTML and for hydration only: a script
 * React creates on the client never runs, so it is not drawn then.
 *
 * Put it first inside the element the rule was about, so it comes and goes
 * with it.
 */
const noSubscribe = () => () => {}
const onServerOrHydrating = () => false
const onClientMount = () => true

/** Only the server's half: for a component that already sets the class in a layout effect of its own. */
export function HtmlClassScript({ name }: { name: string }) {
  const onClient = useSyncExternalStore(noSubscribe, onClientMount, onServerOrHydrating)
  if (onClient) return null
  return <script dangerouslySetInnerHTML={{ __html: `try{document.documentElement.classList.add(${JSON.stringify(name)})}catch(e){}` }} />
}

/* How many mounted elements hold each class: two on the page at once (one leaving, one arriving) share it. */
const held = new Map<string, number>()

export function HtmlClass({ name }: { name: string }) {
  useLayoutEffect(() => {
    held.set(name, (held.get(name) ?? 0) + 1)
    document.documentElement.classList.add(name)
    return () => {
      const left = (held.get(name) ?? 1) - 1
      if (left > 0) {
        held.set(name, left)
        return
      }
      held.delete(name)
      document.documentElement.classList.remove(name)
    }
  }, [name])
  return <HtmlClassScript name={name} />
}
