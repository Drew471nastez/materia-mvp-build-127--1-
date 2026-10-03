"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { PAGE_DESCRIPTION_MAX, PAGE_TITLE_MAX, typedPageSeo, withPageSeo } from "@/lib/website-builder/page-seo"
import { Badge, Card, Counter, GOES_LIVE, PageTitle, Row, Toggle, buttonClass, inputClass, textAreaClass } from "./parts"
import type { SettingsContext, SitePage } from "./types"

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
  const siteDescription = str(ctx.settings.seo_description) || `Visit ${brand}'s website on Storelib`

  return (
    <>
      <PageTitle aside={<button type="button" onClick={ctx.onAddPage} className={buttonClass}>Add page</button>}>
        Pages
      </PageTitle>

      <Card title="Pages" footer={GOES_LIVE}>
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

      <Card title="Navigation">
        <Row label="Menus and links" hint="The header's links, the footer's columns and every menu.">
          <button type="button" onClick={() => ctx.go("navigation")} className={buttonClass}>
            Edit navigation
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
  const set = (patch: { title?: string; description?: string; hidden?: boolean }) =>
    ctx.onSettingChange("page_seo", withPageSeo(ctx.settings, page.key, patch))
  const id = `wb-page-seo-${page.key}`

  return (
    <div>
      <Row
        label={
          <span className="flex flex-wrap items-center gap-2">
            {page.name}
            {home && <Badge tone="neutral">Homepage</Badge>}
            {seo.hidden && <Badge tone="attention">Hidden from search</Badge>}
          </span>
        }
        hint={page.path}
      >
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          {home ? (
            <button type="button" onClick={() => ctx.go("seo")} className={buttonClass}>
              Search
            </button>
          ) : (
            <button type="button" onClick={onOpen} aria-expanded={open} aria-controls={id} className={buttonClass}>
              Search
              <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")} />
            </button>
          )}
          <button type="button" onClick={() => ctx.onEditPage(page.key)} className={buttonClass}>
            Edit
          </button>
        </div>
      </Row>

      {!home && open && (
        <div id={id} className="wb-settings-in space-y-4 border-t border-white/[0.06] bg-white/[0.02] px-4 py-4 md:px-6">
          {/* What the result will say, from the same fallbacks the live page uses. */}
          <div className="rounded-xl bg-white p-4 text-left" aria-label="Search result preview">
            <p className="truncate text-[12.5px] text-[#4d5156]">{`${ctx.websiteUrlDisplay}${page.path === "/" ? "" : page.path}`}</p>
            <p className="mt-0.5 truncate text-[17px] leading-snug text-[#1a0dab]">{seo.title.trim() || defaults.title}</p>
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-[#4d5156]">{seo.description.trim() || defaults.description}</p>
          </div>

          <label className="block">
            <span className="flex items-baseline justify-between gap-3 text-[14px] font-medium text-white">
              Title
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
              Description
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

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-white">Show in search engines</p>
              <p className="mt-0.5 text-[13px] leading-snug text-white/45">Off keeps this page out of Google and out of your sitemap.</p>
            </div>
            <Toggle checked={!seo.hidden} onChange={(on) => set({ hidden: !on })} label={`Show ${page.name} in search engines`} />
          </div>
        </div>
      )}
    </div>
  )
}
