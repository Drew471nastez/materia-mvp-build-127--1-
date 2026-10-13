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
      <Lead>{tt("What is installed on your store and running on this website. Each one opens in a new tab to change its settings.")}</Lead>
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
                  {i.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.logo} alt="" className="h-7 w-7 shrink-0 rounded-md bg-white object-contain p-0.5" loading="lazy" decoding="async" />
                  ) : (
                    <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/10 text-[12px] font-semibold">
                      {i.name.charAt(0)}
                    </span>
                  )}
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
