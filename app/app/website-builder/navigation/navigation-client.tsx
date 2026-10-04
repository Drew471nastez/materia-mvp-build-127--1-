"use client"

/**
 * ===========================================================================
 *  NAVIGATION, OUTSIDE THE BUILDER
 * ===========================================================================
 * The store's menus on a page of their own, the way Shopify's admin has
 * Content › Menus: a list of menus, Main menu first, and a menu opens onto
 * its links. The editor is the builder's own MenusEditor, so a menu is made
 * and edited the same way here and in the builder's Navigation panel.
 *
 * Saved as it changes, a moment after the last keystroke, to the store
 * (PUT /api/website-builder/menus), and live on every theme at once. The
 * header shows the Main menu once it has links (lib/website-builder/
 * header-settings.ts, headerMenuHandleOf), so editing it here is enough.
 *
 * Which menu sits in the header and in each footer column is a choice of
 * the website, made in the builder, so it is shown here and changed there.
 */
import * as React from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { MenusEditor } from "@/components/website-builder/editor/controls/menus-editor"
import { LinkTargetsProvider } from "@/components/website-builder/link-picker"
import { cleanMenus, type Menu } from "@/lib/storelib-theme/values"
import { headerMenuHandle, menuChoices } from "@/lib/website-builder/main-menu"
import { storeLinkTargets, type LinkTargetCollection, type LinkTargetProduct } from "@/lib/website-builder/link-targets"
import { cn } from "@/lib/utils"

type Header = { settings: Record<string, unknown>; blocks?: { id: string; type: string; settings: Record<string, unknown> }[] }

type SaveState = "idle" | "saving" | "saved" | "error"

const SAVE_AFTER_MS = 600

export function NavigationClient({
  available,
  initialMenus,
  header,
  footer,
  site,
  targets,
}: {
  available: boolean
  initialMenus: Record<string, Menu>
  header: Header | null
  footer: { settings: Record<string, unknown> } | null
  site: { id: string; name: string } | null
  targets: { customPages: { key: string; name: string }[]; products: LinkTargetProduct[]; collections: LinkTargetCollection[] }
}) {
  const [menus, setMenus] = React.useState<Record<string, Menu>>(initialMenus)
  const [state, setState] = React.useState<SaveState>("idle")
  const [error, setError] = React.useState<string | null>(null)
  const linkTargets = React.useMemo(() => storeLinkTargets(targets), [targets])

  /* What the store has, as the server cleans it: a link still being typed is kept on screen, not saved. */
  const json = React.useMemo(() => JSON.stringify(cleanMenus(menus)), [menus])
  const synced = React.useRef(JSON.stringify(cleanMenus(initialMenus)))
  React.useEffect(() => {
    if (!available || json === synced.current) return
    setState("saving")
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/website-builder/menus", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ menus: JSON.parse(json) }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          setError(body?.error || "Could not save the menus. Try again.")
          setState("error")
          return
        }
        synced.current = json
        setError(null)
        setState("saved")
      } catch {
        setError("You're offline. Your changes save when you're back.")
        setState("error")
      }
    }, SAVE_AFTER_MS)
    return () => window.clearTimeout(t)
  }, [json, available])

  /* Leaving with a change not yet sent asks first. */
  React.useEffect(() => {
    const pending = state === "saving" || state === "error"
    if (!pending) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [state])

  const editorHref = site ? `/website-builder/editor/${site.id}?settings=navigation` : null
  const choices = menuChoices(menus, header)
  const titleOf = (handle: string) => choices.find((c) => c.handle === handle)?.title ?? null
  const str = (v: unknown) => (typeof v === "string" ? v : "")
  const placements: { where: string; menu: string | null }[] = [
    ...(header ? [{ where: "Header", menu: titleOf(headerMenuHandle(menus, header)) }] : []),
    ...(footer
      ? [
          { where: "Footer, first column", menu: titleOf(str(footer.settings.menu)) },
          { where: "Footer, second column", menu: titleOf(str(footer.settings.menu_2)) },
        ]
      : []),
  ]

  return (
    <div className="h-full overflow-y-auto page-scroll bg-[#f8f9fa]">
      <div className="app-page-enter mx-auto max-w-[880px] app-gutter py-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/app/website-builder"
              onClick={() => startNavigationLoading()}
              aria-label="Back to Website"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e5e7eb] bg-white text-[#4b5563] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors duration-150 hover:bg-[#f8f9fa] hover:text-[#1a1a2e]"
            >
              <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </Link>
            <h1 className="truncate text-[24px] font-bold tracking-tight text-[#1a1a2e] sm:text-[28px]">Navigation</h1>
          </div>
          {available && (
            <span
              aria-live="polite"
              data-nav-save-state={state}
              className={cn("shrink-0 text-[13px] tabular-nums", state === "error" ? "text-[#b42318]" : "text-[#6b7280]")}
            >
              {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? "Not saved" : ""}
            </span>
          )}
        </div>
        <p className="mt-2 max-w-[600px] text-[14px] leading-relaxed text-[#6b7280]">
          Menus are the links in your header and footer. They belong to your store, so every theme shows the same ones, and a change goes live right away.
        </p>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-[#fecdca] bg-[#fef3f2] px-3.5 py-2.5 text-[13.5px] text-[#b42318]">
            {error}
          </p>
        )}

        {available ? (
          <section className="mt-6 rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] md:p-5" data-nav-page-menus="">
            <LinkTargetsProvider targets={linkTargets}>
              <MenusEditor plain value={menus} onChange={setMenus} header={header} onLinkHeader={() => {}} />
            </LinkTargetsProvider>
          </section>
        ) : (
          <section className="mt-6 rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]" data-nav-page-unavailable="">
            <p className="text-[14.5px] font-medium text-[#1a1a2e]">Menus are kept with your theme for now</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-[#6b7280]">
              Until menus are switched on for your whole store, edit them in the builder, under Navigation next to Pages.
            </p>
            {editorHref && (
              <Link href={editorHref} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1a1a2e] px-3.5 text-[14px] font-medium text-white hover:opacity-90">
                Open the builder
              </Link>
            )}
          </section>
        )}

        {placements.length > 0 && (
          <section className="mt-5 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]" data-nav-page-placements="">
            <div className="flex items-center justify-between gap-3 border-b border-[#f0f1f3] px-4 py-3 md:px-5">
              <h2 className="text-[14px] font-semibold text-[#1a1a2e]">Where menus show</h2>
              {editorHref && (
                <Link href={editorHref} className="inline-flex items-center gap-1 text-[13px] font-medium text-[#4b5563] hover:text-[#1a1a2e]">
                  Change in the builder
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              )}
            </div>
            <ul className="divide-y divide-[#f0f1f3]">
              {placements.map((p) => (
                <li key={p.where} className="flex items-center justify-between gap-4 px-4 py-3 text-[14px] md:px-5">
                  <span className="text-[#4b5563]">{p.where}</span>
                  <span className={cn("truncate font-medium", p.menu ? "text-[#1a1a2e]" : "text-[#9ca3af]")}>{p.menu ?? "None"}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
