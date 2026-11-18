"use client"

import { use, type ReactNode } from "react"

/*
  HYDRATE ONCE THE WHOLE DOCUMENT IS HERE (landing round 14).

  The owner's iPhone recordings: the home page "glitches" as it loads. Measured: React error #418 on a share of
  loads, after which React throws the server's page away and draws all of it again in the browser (750 elements,
  the header included).

  Why. The page's data arrives inside the HTML, in pieces, as the document downloads. The scripts are async, so on
  a phone's network React starts hydrating before the last pieces are in. When it reaches an element whose children
  have not arrived, it waits in place and then begins that element again, but its place in the server's HTML has
  already moved inside the element, so the element no longer matches and the hydration is abandoned (seen with a
  logger in React's own mismatch path: the element's stateNode empty, the cursor on its first child; first on the
  page's wrapper, then, with a boundary there, one level up on <main>). A boundary only moves where it happens.

  So nothing under this component hydrates until the document has been read to its end: it waits (the server's
  HTML stays on screen meanwhile; no Suspense boundary of its own, so a later move between pages never shows an
  empty fallback) for DOMContentLoaded and one more task, by when every piece is in. The wait is the document's own download, a few
  hundred milliseconds on a slow phone and nothing on a fast one. On the server, and on any later move between
  pages, it does not wait at all.
*/
let arrived: Promise<void> | null = null
function documentArrived(): Promise<void> | null {
  if (typeof document === "undefined" || document.readyState !== "loading") return null
  return (arrived ??= new Promise<void>((done) => {
    document.addEventListener("DOMContentLoaded", () => window.setTimeout(done, 0), { once: true })
  }))
}

export function DocumentReady({ children }: { children: ReactNode }) {
  const wait = documentArrived()
  if (wait) use(wait)
  return children
}
