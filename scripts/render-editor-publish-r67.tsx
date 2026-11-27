/**
 * The real publish panel (components/website-builder/publish-panel.tsx) in
 * the three states round 67 adds to the editor, for
 * scripts/check-editor-publish-r67.mjs. The bar's two buttons above it are
 * drawn with the editor's own classes for Save and the new Publish
 * (app/(storelib)/website-builder/editor/[installId]/page.tsx), on the
 * editor's dark chrome. The hash says which:
 *
 *   #state=replaces   not live, another website is live ("It replaces ...")
 *   #state=first      not live, nothing is live yet ("It goes live at ...")
 *   #state=went       just published from here ("Your website is live.")
 *   &phone=1          the phone's sheet instead of the desktop panel
 */
import React, { useRef } from "react"
import { createRoot } from "react-dom/client"
import { PublishPanel } from "@/components/website-builder/publish-panel"

const params = new URLSearchParams(location.hash.slice(1))
const state = params.get("state") || "replaces"
const phone = params.get("phone") === "1"
const w = window as any
w.__nav = { path: "/website-builder/editor/i1", subs: new Set() }
/* The panel's reads (preview link, security check, domains) answer at once and empty. */
const realFetch = window.fetch
window.fetch = (async (input: RequestInfo | URL) => {
  const u = String(input instanceof Request ? input.url : input)
  if (u.includes("/security")) return new Response(JSON.stringify({ issues: [] }), { status: 200 })
  if (u.includes("/domains")) return new Response(JSON.stringify({ domains: [], canConnect: true }), { status: 200 })
  if (u.startsWith("/")) return new Response("{}", { status: 200 })
  return realFetch(input)
}) as typeof fetch

function Bar() {
  const anchor = useRef<HTMLDivElement | null>(null)
  const live = state === "went"
  return (
    <div style={{ background: "#141414", minHeight: "100vh" }} className="wb-chrome">
      <header className="flex h-14 items-center justify-end gap-2 border-b border-white/10 px-4" style={{ ["--wb-chrome-hover" as string]: "rgba(255,255,255,0.08)", ["--wb-chrome-fg" as string]: "#f5f5f5", ["--wb-chrome-active" as string]: "rgba(255,255,255,0.14)" }}>
        <div ref={anchor} className="relative flex items-center gap-2">
          {live ? (
            <button className="inline-flex h-8 min-w-[92px] items-center justify-center gap-2 rounded-full bg-[#8B56FA] px-3 text-[14px] font-medium text-white">
              <span className="h-2 w-2 rounded-full bg-white/50" />
              <span>Publish</span>
            </button>
          ) : phone ? (
            <button aria-label="Publish" className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#8B56FA] text-white">↑</button>
          ) : (
            <>
              <button className="inline-flex h-8 min-w-[92px] items-center justify-center gap-2 rounded-full bg-[var(--wb-chrome-hover)] px-3 text-[14px] font-medium text-[var(--wb-chrome-fg)]">
                <span>Save</span>
              </button>
              <button data-editor-first-publish="" className="inline-flex h-8 min-w-[92px] items-center justify-center gap-2 rounded-full bg-[#8B56FA] px-3 text-[14px] font-medium text-white">
                <span aria-hidden className="h-2 w-2 rounded-full bg-white/50" />
                <span>Publish</span>
              </button>
            </>
          )}
          <PublishPanel
            open
            installId="i1"
            onOpenChange={() => {}}
            anchorRef={anchor}
            mobile={phone}
            live={live}
            pending={false}
            publishedAt={live ? new Date().toISOString() : null}
            websiteUrl="https://ava.storelib.com"
            websiteUrlDisplay="ava.storelib.com"
            busy={false}
            onPublish={() => {}}
            replaces={state === "replaces" ? "Night shop" : null}
            wentLive={state === "went"}
            backupsReady
            connections={null}
            connectionsSettled
          />
        </div>
      </header>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Bar />)
