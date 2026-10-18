"use client"

import { useEffect, useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { WbImagePicker } from "@/components/website-builder/editor/image-picker"
import { siteLanguage } from "@/lib/website-builder/site-language"
import { faviconOf } from "@/lib/website-builder/favicon-sync"
import { AddressValue, Badge, Card, ErrorNote, GOES_LIVE, PageTitle, Row, buttonClass, inputClass, textLinkClass } from "./parts"
import type { SettingsContext } from "./types"
import { cn } from "@/lib/utils"
import { activeLocale, tt } from "@/lib/i18n/text"
import { languageName } from "@/lib/markets/locales"
import { currencyWord } from "@/lib/markets/money"
import { countryName } from "@/lib/checkout/countries"
import { PreviewLocaleSelects, hasPreviewChoices } from "@/components/website-builder/preview-locale-switch"

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
          {/*
            A small tile and its actions: upload, drop, replace, remove
            (image-picker.tsx, layout "icon"). No browser tab drawn beside it
            (the owner: the tile already shows the icon). The one value the
            builder's Branding panel and an imported theme's own settings
            write too (lib/website-builder/favicon-sync.ts), through the same
            writer, so a change in either shows here at once.
          */}
          <div className="dark">
            <WbImagePicker
              value={favicon}
              onChange={(url) => ctx.onSettingChange("favicon_url", url ?? "")}
              aspectRatio="favicon"
              layout="icon"
              folder="logos"
            />
          </div>
        </Row>
      </Card>

      {/*
        LANGUAGES AND CURRENCIES, AS VISITORS GET THEM. What the website opens
        in (its default language and the store's currency) and what else a
        visitor can switch to, read from Settings › Languages and Store
        details, where they are changed. The builder's canvas opens on the
        defaults, and the theme's own selectors switch it, as on the website.
      */}
      <LocalizationCard ctx={ctx} fallbackLanguage={language} />
      {error && <ErrorNote>{error}</ErrorNote>}
    </>
  )
}

type MarketsAnswer = {
  ready?: boolean
  baseCurrency?: string
  localization?: {
    defaultLanguage?: string
    languages?: { code: string; published?: boolean }[]
    markets?: { id: string; name?: string; currency?: string | null; countries?: string[]; active?: boolean; primary?: boolean }[]
  }
}

function LocalizationCard({ ctx, fallbackLanguage }: { ctx: SettingsContext; fallbackLanguage: string }) {
  const [data, setData] = useState<MarketsAnswer | null>(null)
  useEffect(() => {
    let live = true
    void fetch("/api/store/markets", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<MarketsAnswer>) : null))
      .then((d) => {
        if (live) setData(d ?? {})
      })
      .catch(() => {
        if (live) setData({})
      })
    return () => {
      live = false
    }
  }, [])
  const loc = data?.localization
  const defaultLanguage = loc?.defaultLanguage || fallbackLanguage
  const others = (loc?.languages ?? []).filter((l) => l.code !== defaultLanguage)
  const currency = data?.baseCurrency ?? ""
  const markets = (loc?.markets ?? []).filter((m) => !m.primary && m.active !== false && m.currency && m.currency !== currency)
  const word = currency ? currencyWord(currency) : null
  const manage = (href: string) => (
    <button type="button" onClick={() => ctx.onNavigate(href)} className={textLinkClass}>
      {tt("Change")}
    </button>
  )
  const value = (text: string) => <span className="text-[13px] text-white/70">{text}</span>
  return (
    <Card title={tt("Languages and currencies")} footer={tt("Visitors open your website in your default language and store currency, and switch with your theme's own selectors.")}>
      <div data-wb-localization="">
        {/* WHAT THE BUILDER SHOWS: the canvas's language and prices, and the language the sidebar's text settings write. Never the live website. */}
        {ctx.preview && hasPreviewChoices(ctx.preview) ? (
          <Row label={tt("Show the editor in")} hint={tt("Only changes the builder. In another language, the sidebar edits that language's text.")} stack>
            <PreviewLocaleSelects model={ctx.preview} tone="dark" />
          </Row>
        ) : null}
        <Row label={tt("Default language")} hint={manage("/app/settings?tab=markets")} inline>
          {value(data === null ? "" : defaultLanguage ? languageName(defaultLanguage, activeLocale()) : tt("Set for your store"))}
        </Row>
        <Row label={tt("Other languages")} hint={manage("/app/settings?tab=markets")} inline>
          {value(data === null ? "" : others.length ? others.map((l) => (l.published ? languageName(l.code, activeLocale()) : tt("{language} (hidden)", { language: languageName(l.code, activeLocale()) }))).join(", ") : tt("None"))}
        </Row>
        <Row label={tt("Store currency")} hint={manage("/app/settings?tab=markets")} inline>
          {value(currency ? (word ? `${currency} (${word})` : currency) : "")}
        </Row>
        <Row label={tt("More currencies")} hint={manage("/app/settings?tab=markets")} inline>
          {value(data === null ? "" : markets.length ? markets.map((m) => `${m.currency}${m.countries?.length ? ` · ${m.countries.length <= 2 ? m.countries.map(countryName).join(", ") : tt("{length} countries", { length: m.countries.length })}` : ""}`).join("; ") : tt("None"))}
        </Row>
      </div>
    </Card>
  )
}
