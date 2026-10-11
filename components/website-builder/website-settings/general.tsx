"use client"

import { useEffect, useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { WbImagePicker } from "@/components/website-builder/editor/image-picker"
import { SITE_LANGUAGES, siteLanguage } from "@/lib/website-builder/site-language"
import { faviconOf } from "@/lib/website-builder/favicon-sync"
import { AddressValue, Badge, Card, ErrorNote, GOES_LIVE, PageTitle, Row, buttonClass, inputClass, textLinkClass } from "./parts"
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
          <div className="dark max-w-[220px]">
            <WbImagePicker
              value={favicon}
              onChange={(url) => ctx.onSettingChange("favicon_url", url ?? "")}
              aspectRatio="favicon"
              folder="logos"
            />
          </div>
        </Row>
        <Row label="Language" hint="The language your pages are written in. Screen readers and translation use it." htmlFor="wb-site-language">
          <select
            id="wb-site-language"
            value={language}
            onChange={(e) => ctx.onSettingChange("site_language", e.target.value)}
            className={inputClass}
          >
            <option value="">Not set</option>
            {SITE_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </Row>
      </Card>
      {error && <ErrorNote>{error}</ErrorNote>}
    </>
  )
}
