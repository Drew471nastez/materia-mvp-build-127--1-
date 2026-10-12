"use client"

import { useState } from "react"
import { WbImagePicker } from "@/components/website-builder/editor/image-picker"
import { BrowserTabPreview, Card, Counter, GOES_LIVE, PageTitle, Row, SearchResultPreview, Toggle, inputClass, textAreaClass } from "./parts"
import { siteStoreName, siteTabTitle } from "@/lib/website-builder/tab-title"
import { siteIconUrl } from "@/lib/website-builder/site-icon"
import { faviconOf } from "@/lib/website-builder/favicon-sync"
import type { SettingsContext } from "./types"
import { tt } from "@/lib/i18n/text"

const str = (v: unknown) => (typeof v === "string" ? v : "")

/** The store's name as the live site says it: its brand name, else Store details', else the person's (lib/website-builder/tab-title.ts). */
export function storeNameFor(ctx: SettingsContext): string {
  const handle = ctx.websiteUrlDisplay.split(".")[0] || ""
  return siteStoreName({ brandName: ctx.settings.brand_name, storeName: ctx.storeName, displayName: ctx.displayName, handle })
}

/**
 * The same rule the published site uses (lib/website-builder/tab-title.ts,
 * read by app/(site)/w/[username]/render-site.tsx and an imported theme's
 * live page), so the preview is what the tab and a search result will
 * actually say rather than what the fields happen to hold.
 */
function previewOf(ctx: SettingsContext) {
  const store = storeNameFor(ctx)
  return {
    store,
    title: siteTabTitle({ page: { kind: "home" }, storeName: store, siteTitle: str(ctx.settings.seo_title) }),
    /* What another page's tab reads like, said under the field. */
    example: siteTabTitle({ page: { kind: "page", name: "About" }, storeName: store }),
    /* What the site itself serves when none is written (app/(site)/w/[username]/render-site.tsx), word for word. i18n-ignore-next-line */
    description: str(ctx.settings.seo_description).trim() || `Visit ${store}'s website on Storelib`,
  }
}

/** Indexing is on unless it was switched off, the way theme-metadata reads it. */
function indexable(v: unknown): boolean {
  if (v === false) return false
  if (typeof v === "string") return !/noindex/i.test(v)
  return true
}

export function SeoSettings({ ctx }: { ctx: SettingsContext }) {
  const title = str(ctx.settings.seo_title)
  const description = str(ctx.settings.seo_description)
  const image = str(ctx.settings.seo_og_image) || undefined
  const listed = indexable(ctx.settings.seo_robots)
  const preview = previewOf(ctx)

  return (
    <>
      <PageTitle>{tt("SEO & Social")}</PageTitle>

      {/* What a search result looks like, drawn from the same fallbacks the
          live page uses, in a search page's own dark colours. */}
      <div className="mt-5 flex flex-col gap-3 md:mt-6">
        {/* The home page's browser tab, exactly as it will read. */}
        <BrowserTabPreview icon={faviconOf(ctx.settings as Record<string, unknown>) || siteIconUrl(ctx.settings as Record<string, unknown>, ctx.header ? [ctx.header] : []) || undefined} title={preview.title} />
        <SearchResultPreview address={ctx.websiteUrlDisplay || "yourname.storelib.com"} title={preview.title} description={preview.description} />
      </div>

      <Card footer={GOES_LIVE}>
        <Row label={tt("Site title")} hint={tt("Your home page's browser tab and search result. Leave it empty to use your store name.")} stack htmlFor="wb-seo-title">
          <div className="flex flex-col gap-1.5">
            <input
              id="wb-seo-title"
              value={title}
              maxLength={120}
              placeholder={preview.store}
              onChange={(e) => ctx.onSettingChange("seo_title", e.target.value)}
              className={inputClass + " md:w-full"}
            />
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-[12.5px] text-white/45" data-tab-example="">{tt("Other pages read like “{example}”", { example: preview.example })}</p>
              <Counter value={title} max={60} />
            </div>
          </div>
        </Row>
        <Row label={tt("Meta description")} hint={tt("The line under the title. One or two sentences about what you sell.")} stack htmlFor="wb-seo-description">
          <div className="flex flex-col gap-1.5">
            <textarea
              id="wb-seo-description"
              value={description}
              maxLength={320}
              rows={3}
              placeholder={preview.description}
              onChange={(e) => ctx.onSettingChange("seo_description", e.target.value)}
              className={textAreaClass}
            />
            <Counter value={description} max={160} />
          </div>
        </Row>
        {/*
          WHAT A SHARED LINK LOOKS LIKE. The picture on top, then the address,
          title and description, the way Messages, WhatsApp and X draw a
          link. "Share card" (large or small picture) is gone: every network
          that matters draws the large one, and a choice nobody can judge
          from here is a choice to remove. A value saved before still reads
          (theme-metadata.ts).
        */}
        <Row label={tt("Social image")} hint={tt("Shown when a link to your website is shared. 1200 × 630 works everywhere.")} stack>
          <div className="flex max-w-[420px] flex-col gap-3">
            <SharePreview image={image} title={preview.title} description={preview.description} address={ctx.websiteUrlDisplay} />
            <div className="dark">
              <WbImagePicker value={image} onChange={(url) => ctx.onSettingChange("seo_og_image", url ?? "")} layout="row" folder="logos" />
            </div>
          </div>
        </Row>
        <Row
          label={tt("Search engines")}
          hint={listed ? tt("Google and others may list this website.") : tt("Search engines are asked not to list this website.")}
          inline
        >
          <Toggle checked={listed} onChange={(on) => ctx.onSettingChange("seo_robots", on)} label={tt("Let search engines list this website")} />
        </Row>
      </Card>
    </>
  )
}

/**
 * A link as a messaging app draws it. Without a picture of its own the live
 * site sends the logo, a hero picture or the creator's avatar
 * (render-site.tsx), so the empty box says that rather than looking broken.
 */
function SharePreview({ image, title, description, address }: { image?: string; title: string; description: string; address: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  const shown = image && failed !== image ? image : null
  return (
    /* A shared link as a messaging app draws it in its dark theme, on the page's own dark (it was a white card). */
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#1c1c1e] text-left" aria-label={tt("Shared link preview")} data-share-preview="">
      <div className="relative aspect-[1200/630] w-full bg-white/[0.04]">
        {shown ? (
          <img src={shown} alt="" className="absolute inset-0 h-full w-full object-cover" onError={() => setFailed(shown)} />
        ) : (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-[12.5px] text-white/45">
            {tt("No picture yet. Your logo or first hero picture is used instead.")}
          </p>
        )}
      </div>
      <div className="border-t border-white/[0.06] px-4 py-3">
        <p className="truncate text-[11.5px] uppercase tracking-wide text-white/40">{address || "yourname.storelib.com"}</p>
        <p className="mt-0.5 truncate text-[14px] font-semibold text-white/90">{title}</p>
        <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-white/55">{description}</p>
      </div>
    </div>
  )
}
