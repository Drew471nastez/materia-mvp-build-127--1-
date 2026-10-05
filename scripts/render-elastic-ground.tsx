/**
 * The five buyer surfaces, each with the marker it really carries, the chrome
 * it really has and the real measuring code from lib/ui/elastic-overscroll.ts
 * run over it exactly as components/ui/elastic-overscroll.tsx runs it.
 *
 * Nothing here reimplements the walk or the colours: the selector, the walk
 * and the custom property all come from the module under test.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import {
  ELASTIC_CLASS,
  ELASTIC_SELECTOR,
  GROUND_VAR,
  type GroundProbe,
  bottomSurface,
  groundColor,
} from "@/lib/ui/elastic-overscroll"

/** Storelib's buyer header is white; a page that is not says so with --native-band. */
const HEADER_WHITE = "#ffffff"
/** The dark footer the marketing pages end on, which is the colour a band at the bottom used to get wrong. */
const FOOTER_DARK = "#111111"

function Header({ color = HEADER_WHITE }: { color?: string }) {
  return <header data-probe-header="" style={{ position: "sticky", top: 0, height: 57, background: color }} />
}

/** The phone's tab bar: fixed to the window, so it is never the foot of the page. */
function TabBar() {
  return (
    <>
      <div data-probe-tabs-room="" style={{ height: 0 }} />
      <nav style={{ position: "fixed", left: 0, right: 0, bottom: 0, height: 56, background: "#ffffff" }} />
    </>
  )
}

function Account({ children }: { children?: React.ReactNode }) {
  return (
    <div data-page="account" style={{ minHeight: "100svh", display: "flex", flexDirection: "column", background: "#fafafa" }}>
      <Header />
      <main style={{ flex: 1 }}>{children ?? <div style={{ height: 2400 }} />}</main>
      <footer data-probe-foot="" style={{ background: FOOTER_DARK, height: 260 }}>
        <div style={{ height: 80 }} />
      </footer>
      <TabBar />
    </div>
  )
}

const SURFACES: Record<string, React.ReactNode> = {
  /* /account: the profile centre, a dark footer under it, the tab bar fixed over that. */
  account: <Account />,
  /* /account/settings: the same shell, settings inside it. */
  settings: (
    <Account>
      <div data-account-settings="" style={{ height: 1800 }} />
    </Account>
  ),
  /* /account/library: the same shell again, the library's own marker inside it. */
  library: (
    <Account>
      <div data-page="library" style={{ height: 2000 }} />
    </Account>
  ),
  /* /@handle: a person's page, which ends on its own surface rather than a footer. */
  profile: (
    <div data-storefront-root="" data-member-profile="" style={{ minHeight: "100vh", background: "#ffffff" }}>
      <Header />
      <div style={{ height: 2200 }} />
      <div data-probe-foot="" style={{ background: "#f9fafb", height: 180 }} />
    </div>
  ),
  /*
    A DARK BUYER HEADER, which is the case the old single colour canvas got
    wrong at one end or the other: the band is #111111 and the page's own
    ground is light. The real page says this the same way, with a style tag
    from components/marketing/conditional-header.tsx.
  */
  darkheader: (
    <>
      <style>{":root{--native-band:#111111}"}</style>
      <div data-page="account" style={{ minHeight: "100svh", display: "flex", flexDirection: "column", background: "#fafafa" }}>
        <Header color="#111111" />
        <main style={{ flex: 1 }}><div style={{ height: 2400 }} /></main>
        <div data-probe-foot="" style={{ background: "#fafafa", height: 200 }} />
        <TabBar />
      </div>
    </>
  ),
  /* A person's page on a dark scheme: a white bar at the top, a dark ground at the bottom. */
  darkprofile: (
    <div data-storefront-root="" data-member-profile="" style={{ minHeight: "100vh", background: "#111113" }}>
      <Header />
      <div style={{ height: 2200 }} />
      <div data-probe-foot="" style={{ background: "#111113", height: 180 }} />
    </div>
  ),
  /*
    THE REAL CANVAS, SEEN DIRECTLY. Everything on this page is transparent, so
    what shows through at the top of the document and at its bottom is the
    canvas itself rather than a drawing of the same gradient. That is what
    tells the two readings of the background's positioning area apart: if it
    is the document's own box, the foot of the page is the ground; if it were
    the viewport, the foot of the page would still be the band.
  */
  canvas: (
    <>
      <style>{":root{--native-band:#111111}body{background:transparent!important}"}</style>
      <div data-page="account" data-probe-header="" style={{ minHeight: "100svh", background: "transparent" }}>
        <div style={{ height: 2400 }} />
        <div data-probe-foot="" style={{ height: 200, background: "transparent" }} />
      </div>
    </>
  ),
  /* Explore, which ends on its own ground. */
  explore: (
    <>
      <Header />
      <main className="explore-ground" data-probe-foot="" style={{ minHeight: "100vh", background: "#f8f9fa" }}>
        <div style={{ height: 2600 }} />
      </main>
    </>
  ),
}

const which = new URLSearchParams(location.search).get("s") || "account"
createRoot(document.getElementById("app")!).render(<>{SURFACES[which] ?? SURFACES.account}</>)

/*
  THE COMPONENT'S OWN WORK, after the surface is on the page. Run here rather
  than by mounting ElasticOverscroll, which wants a router it has no business
  having in a probe; the three calls below are the whole of what it does.
*/
function measure() {
  const html = document.documentElement
  const probe: GroundProbe = {
    background: (el) => getComputedStyle(el).backgroundColor,
    position: (el) => getComputedStyle(el).position,
    height: (el) => el.getBoundingClientRect().height,
  }
  /* React commits when it commits, so this waits for the surface rather than guessing a frame. */
  const surface = document.querySelector(ELASTIC_SELECTOR)
  if (!surface) {
    requestAnimationFrame(measure)
    return
  }
  const ground = groundColor(bottomSurface(surface, probe), probe)
  if (ground) html.style.setProperty(GROUND_VAR, ground)
  html.classList.add(ELASTIC_CLASS)
  html.setAttribute("data-elastic-ready", "")
}
requestAnimationFrame(measure)
