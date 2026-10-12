"use client"

import { useEffect, useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { WbImagePicker } from "@/components/website-builder/editor/image-picker"
import { SITE_LANGUAGES, siteLanguage } from "@/lib/website-builder/site-language"
import { faviconOf } from "@/lib/website-builder/favicon-sync"
import { AddressValue, Badge, Card, ErrorNote, GOES_LIVE, PageTitle, Row, buttonClass, inputClass, textLinkClass } from "./parts"
import type { SettingsContext } from "./types"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

export function GeneralSettings({ ctx }: { ctx: SettingsContext }) {
  const [draft, setDraft] = useState(ctx.name)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setDraft(ctx.name), [ctx.name])

  const dirty = draft.trim() !== ctx.name.trim() && draft.trim().length > 0

  const save = async () => {
    if (!dirty || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/website-builder/themes/${ctx.installId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || tt("Could not save the name"))
      ctx.onRenamed(json?.install?.name ?? draft.trim())
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1600)
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("Could not save the name"))
    } finally {
      setSaving(false)
    }
  }

  /* The site's favicon, or an imported theme's own when the site has none yet (lib/website-builder/favicon-sync.ts). */
  const favicon = faviconOf(ctx.settings as Record<string, unknown>) || undefined
  const language = siteLanguage(ctx.settings) ?? ""

  return (
    <>
      <PageTitle>{tt("General")}</PageTitle>

      <Card>
        <Row label={tt("Website name")} hint={tt("Only you see it, in the builder and your library.")} htmlFor="wb-website-name">
          <div className="flex items-center gap-2">
            <input
              id="wb-website-name"
              value={draft}
              maxLength={80}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save()
              }}
              className={inputClass}
            />
            <button type="button" onClick={() => void save()} disabled={!dirty || saving} className={cn(buttonClass, "md:h-10")}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
              {saving ? tt("Saving") : saved ? tt("Saved") : tt("Save")}
            </button>
          </div>
        </Row>
        <Row
          label={tt("Address")}
          hint={
            <>
              <button type="button" onClick={() => ctx.go("domains")} className={textLinkClass}>
                {tt("Change address")}
              </button>
            </>
          }
        >
          <AddressValue url={ctx.websiteUrl} display={ctx.websiteUrlDisplay} />
        </Row>
        <Row label={tt("Status")} hint={<button type="button" onClick={() => ctx.go("publishing")} className={textLinkClass}>{tt("Publishing")}</button>} inline>
          {ctx.live ? <Badge tone="live">{tt("Live")}</Badge> : <Badge tone="neutral">{tt("Draft")}</Badge>}
        </Row>
      </Card>

      <Card footer={GOES_LIVE}>
        <Row label={tt("Favicon")} hint={tt("The small icon in a browser tab. A square picture, 64 × 64 or larger.")} stack>
          <div className="dark max-w-[220px]">
            <WbImagePicker
              value={favicon}
              onChange={(url) => ctx.onSettingChange("favicon_url", url ?? "")}
              aspectRatio="favicon"
              folder="logos"
              library={false}
            />
          </div>
        </Row>
      </Card>

      {/*
        ONE PLACE FOR LANGUAGES. The website's language used to be chosen
        here as well as in Settings › Markets and languages, two settings for
        one thing. It is set there now, with the website's other languages
        and their translations; an old choice made here is still read as the
        default until that page is saved.
      */}
      <Card>
        <Row
          label={tt("Languages")}
          hint={
            <a href="/app/settings?tab=markets" className={textLinkClass}>
              {tt("Manage in Markets and languages")}
            </a>
          }
          inline
        >
          <span className="text-[13px] text-white/70">{language ? (SITE_LANGUAGES.find((l) => l.code === language)?.label ?? language) : tt("Set for your store")}</span>
        </Row>
      </Card>
      {error && <ErrorNote>{error}</ErrorNote>}
    </>
  )
}
