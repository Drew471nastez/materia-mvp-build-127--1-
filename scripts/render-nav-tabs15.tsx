/**
 * THE TAB BAR UNDER EVERY KIND OF LAYER, for scripts/check-nav-tabs15.mjs.
 *
 * The real buyer tab bar (or, with the probe's OLD=1, the bar as it was on
 * the round's base, for the before numbers) and stand-ins for the layers
 * that live in other workers' files, each built the way the real one is
 * where it matters to the bar: the composer is a white portal over the whole
 * window at z 125 whose field has the caret, the picture viewer a black one
 * at z 160, an opened post a white one at z 130 with a comment field at its
 * foot. Each registers through lib/ui/layers.ts as the real ones are asked
 * to (useLayer). Settings over the profile is the real one
 * (components/account/settings-subpage.tsx).
 *
 * window.__probe opens and closes them, navigates (the stubbed router's
 * address), and can take a layer's element out of the document behind
 * React's back, the way a torn down page does.
 */
import React, { useImperativeHandle, useRef, useState, forwardRef } from "react"
import { createPortal } from "react-dom"
import { createRoot } from "react-dom/client"
// @ts-expect-error resolved by the probe's bundler: the bar as it is now, or as it was
import { BuyerTabBar } from "@probe/bar"
import { LocaleProvider } from "@/components/locale-provider"
import { ExploreMarketplaceProvider } from "@/components/platform/explore-marketplace-context"
import { SettingsSubpageHost, openSettingsSubpage } from "@/components/account/settings-subpage"
import { useLayer, type LayerKind } from "@/lib/ui/layers"

try {
  localStorage.setItem("_sl_auth_v1", JSON.stringify({ signedIn: true, userId: "u-me", displayName: "Alex Morgan", username: "alex", isSeller: false }))
} catch {
  /* signed out, then */
}

type Kind = "composer" | "viewer" | "post"
const LOOK: Record<Kind, { z: number; bg: string }> = {
  composer: { z: 125, bg: "#ffffff" },
  viewer: { z: 160, bg: "#000000" },
  post: { z: 130, bg: "#ffffff" },
}

function Layer({ kind, focus }: { kind: Kind; focus: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayer(kind as LayerKind, true, ref)
  const look = LOOK[kind]
  return createPortal(
    <div ref={ref} data-probe-layer={kind} style={{ position: "fixed", inset: 0, zIndex: look.z, background: look.bg }}>
      {kind === "composer" ? <textarea data-probe-field="composer" autoFocus={focus} style={{ margin: 60, width: 260, height: 120 }} /> : null}
      {kind === "post" ? (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: "var(--buyer-tabs-h, 0px)", background: "#fff", borderTop: "1px solid #eee", padding: 8 }}>
          <input data-probe-field="comment" placeholder="Write a comment" style={{ width: "100%", height: 36 }} />
        </div>
      ) : null}
    </div>,
    document.body,
  )
}

type Api = { open: (k: Kind, focus?: boolean) => void; close: (k: Kind) => void; swap: (from: Kind, to: Kind) => void }
const Layers = forwardRef<Api>(function Layers(_, handle) {
  const [open, setOpen] = useState<Record<Kind, boolean>>({ composer: false, viewer: false, post: false })
  const [focus, setFocus] = useState(false)
  useImperativeHandle(handle, () => ({
    open: (k, f = false) => {
      setFocus(f)
      setOpen((o) => ({ ...o, [k]: true }))
    },
    close: (k) => setOpen((o) => ({ ...o, [k]: false })),
    /* One closing while the next opens, in one commit. */
    swap: (from, to) => setOpen((o) => ({ ...o, [from]: false, [to]: true })),
  }))
  return (
    <>
      {(Object.keys(open) as Kind[]).map((k) => (open[k] ? <Layer key={k} kind={k} focus={focus} /> : null))}
    </>
  )
})

const api: { current: Api | null } = { current: null }
;(window as unknown as Record<string, unknown>).__probe = {
  open: (k: Kind, focus?: boolean) => api.current?.open(k, focus),
  close: (k: Kind) => api.current?.close(k),
  swap: (from: Kind, to: Kind) => api.current?.swap(from, to),
  settings: () => openSettingsSubpage("profile"),
  navigate: (path: string) => {
    window.history.pushState({}, "", path)
    window.dispatchEvent(new Event("probe-nav"))
  },
}

const el = document.createElement("div")
el.setAttribute("data-probe-root", "")
document.body.appendChild(el)
createRoot(el).render(
  <LocaleProvider>
    <ExploreMarketplaceProvider exploreMarketplace buyerHeaderLight={false} physicalCommerce={false}>
      <div style={{ minHeight: 1600, padding: 16, background: "#f8f9fa" }} data-probe-page="">
        <p>The page under the bar.</p>
      </div>
      <Layers ref={(h) => { api.current = h }} />
      <BuyerTabBar />
      <SettingsSubpageHost />
    </ExploreMarketplaceProvider>
  </LocaleProvider>,
)
