/**
 * ROUND 40, for scripts/check-legal-r40.mjs. The real components:
 *
 *   ?view=terms | privacy | refunds   the page (components/legal/legal-page) with its text
 *   ?view=share | subscribe      a OnePage's Share or Subscribe dialog, open (components/onepage/share-sheet, subscribe-sheet)
 *   ?view=legal                  a OnePage's footer links, with Terms opened in its sheet (components/onepage/onepage-legal-links)
 *   ?view=panels                 PillPanels with `fit`: a short panel shown over a tall one
 *   ?dark=1                      the dialogs on a dark page
 */
import React, { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { LegalPage } from "@/components/legal/legal-page"
import { TERMS_TOC, TermsBody } from "@/components/legal/terms-body"
import { PRIVACY_TOC, PrivacyBody } from "@/components/legal/privacy-body"
import { REFUND_TOC, RefundBody } from "@/components/legal/refund-body"
import { OnePageShareSheet } from "@/components/onepage/share-sheet"
import { OnePageSubscribeSheet } from "@/components/onepage/subscribe-sheet"
import { OnePageLegalLinks } from "@/components/onepage/onepage-legal-links"
import { PillPanels } from "@/components/onepage/pill-tabs"

const params = new URLSearchParams(location.search)
const view = params.get("view") || "terms"
const dark = params.get("dark") === "1"

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: dark ? "#14151a" : "#f2efe9", padding: 24 }} data-probe-page="">
      <p style={{ color: dark ? "#fff" : "#111", fontSize: 18 }}>Maria Clay</p>
      {children}
    </div>
  )
}

function LegalOpen() {
  useEffect(() => {
    const t = window.setTimeout(() => document.querySelector<HTMLButtonElement>("[data-onepage-legal] button:nth-child(3)")?.click(), 50)
    return () => window.clearTimeout(t)
  }, [])
  return (
    <Page>
      <div style={{ marginTop: 600 }}>
        <OnePageLegalLinks dark={dark} color={dark ? "#9ca3af" : "#1f2937"} />
      </div>
    </Page>
  )
}

function Panels() {
  const [v, setV] = useState<"short" | "tall">("short")
  ;(window as unknown as { __setPanel: (x: "short" | "tall") => void }).__setPanel = setV
  return (
    <div style={{ height: "100vh", overflowY: "auto" }} data-probe-scroller="">
      <PillPanels
        value={v}
        fit
        build="idle"
        panels={[
          { id: "short", node: <div style={{ height: 220, background: "#fff" }} data-probe-short="" /> },
          { id: "tall", node: <div style={{ height: 2400, background: "#eee" }} data-probe-tall="" /> },
        ]}
      />
    </div>
  )
}

function App() {
  const [open, setOpen] = useState(true)
  if (view === "terms") return <LegalPage kind="terms" toc={TERMS_TOC}><TermsBody /></LegalPage>
  if (view === "privacy") return <LegalPage kind="privacy" toc={PRIVACY_TOC}><PrivacyBody /></LegalPage>
  if (view === "refunds") return <LegalPage kind="refunds" toc={REFUND_TOC}><RefundBody /></LegalPage>
  if (view === "share")
    return (
      <Page>
        <OnePageShareSheet open={open} onClose={() => setOpen(false)} dark={dark} pageUrl="https://storelib.me/maria" pageTitle="Maria Clay" avatarUrl={null} />
      </Page>
    )
  if (view === "subscribe")
    return (
      <Page>
        <OnePageSubscribeSheet open={open} onClose={() => setOpen(false)} dark={dark} sellerName="Maria Clay" sellerId="s1" onepageId="o1" />
      </Page>
    )
  if (view === "legal") return <LegalOpen />
  return <Panels />
}

createRoot(document.getElementById("app")!).render(<App />)
