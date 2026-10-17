"use client"

/**
 * ===========================================================================
 *  STORELIB REVIEWS › WIDGETS
 * ===========================================================================
 * Every way the store's reviews can show on its website, each as it would
 * really look (lib/reviews/widgets/render.ts, with the store's own reviews;
 * samples, said as much, only until the first review), with Customize and
 * Add to website. Customize opens the widget's settings beside its preview
 * (./widget-customizer.tsx), where a look is saved under a name. Add to
 * website asks which page and where, then opens the website builder with
 * the widget placed there (app/app/reviews/widgets/add).
 *
 * The page is /app/reviews/widgets; `?widget=<type>&config=<id>` opens one
 * widget's customizer (the builder's "Edit this look" links here). Exported
 * as a component so the reviews management can show it as its Widgets tab.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { WIDGET_INFO, WIDGET_TYPES, isWidgetType, resolveWidgetSettings, type WidgetConfig, type WidgetSettings, type WidgetType } from "@/lib/reviews/widgets/config"
import { renderReviewWidget, type WidgetReviews } from "@/lib/reviews/widgets/render"
import { previewReviews } from "@/lib/reviews/widgets/preview-data"
import { defaultPlacement, type WidgetPage, type WidgetPlacement } from "@/lib/reviews/widgets/placement"
import { GUTTER, LIST_BAR, LIST_WIDTH, PaneBar, buttonPrimary, buttonSecondary, card } from "@/app/app/orders/order-parts"
import { Pill, usePill } from "@/app/app/coupons/coupon-parts"
import { WidgetPreview } from "./widget-preview"
import { WidgetCustomizer } from "./widget-customizer"

export interface WidgetsGalleryProps {
  /** What the page read on the server. Left out (the reviews management's Widgets tab), the gallery reads them itself from /api/reviews/widgets. */
  initialConfigs?: WidgetConfig[]
  ready?: boolean
  shopName?: string
  languages?: { defaultLanguage: string; others: string[] }
  /** Inside the reviews management's own frame: no page bar of its own. */
  embedded?: boolean
}

type Open = { type: WidgetType; configId: string | null } | null

/** The width each card's preview is laid out at: a line of stars large enough to read, a grid wide enough to be a grid. */
const CARD_WIDTH: Record<WidgetType, number> = {
  product_reviews: 680,
  star_badge: 360,
  rating_summary: 560,
  grid: 820,
  carousel: 820,
  testimonials: 820,
  media_wall: 760,
  marquee: 760,
  trust_badge: 420,
}

function readOpen(): Open {
  if (typeof window === "undefined") return null
  const q = new URLSearchParams(window.location.search)
  const w = q.get("widget")
  return isWidgetType(w) ? { type: w, configId: q.get("config") } : null
}

export function WidgetsGallery(props: WidgetsGalleryProps) {
  const { embedded = false } = props
  const [configs, setConfigs] = useState<WidgetConfig[]>(props.initialConfigs ?? [])
  const [meta, setMeta] = useState({ ready: props.ready ?? true, shopName: props.shopName ?? "", languages: props.languages ?? { defaultLanguage: "en", others: [] as string[] } })
  const { ready, shopName, languages } = meta
  /* Shown without the page's server read (a tab of the reviews management): the same, read here. */
  useEffect(() => {
    if (props.initialConfigs) return
    let live = true
    fetch("/api/reviews/widgets", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { configs?: WidgetConfig[]; ready?: boolean; shopName?: string; languages?: { defaultLanguage: string; others: string[] } } | null) => {
        if (!live || !j) return
        setConfigs(Array.isArray(j.configs) ? j.configs : [])
        setMeta((m) => ({ ready: j.ready ?? m.ready, shopName: j.shopName ?? m.shopName, languages: j.languages ?? m.languages }))
      })
      .catch(() => {})
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [reviews, setReviews] = useState<WidgetReviews | null>(null)
  const [appOn, setAppOn] = useState<boolean | null>(null)
  const [open, setOpenState] = useState<Open>(null)
  const [adding, setAdding] = useState<{ type: WidgetType; configId: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, say] = usePill()

  useEffect(() => {
    setOpenState(readOpen())
    const back = () => setOpenState(readOpen())
    window.addEventListener("popstate", back)
    return () => window.removeEventListener("popstate", back)
  }, [])
  const setOpen = useCallback((next: Open) => {
    const url = new URL(window.location.href)
    url.searchParams.delete("widget")
    url.searchParams.delete("config")
    if (next) {
      url.searchParams.set("widget", next.type)
      if (next.configId) url.searchParams.set("config", next.configId)
    }
    window.history.pushState(window.history.state, "", url.pathname + url.search)
    setOpenState(next)
    window.scrollTo({ top: 0 })
  }, [])

  /* The store's reviews, as the builder reads them: its own, or samples while it has none. */
  useEffect(() => {
    let live = true
    fetch("/api/reviews/storefront", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { reviews?: WidgetReviews } | null) => {
        if (live) setReviews(previewReviews(j?.reviews ?? null))
      })
      .catch(() => {})
    fetch("/api/store/reviews-app", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { settings?: { enabled?: boolean } } | null) => {
        if (live) setAppOn(j?.settings?.enabled === true)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const previews = useMemo(() => {
    const out = {} as Record<WidgetType, string>
    for (const t of WIDGET_TYPES) {
      const latest = configs.find((c) => c.type === t)
      out[t] = reviews ? renderReviewWidget({ type: t, settings: resolveWidgetSettings(t, latest?.settings), reviews, shopName, inEditor: true, uid: `g-${t}` }) : ""
    }
    return out
  }, [configs, reviews, shopName])

  const save = async ({ id, name, settings, type }: { id: string | null; name: string; settings: WidgetSettings; type: WidgetType }): Promise<WidgetConfig | null> => {
    setBusy(true)
    try {
      const res = await fetch(id ? `/api/reviews/widgets/${id}` : "/api/reviews/widgets", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ type, name, settings }),
      })
      const j = (await res.json().catch(() => ({}))) as { config?: WidgetConfig; error?: string }
      if (!res.ok || !j.config) {
        say(j.error || tt("That could not be saved. Try again in a moment."), "error")
        return null
      }
      const saved = j.config
      setConfigs((list) => [saved, ...list.filter((c) => c.id !== saved.id)])
      say(tt("Saved"))
      if (!id) setOpen({ type, configId: saved.id })
      return saved
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm(tt("Delete this look? Sections that use it go back to the widget's own look."))) return
    setBusy(true)
    try {
      const res = await fetch(`/api/reviews/widgets/${id}`, { method: "DELETE", credentials: "same-origin" })
      if (!res.ok) {
        say(tt("That could not be deleted. Try again in a moment."), "error")
        return
      }
      setConfigs((list) => list.filter((c) => c.id !== id))
      if (open) setOpen({ type: open.type, configId: null })
      say(tt("Deleted"))
    } finally {
      setBusy(false)
    }
  }

  const current = open ? configs.find((c) => c.id === open.configId && c.type === open.type) ?? null : null
  const sample = reviews?.sample === true

  const body = open ? (
    <WidgetCustomizer
      key={`${open.type}:${current?.id ?? "new"}`}
      type={open.type}
      config={current}
      configs={configs}
      reviews={reviews}
      shopName={shopName}
      languages={languages}
      ready={ready}
      busy={busy}
      onBack={() => setOpen(null)}
      onPick={(id) => setOpen({ type: open.type, configId: id })}
      onSave={(input) => save({ ...input, type: open.type })}
      onDelete={remove}
      onAdd={(type, configId) => setAdding({ type, configId })}
    />
  ) : (
    <div className="pb-24 md:pb-10">
      {sample ? (
        <p className="mb-3 rounded-xl bg-white px-3.5 py-2.5 text-[13px] text-[#4b5563] shadow-[0_0_0_1px_rgba(16,24,40,0.06)]" data-widgets-sample="">
          {tt("No reviews yet, so these previews use sample ones. Your website only ever shows your real reviews.")}
        </p>
      ) : null}
      {appOn === false ? (
        <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-[#fff8e6] px-3.5 py-2.5 text-[13px] text-[#5c4300]" data-widgets-app-off="">
          <span>{tt("Storelib Reviews is off, so widgets don't show on your website yet.")}</span>
          <a href="/app/integrations?integration=storelib-reviews" className="font-medium underline underline-offset-4">
            {tt("Turn it on")}
          </a>
        </p>
      ) : null}
      {!ready ? <p className="mb-3 rounded-xl bg-[#fff8e6] px-3.5 py-2.5 text-[13px] text-[#5c4300]">{tt("Saving looks needs the database update (SQL part 216). You can still add widgets with their own look.")}</p> : null}
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-widgets-gallery="">
        {WIDGET_TYPES.map((t) => {
          const info = WIDGET_INFO[t]
          const saved = configs.filter((c) => c.type === t)
          return (
            <li key={t} className={cn(card, "flex flex-col overflow-hidden")} data-widget-card={t}>
              <button type="button" onClick={() => setOpen({ type: t, configId: saved[0]?.id ?? null })} className="block border-b border-[#eef0f2] bg-[#f6f7f9] p-3 text-left" aria-label={tt("Customize {name}", { name: info.name })}>
                <div className="overflow-hidden rounded-lg bg-white shadow-[0_0_0_1px_rgba(16,24,40,0.05)]">
                  {previews[t] ? (
                    <WidgetPreview html={previews[t]} width={CARD_WIDTH[t]} boxHeight={200} label={info.name} />
                  ) : (
                    <div className="h-[200px] animate-pulse bg-[#f3f4f6]" />
                  )}
                </div>
              </button>
              <div className="flex flex-1 flex-col p-4">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e]">{tt(info.name)}</h3>
                <p className="mt-1 text-[13.5px] leading-relaxed text-[#6b7280]">{tt(info.description)}</p>
                {saved.length ? <p className="mt-2 text-[12.5px] text-[#9ca3af]">{saved.length === 1 ? tt("1 saved look") : tt("{count} saved looks", { count: saved.length })}</p> : null}
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <button type="button" className={buttonSecondary} onClick={() => setOpen({ type: t, configId: saved[0]?.id ?? null })} data-widget-customize={t}>
                    {tt("Customize")}
                  </button>
                  <button type="button" className={buttonPrimary} onClick={() => setAdding({ type: t, configId: saved[0]?.id ?? null })} data-widget-add={t}>
                    {tt("Add to website")}
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )

  return (
    <div className={embedded ? "" : "orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter"}>
      <Pill notice={notice} />
      {embedded ? null : (
        <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
          <div className="min-w-0">
            <a href="/app/reviews" className="text-[13px] font-medium text-[#6b7280] hover:text-[#1a1a2e]">
              {tt("Reviews")}
            </a>
            <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{tt("Widgets")}</h1>
          </div>
        </PaneBar>
      )}
      {/* Embedded in the reviews management (components/reviews/manage/widgets-slot.tsx): the page around it already has the width and the gutter. */}
      <div className={embedded ? "" : cn("mx-auto", LIST_WIDTH, GUTTER)}>{body}</div>
      {adding ? <AddToWebsite type={adding.type} configId={adding.configId} configs={configs} onClose={() => setAdding(null)} /> : null}
    </div>
  )
}

/**
 * Which page and where on it, with the widget's own answer picked, then the
 * website builder opens there with the widget placed.
 */
function AddToWebsite({ type, configId, configs, onClose }: { type: WidgetType; configId: string | null; configs: WidgetConfig[]; onClose: () => void }) {
  const fallback = defaultPlacement(type)
  const [page, setPage] = useState<WidgetPage>(fallback.page)
  const [placement, setPlacement] = useState<WidgetPlacement>(fallback.placement)
  const [look, setLook] = useState(configId ?? "")
  const mine = configs.filter((c) => c.type === type)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", esc)
    return () => window.removeEventListener("keydown", esc)
  }, [onClose])
  const where: { value: WidgetPlacement; label: string }[] = [
    ...(page === "product" ? [{ value: "below_product" as const, label: tt("Under the product details") }] : []),
    { value: "top", label: tt("At the top of the page") },
    { value: "bottom", label: tt("At the bottom of the page") },
  ]
  const shown = where.some((w) => w.value === placement) ? placement : where[where.length - 1].value
  const href = `/app/reviews/widgets/add?${new URLSearchParams({ widget: type, page, placement: shown, ...(look ? { config: look } : {}) }).toString()}`
  const radio = (on: boolean) => cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-[14px]", on ? "border-[#1a1a2e] bg-[#f8f9fa] text-[#1a1a2e]" : "border-[#e3e4e8] text-[#4b5563]")
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={onClose} data-add-to-website="">
      <div role="dialog" aria-modal="true" aria-labelledby="add-widget-title" className="w-full max-w-[440px] rounded-t-2xl bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="add-widget-title" className="text-[17px] font-semibold text-[#1a1a2e]">
          {tt("Add {name} to your website", { name: WIDGET_INFO[type].name })}
        </h2>
        <p className="mt-1 text-[13.5px] text-[#6b7280]">{tt("The website builder opens with it in place. Move it or change it there, then publish.")}</p>
        {mine.length ? (
          <label className="mt-4 grid gap-1.5">
            <span className="text-[13px] font-medium text-[#1a1a2e]">{tt("Look")}</span>
            <select className="h-10 rounded-lg border border-[#e3e4e8] bg-white px-3 text-[14px]" value={look} onChange={(e) => setLook(e.target.value)} data-add-look="">
              <option value="">{tt("As it comes")}</option>
              {mine.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <fieldset className="mt-4">
          <legend className="mb-1.5 text-[13px] font-medium text-[#1a1a2e]">{tt("Page")}</legend>
          <div className="grid gap-2">
            {(["product", "home"] as const).map((p) => (
              <label key={p} className={radio(page === p)}>
                <input type="radio" name="add-page" value={p} checked={page === p} onChange={() => setPage(p)} className="accent-[#1a1a2e]" data-add-page={p} />
                {p === "product" ? tt("Product pages") : tt("Home page")}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="mt-4">
          <legend className="mb-1.5 text-[13px] font-medium text-[#1a1a2e]">{tt("Where")}</legend>
          <div className="grid gap-2">
            {where.map((w) => (
              <label key={w.value} className={radio(shown === w.value)}>
                <input type="radio" name="add-where" value={w.value} checked={shown === w.value} onChange={() => setPlacement(w.value)} className="accent-[#1a1a2e]" data-add-where={w.value} />
                {w.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={buttonSecondary} onClick={onClose}>
            {tt("Cancel")}
          </button>
          <a href={href} className={buttonPrimary} data-add-go="">
            {tt("Open the website builder")}
          </a>
        </div>
      </div>
    </div>
  )
}

/** The stable name the reviews management's Widgets tab imports (components/app/settings/integration-apps.tsx, K5). */
export const ReviewWidgetsGallery = WidgetsGallery
export default WidgetsGallery
