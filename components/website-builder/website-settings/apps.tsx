"use client"

/**
 * ===========================================================================
 *  APPS AND INTEGRATIONS, FROM THE WEBSITE'S OWN SETTINGS
 * ===========================================================================
 * The store's installed apps and integrations (the same read as the
 * dashboard's rail, app/api/store/integrations/installed), so the website's
 * editor shows what is running on the site and where to manage each one,
 * without hunting for it in the dashboard. Each row opens its own page in
 * Integrations, in a new tab, so the editor and its unsaved work stay put.
 * Installing and settings live there: one place to change them, two to see
 * them.
 */
import { useEffect, useState } from "react"
import { Card, Lead, PageTitle, Row, buttonClass } from "./parts"
import type { SettingsContext } from "./types"
import { tt } from "@/lib/i18n/text"
import { Mark } from "@/components/app/settings/integration-mark"

type Installed = { id: string; name: string; logo?: string | null; needsAttention: boolean }

export function AppsSettings({ ctx: _ctx }: { ctx: SettingsContext }) {
  const [list, setList] = useState<Installed[] | null>(null)
  useEffect(() => {
    let live = true
    fetch("/api/store/integrations/installed", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { installed?: Installed[] } | null) => {
        if (live) setList(Array.isArray(d?.installed) ? d!.installed! : [])
      })
      .catch(() => live && setList([]))
    return () => {
      live = false
    }
  }, [])

  return (
    <div data-website-apps="">
      <PageTitle
        aside={
          <a href="/app/integrations" target="_blank" rel="noopener" className={buttonClass}>
            {tt("Browse integrations")}
          </a>
        }
      >
        {tt("Apps and integrations")}
      </PageTitle>
      <Lead>{tt("Installed on your store and running on this website.")}</Lead>
      <Card>
        {list === null ? (
          <div className="h-[72px]" aria-busy />
        ) : list.length === 0 ? (
          <Row label={tt("Nothing installed yet")} hint={tt("Reviews, tracking, email marketing and more are in Integrations.")} />
        ) : (
          list.map((i) => (
            <Row
              key={i.id}
              inline
              label={
                <span className="flex items-center gap-3">
                  {/* The mark the dashboard draws (integration-mark): Storelib's own apps as their tile, a logo that fails as its initial. */}
                  <Mark item={{ id: i.id, name: i.name, logo: i.logo ?? null }} size={28} />
                  <span className="min-w-0 truncate">{i.name}</span>
                </span>
              }
              hint={i.needsAttention ? tt("Needs attention") : undefined}
            >
              <a href={`/app/integrations?integration=${encodeURIComponent(i.id)}`} target="_blank" rel="noopener" className={buttonClass} data-website-app={i.id}>
                {tt("Manage")}
              </a>
            </Row>
          ))
        )}
      </Card>
    </div>
  )
}
