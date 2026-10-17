"use client"

/**
 * ===========================================================================
 *  A SECTION RENDERER FETCHED WHEN A PAGE DRAWS ONE
 * ===========================================================================
 * See ./registry.ts for why. One wrapper per renderer, and the same tree on
 * the server and in the browser, which is what lets React hydrate it:
 *
 *   <Suspense fallback={null}>  always, so the markers the server writes are
 *                               the ones the browser expects
 *     the renderer itself       once its file is here (synchronously, so a
 *                               page opened later never blinks)
 *     React.lazy                until then: on the server it waits for the
 *                               file and draws the section in full; in the
 *                               browser the server's markup stays on screen
 *                               while the file arrives, then it hydrates
 *
 * preloadSectionRenderers() fetches every one of them ahead of need: the
 * live site's link handler calls it the first time a visitor shows interest
 * in another page (components/website-builder/site-links.tsx), and the tests
 * call it before rendering every section.
 */
import { Suspense, lazy, useState, type ComponentType } from "react"
import type { SectionProps } from "./_shared"

type Renderer = ComponentType<SectionProps>

const loaders: Array<() => Promise<Renderer>> = []

export function lazySection(load: () => Promise<Renderer>): Renderer & { preload: () => Promise<Renderer> } {
  let loaded: Renderer | null = null
  let pending: Promise<Renderer> | null = null
  const preload = () =>
    (pending ??= load().then(
      (c) => (loaded = c),
      (e) => {
        /* A file that failed to arrive (a deploy in between) is asked for again next time. */
        pending = null
        throw e
      },
    ))
  const Lazy = lazy(() => preload().then((c) => ({ default: c })))
  function LazySection(props: SectionProps) {
    /* Chosen once per section on the page: switching from the lazy one to the
       loaded one later would remount it and lose what a visitor had open. */
    const [Ready] = useState(() => loaded)
    return <Suspense fallback={null}>{Ready ? <Ready {...props} /> : <Lazy {...props} />}</Suspense>
  }
  loaders.push(preload)
  return Object.assign(LazySection, { preload })
}

/** Every lazily fetched renderer, fetched now. Resolves when all are here; a failed one is skipped. */
export function preloadSectionRenderers(): Promise<void> {
  return Promise.allSettled(loaders.map((l) => l())).then(() => undefined)
}
