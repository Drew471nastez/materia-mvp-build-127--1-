"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Reveal } from "@/components/ui/reveal"
import { cn } from "@/lib/utils"
import { PAGE_DESCRIPTION_MAX, PAGE_TITLE_MAX, typedPageSeo, withPageSeo } from "@/lib/website-builder/page-seo"
import { WbImagePicker } from "@/components/website-builder/editor/image-picker"
import { Badge, Card, Counter, GOES_LIVE, PageTitle, Row, SearchResultPreview, Toggle, buttonClass, inputClass, textAreaClass } from "./parts"
import type { SettingsContext, SitePage } from "./types"
import { tt } from "@/lib/i18n/text"

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")

/**
 * The site's pages, and each one's search result.
 *
 * A page's sections are edited in the builder, which has the preview, the
 * undo and the save, so Edit goes there. What a page says to a search engine
 * is edited here, in place: its title, its description, and whether it is
 * listed at all (lib/website-builder/page-seo.ts). The home page's are the
 * site's own, in SEO & Social.
 */
export function PageSettings({ ctx }: { ctx: SettingsContext }) {
  const [open, setOpen] = useState<string | null>(null)
  const handle = ctx.websiteUrlDisplay.split(".")[0] || "Storelib"
  const brand = str(ctx.settings.brand_name) || handle
  const siteDescription = str(ctx.settings.seo_description) || tt("Visit {brand}'s website on Storelib", { brand })

  return (
    <>
      <PageTitle aside={<button type="button" onClick={ctx.onAddPage} className={buttonClass}>{tt("Add page")}</button>}>
        {tt("Pages")}
      </PageTitle>

      <Card footer={GOES_LIVE}>
        {ctx.pages.map((page) => (
          <PageRow
            key={page.key}
            ctx={ctx}
            page={page}
            open={open === page.key}
            onOpen={() => setOpen((o) => (o === page.key ? null : page.key))}
            defaults={{ title: `${page.name} | ${brand}`, description: siteDescription }}
          />
        ))}
      </Card>

      <Card title={tt("Navigation")}>
        <Row label={tt("Menus and links")} hint={tt("The header's links, the footer's columns and every menu.")}>
          <button type="button" onClick={() => ctx.go("navigation")} className={buttonClass}>
            {tt("Edit navigation")}
          </button>
        </Row>
      </Card>
    </>
  )
}

function PageRow({
  ctx,
  page,
  open,
  onOpen,
  defaults,
}: {
  ctx: SettingsContext
  page: SitePage
  open: boolean
  onOpen: () => void
  defaults: { title: string; description: string }
}) {
  const home = page.key === "home"
  const seo = typedPageSeo(ctx.settings, page.key)
  const set = (patch: { title?: string; description?: string; image?: string; hidden?: boolean }) =>
    ctx.onSettingChange("page_seo", withPageSeo(ctx.settings, page.key, patch))
  const id = `wb-page-seo-${page.key}`

  return (
    <div data-page-row={page.key}>
      {/* ONE LINE A PAGE. The name and address are the press that opens the
          page's search result in place (Home's goes to SEO & Social, where
          the site's own is edited); Edit opens it in the builder. It was a
          Search button and an Edit button under every name on a phone, two
          slabs a page. */}
      <div className="flex items-center gap-2 pr-4 md:pr-6">
        <button
          type="button"
          onClick={home ? () => ctx.go("seo") : onOpen}
          aria-expanded={home ? undefined : open}
          aria-controls={home ? undefined : id}
          className="group flex min-h-[64px] min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left transition-colors md:min-h-[60px] md:pl-6 [-webkit-tap-highlight-color:transparent]"
        >
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate text-[15px] font-medium text-white md:text-[14.5px]">{page.name}</span>
              {home && <Badge tone="neutral">{tt("Homepage")}</Badge>}
              {seo.hidden && <Badge tone="attention">{tt("Hidden from search")}</Badge>}
            </span>
            <span className="mt-0.5 block truncate text-[13px] text-white/45">{page.path}</span>
          </span>
          {home ? (
            <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-white/35 transition-colors group-hover:text-white/70" />
          ) : (
            <ChevronDown
              aria-hidden
              className={cn(
                "h-4 w-4 shrink-0 text-white/35 transition-[transform,rotate,color] duration-200 ease-out group-hover:text-white/70 motion-reduce:transition-none",
                open && "rotate-180 text-white/70",
              )}
            />
          )}
        </button>
        <button type="button" onClick={() => ctx.onEditPage(page.key)} className={buttonClass}>
          {tt("Edit")}
        </button>
      </div>

      {!home && (
        <Reveal open={open} id={id} className="border-t border-white/[0.06] bg-white/[0.02]" data-page-seo={page.key}>
        <div className="space-y-4 px-4 py-4 md:px-6">
          {/* What the result will say, from the same fallbacks the live page uses. */}
          <SearchResultPreview compact address={`${ctx.websiteUrlDisplay}${page.path === "/" ? "" : page.path}`} title={seo.title.trim() || defaults.title} description={seo.description.trim() || defaults.description} />

          <label className="block">
            <span className="flex items-baseline justify-between gap-3 text-[14px] font-medium text-white">
              {tt("Title")}
              <Counter value={seo.title} max={PAGE_TITLE_MAX} />
            </span>
            <input
              value={seo.title}
              maxLength={120}
              placeholder={defaults.title}
              onChange={(e) => set({ title: e.target.value })}
              className={cn(inputClass, "mt-1.5 md:w-full")}
            />
          </label>

          <label className="block">
            <span className="flex items-baseline justify-between gap-3 text-[14px] font-medium text-white">
              {tt("Description")}
              <Counter value={seo.description} max={PAGE_DESCRIPTION_MAX} />
            </span>
            <textarea
              value={seo.description}
              maxLength={320}
              rows={3}
              placeholder={defaults.description}
              onChange={(e) => set({ description: e.target.value })}
              className={cn(textAreaClass, "mt-1.5 leading-snug")}
            />
          </label>

          {/* The picture a link to this page shows when it is shared; the site's own social image when there is none. */}
          <div>
            <p className="text-[14px] font-medium text-white">{tt("Social image")}</p>
            <p className="mt-0.5 text-[13px] leading-snug text-white/45">{tt("Shown when a link to this page is shared. Leave it empty to use the site's.")}</p>
            <div className="dark mt-2 max-w-[420px]">
              <WbImagePicker value={seo.image || undefined} onChange={(url) => set({ image: url ?? "" })} layout="row" folder="logos" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-white">{tt("Show in search engines")}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-white/45">{tt("Off keeps this page out of Google and out of your sitemap.")}</p>
            </div>
            <Toggle checked={!seo.hidden} onChange={(on) => set({ hidden: !on })} label={tt("Show {name} in search engines", { name: page.name })} />
          </div>
        </div>
        </Reveal>
      )}
    </div>
  )
}
