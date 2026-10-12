"use client"

import { useEffect, useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { WbImagePicker } from "@/components/website-builder/editor/image-picker"
import { SITE_LANGUAGES, siteLanguage } from "@/lib/website-builder/site-language"
import { faviconOf } from "@/lib/website-builder/favicon-sync"
import { siteTabTitle } from "@/lib/website-builder/tab-title"
import { siteIconUrl } from "@/lib/website-builder/site-icon"
import { storeNameFor } from "./seo"
import { AddressValue, Badge, BrowserTabPreview, Card, ErrorNote, GOES_LIVE, PageTitle, Row, buttonClass, inputClass, textLinkClass } from "./parts"
import type { SettingsContext } from "./types"
import { cn } from "@/lib/utils"

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
      if (!res.ok) throw new Error(json?.error || "Could not save the name")
      ctx.onRenamed(json?.install?.name ?? draft.trim())
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1600)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the name")
    } finally {
      setSaving(false)
    }
  }

  /* The site's favicon, or an imported theme's own when the site has none yet (lib/website-builder/favicon-sync.ts). */
  const favicon = faviconOf(ctx.settings as Record<string, unknown>) || undefined
  const language = siteLanguage(ctx.settings) ?? ""
  /* The home page's tab, as the live site writes it (lib/website-builder/tab-title.ts). */
  const homeTitle = siteTabTitle({ page: { kind: "home" }, storeName: storeNameFor(ctx), siteTitle: typeof ctx.settings.seo_title === "string" ? ctx.settings.seo_title : "" })

  return (
    <>
      <PageTitle>General</PageTitle>

      <Card>
        <Row label="Website name" hint="Only you see it, in the builder and your library." htmlFor="wb-website-name">
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
              {saving ? "Saving" : saved ? "Saved" : "Save"}
            </button>
          </div>
        </Row>
        <Row
          label="Address"
          hint={
            <>
              <button type="button" onClick={() => ctx.go("domains")} className={textLinkClass}>
                Change address
              </button>
            </>
          }
        >
          <AddressValue url={ctx.websiteUrl} display={ctx.websiteUrlDisplay} />
        </Row>
        <Row label="Status" hint={<button type="button" onClick={() => ctx.go("publishing")} className={textLinkClass}>Publishing</button>} inline>
          {ctx.live ? <Badge tone="live">Live</Badge> : <Badge tone="neutral">Draft</Badge>}
        </Row>
      </Card>

      <Card footer={GOES_LIVE}>
        <Row label="Favicon" hint="The small icon in a browser tab. A square picture, 64 × 64 or larger." stack>
          {/* A small tile, its actions, and the tab it ends up in, on one row (image-picker.tsx, layout "icon"). */}
          <div className="dark">
            <WbImagePicker
              value={favicon}
              onChange={(url) => ctx.onSettingChange("favicon_url", url ?? "")}
              aspectRatio="favicon"
              layout="icon"
              folder="logos"
              library={false}
              aside={<BrowserTabPreview icon={favicon || siteIconUrl(ctx.settings as Record<string, unknown>, ctx.header ? [ctx.header] : []) || undefined} title={homeTitle} className="md:ml-auto" />}
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
          label="Languages"
          hint={
            <a href="/app/settings?tab=markets" className={textLinkClass}>
              Manage in Markets and languages
            </a>
          }
          inline
        >
          <span className="text-[13px] text-white/70">{language ? (SITE_LANGUAGES.find((l) => l.code === language)?.label ?? language) : "Set for your store"}</span>
        </Row>
      </Card>
      {error && <ErrorNote>{error}</ErrorNote>}
    </>
  )
}
