/**
 * The Sites editor's phone sheet (components/sites/editor/site-sheet.tsx) and
 * the section builder's Add Section sheet
 * (components/store-builder/add-section-modal.tsx), mounted with a button
 * each for scripts/check-builder-phone-sheets.mjs. The router and Supabase
 * are stubs; the sheets are the real ones.
 */
import React, { useState } from "react"
import { createRoot } from "react-dom/client"
import { SiteSheet } from "@/components/sites/editor/site-sheet"
import { AddSectionModal } from "@/components/store-builder/add-section-modal"
import { StoreBuilderProvider } from "@/components/store-builder/store-builder-context"

function App() {
  const [site, setSite] = useState(false)
  const [add, setAdd] = useState(false)
  return (
    <div style={{ padding: 24, minHeight: "200vh" }}>
      <button id="open-site" onClick={() => setSite(true)}>Site</button>
      <button id="open-add" onClick={() => setAdd(true)}>Add section</button>
      <SiteSheet
        open={site}
        onClose={() => setSite(false)}
        siteName="Mara's prints"
        siteId="site_probe"
        state={{ kind: "live", url: "https://mara.storelib.site", stale: false }}
        onPublish={() => {}}
        onHistory={() => {}}
      />
      <StoreBuilderProvider creatorId="creator_probe">
        <AddSectionModal open={add} onOpenChange={setAdd} />
      </StoreBuilderProvider>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<App />)
