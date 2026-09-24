/**
 * THE SHARED SHEET, OPENED FROM A PARENT THAT RENDERS LIKE THE REAL ONES.
 *
 * The account sheet's open state lived in a parent, the sheet's close was an
 * inline arrow, and a document `mousedown` listener closed it from outside.
 * All three are reproduced here, so the probe drives the shape that glitched
 * rather than a tidy one that never could.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { MobileAccountMenu } from "@/components/app/mobile-account-menu"

/**
 * A menu that takes a slow phone's time to draw. On a fast desktop the window
 * between "the sheet is in the DOM" and "the sheet has been moved below the
 * screen" was too short to land on a frame, which is why the glitch was
 * intermittent and why a probe without this passed a sheet that had it.
 */
function SlowRow({ label }: { label: string }) {
  const until = performance.now() + 3
  while (performance.now() < until) { /* a phone's worth of render */ }
  return <div style={{ padding: "14px 12px", fontSize: 15 }}>{label}</div>
}

function Harness() {
  const [open, setOpen] = React.useState(false)
  /* `false` takes the whole sheet away, the way a page navigated away from
     or a deleted row takes its own sheet with it. */
  const [present, setPresent] = React.useState(true)
  const rowRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    ;(window as unknown as { __sheet: unknown }).__sheet = {
      open: () => { setPresent(true); setOpen(true) },
      close: () => setOpen(false),
      unmount: () => setPresent(false),
    }
  }, [])
  React.useEffect(() => {
    /* The sidebar's old outside-click listener, which is what a synthesized
       mousedown after a tap reaches. The sheet must be immune to it. */
    const onDown = (e: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node) && !(e.target as HTMLElement).closest("[data-app-sheet]")) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [])
  return (
    <>
      <div ref={rowRef} style={{ position: "fixed", top: 0, left: 0, right: 0, height: 68, background: "#111", zIndex: 50 }}>
        <button id="trigger" onClick={() => setOpen((v) => !v)} style={{ margin: 16, padding: "8px 12px", color: "#fff" }}>Account</button>
      </div>
      {/* Before the page, as it is in /app (the sidebar comes before <main>). */}
      <div data-app-nav-pill="" id="pill" style={{ position: "fixed", left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <button id="pill-tab" style={{ pointerEvents: "auto", width: 256, height: 56, marginBottom: 16, borderRadius: 999, background: "#000", border: 0 }} />
      </div>
      {/* POSITIONED, like the dashboard's scroller and the orders stage. A
          positioned page after the pill in the document is what painted over
          the pill when the old rule dropped it to layer 0. */}
      <div id="page" style={{ paddingTop: 68, position: "relative", background: "#f8f9fa" }}>
        {Array.from({ length: 40 }, (_, i) => <div key={i} style={{ height: 64, margin: 8, background: "#fff", borderRadius: 16 }} />)}
      </div>
      {/* `?kb`: the same sheet asked to sit on the keyboard, which a sheet with a field is. */}
      {present && (
        <BottomSheet isOpen={open} onClose={() => setOpen(false)} label="Account" aboveKeyboard={new URLSearchParams(location.search).has("kb")}>
          <div style={{ padding: 12 }}>
            {["Settings", "Billing", "Help", "Explore", "Library", "Language", "Logout"].map((l) => (
              <SlowRow key={l} label={l} />
            ))}
          </div>
        </BottomSheet>
      )}
    </>
  )
}

/**
 * `?account`: THE REAL ACCOUNT SHEET, OVER A PAGE THE SIZE OF THE DASHBOARD.
 *
 * components/app/mobile-account-menu.tsx as the sidebar mounts it: in a
 * dark header, inside a parent that holds the sidebar's own state (the menu
 * page's open flag, which the trigger closes on every tap) and draws a
 * nav's worth of rows, beside a dashboard's worth of cards. Both count their
 * renders, so the probe can say whether opening or closing the sheet made
 * either of them draw again.
 */
const renders = { sidebar: 0, dashboard: 0 }
;(window as unknown as { __renders: typeof renders }).__renders = renders
const avatar = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs><radialGradient id="g"><stop offset="0" stop-color="#f4c7a1"/><stop offset="1" stop-color="#7a4b2a"/></radialGradient></defs><rect width="512" height="512" fill="url(#g)"/><circle cx="256" cy="200" r="90" fill="#3b2a20"/></svg>`)

function Dashboard() {
  renders.dashboard++
  return (
    <div id="page" style={{ paddingTop: 68, position: "relative", background: "#f8f9fa" }}>
      {Array.from({ length: 60 }, (_, i) => (
        <div key={i} style={{ margin: 12, padding: 16, background: "#fff", borderRadius: 16, border: "1px solid #eceef1" }}>
          <div style={{ fontSize: 13, color: "#6b7280" }}>Revenue {i}</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#1a1a2e" }}>${(i * 137.5).toFixed(2)}</div>
          <svg width="100%" height="40" viewBox="0 0 200 40" preserveAspectRatio="none">
            <polyline fill="none" stroke="#8b5cf6" strokeWidth="2" points={Array.from({ length: 24 }, (_, k) => `${k * 8.7},${20 + 15 * Math.sin((k + i) / 3)}`).join(" ")} />
          </svg>
          {Array.from({ length: 6 }, (_, k) => <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}><span>Row {k}</span><span>{k * i}</span></div>)}
        </div>
      ))}
    </div>
  )
}

function SidebarLike() {
  renders.sidebar++
  const [menuOpen, setMenuOpen] = React.useState(false)
  const closeMenu = React.useCallback(() => setMenuOpen(false), [])
  const noop = React.useCallback(() => {}, [])
  return (
    <>
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, height: 68, background: "#111", zIndex: 50, display: "flex", alignItems: "center", padding: "0 16px" }}>
        <MobileAccountMenu avatarSrc={avatar} userDisplayName="AndrewRullz" settingsLabel="Settings" billingLabel="Billing" languageLabel="Language" onOpening={closeMenu} onLanguage={noop} onSignOut={noop} />
      </header>
      <nav style={{ display: menuOpen ? "block" : "none" }}>
        {Array.from({ length: 200 }, (_, i) => <a key={i} href="#">Row {i}</a>)}
      </nav>
      <div data-app-nav-pill="" id="pill" style={{ position: "fixed", left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <button id="pill-tab" style={{ pointerEvents: "auto", width: 256, height: 56, marginBottom: 16, borderRadius: 999, background: "#000", border: 0 }} />
      </div>
    </>
  )
}

createRoot(document.getElementById("app")!).render(
  new URLSearchParams(location.search).has("account")
    ? <><SidebarLike /><Dashboard /></>
    : <Harness />,
)
