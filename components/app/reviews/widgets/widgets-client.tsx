"use client"

/**
 * ===========================================================================
 *  REVIEWS › WIDGETS
 * ===========================================================================
 * Every way Storelib Reviews can show reviews on the website, each drawn as
 * the website draws it (./widget-preview.tsx), with the store's own reviews.
 * A store with none yet sees the builder's sample reviews and is told so;
 * the website itself only ever shows real ones.
 *
 *   THE GALLERY     each widget, its preview and one line on what it shows
 *   ONE WIDGET      ?widget=<type>: the preview at a computer's or a phone's
 *                   width, its settings (./widget-controls.tsx, from the
 *                   section's own schema), the settings saved under names of
 *                   the store's own (presets, run-now part 205), and Add to
 *                   website: which page and where, and the editor opens with
 *                   the widget placed (lib/reviews/widgets.ts editorAddUrl).
 *
 * A placed widget is a section of the theme like any other: moved, hidden
 * and removed in the website editor, saved with the page. Its presets stay
 * here whatever happens to the page.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { GUTTER, LIST_WIDTH, RowMenuButton, buttonPrimary, buttonSecondary, card } from "@/app/app/orders/order-parts"
import { Pill, usePill } from "@/app/app/coupons/coupon-parts"
import { STORELIB_SCHEMAS } from "@/lib/website-builder/storelib-schemas"
import { REVIEW_WIDGETS, changedSettings, editorAddUrl, MAX_PRESET_NAME, type PlacementAt, type PlacementPage, type ReviewWidget, type WidgetPreset } from "@/lib/reviews/widgets"
import type { SchemaField } from "@/lib/website-builder/types"
import type { WidgetsPageData } from "@/app/app/reviews/widgets/load-widgets"
import { WidgetPreview, type PreviewDevice } from "./widget-preview"
import { WidgetControls } from "./widget-controls"
import { WIDGET_COPY } from "./copy"
import { tt } from "@/lib/i18n/text"

const SETTINGS_HREF = "/app/integrations?integration=storelib-reviews"

function fieldsOf(type: string): SchemaField[] {
  return (STORELIB_SCHEMAS[type]?.fields ?? []) as SchemaField[]
}

/** The section's settings as a new one starts: its schema's defaults. */
export function defaultsOf(type: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fieldsOf(type)) if (f.type !== "header" && f.default !== undefined) out[f.id] = f.default
  return out
}

/* On a computer: one line of a widget near its own size in a card, the rest at a computer's layout, scaled to fit. On a phone: each at a phone's layout. */
const COMPACT = new Set(["reviews_badge", "reviews_trust"])

const nameOf = (w: ReviewWidget) => WIDGET_COPY[w.type]?.name() ?? w.name
const lineOf = (w: ReviewWidget) => WIDGET_COPY[w.type]?.description() ?? w.description

function readWidgetParam(): string | null {
  if (typeof window === "undefined") return null
  const t = new URLSearchParams(window.location.search).get("widget")
  return t && REVIEW_WIDGETS.some((w) => w.type === t) ? t : null
}

export function WidgetsClient({ data }: { data: WidgetsPageData }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [presets, setPresets] = useState<WidgetPreset[]>(data.presets.list)
  const [notice, say] = usePill()
  const [phone, setPhone] = useState(false)

  /* The widget in the address, so a reload and Back land where they were. */
  useEffect(() => {
    setSelected(readWidgetParam())
    const onPop = () => setSelected(readWidgetParam())
    window.addEventListener("popstate", onPop)
    const mq = window.matchMedia("(max-width: 767px)")
    const read = () => setPhone(mq.matches)
    read()
    mq.addEventListener("change", read)
    return () => {
      window.removeEventListener("popstate", onPop)
      mq.removeEventListener("change", read)
    }
  }, [])
  const open = useCallback((type: string | null) => {
    const url = new URL(window.location.href)
    if (type) url.searchParams.set("widget", type)
    else url.searchParams.delete("widget")
    window.history.pushState(window.history.state, "", url.pathname + url.search)
    setSelected(type)
    document.querySelector(".orders-pane")?.scrollTo({ top: 0 })
  }, [])

  const widget = selected ? REVIEW_WIDGETS.find((w) => w.type === selected) ?? null : null

  return (
    /* Inside the Reviews area's frame (app/app/reviews/layout.tsx): it draws the title and the tabs, and scrolls. */
    <div data-review-widgets="">
      <Pill notice={notice} />
      {widget ? (
        <WidgetScreen key={widget.type} widget={widget} data={data} phone={phone} presets={presets} setPresets={setPresets} say={say} onBack={() => open(null)} />
      ) : (
        <Gallery data={data} presets={presets} phone={phone} onOpen={open} />
      )}
    </div>
  )
}

/* ── Notices ─────────────────────────────────────────────────────────── */

function Notices({ data }: { data: WidgetsPageData }) {
  return (
    <>
      {!data.appEnabled ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white px-3.5 py-2.5 text-[13px] text-[#4b5563] shadow-[0_0_0_1px_rgba(16,24,40,0.06)]" data-widgets-app-off="">
          <span>{tt("Storelib Reviews is off, so these widgets show nothing on your website yet.")}</span>
          <a href={SETTINGS_HREF} className="font-medium text-[#1a1a2e] underline underline-offset-4">{tt("Turn it on")}</a>
        </p>
      ) : null}
      {data.reviews.sample ? (
        <p className="mt-3 rounded-xl bg-[#fff8e6] px-3.5 py-2.5 text-[13px] text-[#5c4300]" data-widgets-sample="">
          {tt("Sample reviews: your store has no published reviews yet. Your website only ever shows real ones.")}
        </p>
      ) : null}
    </>
  )
}

/* ── The gallery ─────────────────────────────────────────────────────── */

function Gallery({ data, presets, phone, onOpen }: { data: WidgetsPageData; presets: WidgetPreset[]; phone: boolean; onOpen: (type: string) => void }) {
  const defaults = useMemo(() => Object.fromEntries(REVIEW_WIDGETS.map((w) => [w.type, defaultsOf(w.type)])), [])
  return (
    <>
      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        <Notices data={data} />
        <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2" data-widget-gallery="">
          {REVIEW_WIDGETS.map((w) => {
            const saved = presets.filter((p) => p.widget === w.type).length
            return (
              <li key={w.type} className="min-w-0">
                <button type="button" onClick={() => onOpen(w.type)} className={cn(card, "flex h-full w-full flex-col overflow-hidden text-left transition-shadow hover:shadow-[0_2px_10px_rgba(16,24,40,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20")} data-widget-card={w.type}>
                  <div className="border-b border-[#eef0f2]" aria-hidden>
                    <WidgetPreview type={w.type} settings={defaults[w.type]} theme={data.theme} reviews={data.reviews} device={phone ? "mobile" : "desktop"} product={w.page === "product"} frame={230} renderWidth={phone ? undefined : COMPACT.has(w.type) ? 620 : 1000} />
                  </div>
                  <div className="flex flex-1 items-start justify-between gap-3 px-4 py-3.5">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-[#1a1a2e]">{nameOf(w)}</p>
                      <p className="mt-0.5 text-[13px] leading-snug text-[#6b7280]">{lineOf(w)}</p>
                    </div>
                    {saved > 0 ? <span className="mt-0.5 shrink-0 text-[12px] tabular-nums text-[#9ca3af]">{saved === 1 ? tt("1 saved") : tt("{count} saved", { count: saved })}</span> : null}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}

/* ── One widget ──────────────────────────────────────────────────────── */

function WidgetScreen({
  widget,
  data,
  phone,
  presets,
  setPresets,
  say,
  onBack,
}: {
  widget: ReviewWidget
  data: WidgetsPageData
  phone: boolean
  presets: WidgetPreset[]
  setPresets: React.Dispatch<React.SetStateAction<WidgetPreset[]>>
  say: (message: string, tone?: "ok" | "error") => void
  onBack: () => void
}) {
  const router = useRouter()
  const fields = useMemo(() => fieldsOf(widget.type), [widget.type])
  const defaults = useMemo(() => defaultsOf(widget.type), [widget.type])
  const [values, setValues] = useState<Record<string, unknown>>(defaults)
  const [device, setDevice] = useState<PreviewDevice>(phone ? "mobile" : "desktop")
  useEffect(() => setDevice(phone ? "mobile" : "desktop"), [phone])
  const mine = presets.filter((p) => p.widget === widget.type)
  const [presetId, setPresetId] = useState<string | null>(null)
  const loaded = mine.find((p) => p.id === presetId) ?? null
  const changed = useMemo(() => changedSettings(values, defaults), [values, defaults])
  const dirty = loaded ? JSON.stringify(changedSettings({ ...defaults, ...loaded.settings }, defaults)) !== JSON.stringify(changed) : Object.keys(changed).length > 0

  const [naming, setNaming] = useState<null | "new" | "rename">(null)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)

  const load = (id: string | null) => {
    const p = mine.find((x) => x.id === id) ?? null
    setPresetId(p?.id ?? null)
    setValues({ ...defaults, ...(p?.settings ?? {}) })
  }

  const request = async (url: string, method: string, body?: unknown): Promise<{ preset?: WidgetPreset; error?: string } | null> => {
    setBusy(true)
    try {
      const res = await fetch(url, { method, credentials: "same-origin", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined })
      const j = (await res.json().catch(() => ({}))) as { preset?: WidgetPreset; error?: string }
      if (!res.ok) {
        say(j.error ?? tt("That could not be saved. Try again in a moment."), "error")
        return null
      }
      return j
    } catch {
      say(tt("That could not be saved. Try again in a moment."), "error")
      return null
    } finally {
      setBusy(false)
    }
  }

  const saveNew = async () => {
    const n = name.trim()
    if (!n) return
    const j = await request("/api/reviews/widgets/presets", "POST", { widget: widget.type, name: n, settings: changed })
    if (!j?.preset) return
    setPresets((all) => [j.preset!, ...all])
    setPresetId(j.preset.id)
    setNaming(null)
    say(tt("Saved as {name}", { name: j.preset.name }))
  }
  const saveOver = async () => {
    if (!loaded) return
    const j = await request(`/api/reviews/widgets/presets/${loaded.id}`, "PATCH", { settings: changed })
    if (!j?.preset) return
    setPresets((all) => all.map((p) => (p.id === j.preset!.id ? j.preset! : p)))
    say(tt("Saved"))
  }
  const rename = async () => {
    const n = name.trim()
    if (!loaded || !n) return
    const j = await request(`/api/reviews/widgets/presets/${loaded.id}`, "PATCH", { name: n })
    if (!j?.preset) return
    setPresets((all) => all.map((p) => (p.id === j.preset!.id ? j.preset! : p)))
    setNaming(null)
  }
  const remove = async () => {
    if (!loaded) return
    const j = await request(`/api/reviews/widgets/presets/${loaded.id}`, "DELETE")
    if (!j) return
    setPresets((all) => all.filter((p) => p.id !== loaded.id))
    setPresetId(null)
    say(tt("Deleted. Widgets already on your website keep their settings."))
  }

  /* ── Where it goes ── */
  const canPlace = !!data.installId && (!data.compat || !!widget.compat)
  const [page, setPage] = useState<PlacementPage | "other">(widget.page === "product" ? "product" : widget.page === "home" ? "home" : "home")
  const [at, setAt] = useState<PlacementAt>(widget.page === "product" ? "after_product" : "bottom")
  useEffect(() => {
    if (page !== "product" && at === "after_product") setAt("bottom")
  }, [page, at])
  const place = () => {
    if (!data.installId) return
    const url = editorAddUrl(data.installId, {
      type: widget.type,
      page: data.compat ? "other" : page,
      at,
      presetId: loaded && !dirty ? loaded.id : null,
      settings: loaded && !dirty ? null : changed,
    })
    router.push(url)
  }

  const segment = <T extends string>(value: T, current: T, set: (v: T) => void, label: string) => (
    <button
      key={value}
      type="button"
      role="radio"
      aria-checked={current === value}
      onClick={() => set(value)}
      className={cn("h-8 truncate rounded-md px-2 text-[13px] font-medium transition-colors max-md:h-9", current === value ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.12)]" : "text-[#6b7280] hover:text-[#1a1a2e]")}
    >
      {label}
    </button>
  )

  const deviceSwitch = (
    <div role="radiogroup" aria-label={tt("Preview on")} className="grid grid-cols-2 gap-1 rounded-lg bg-[#eceef1] p-1" data-widget-device="">
      {segment<PreviewDevice>("desktop", device, setDevice, tt("Computer"))}
      {segment<PreviewDevice>("mobile", device, setDevice, tt("Phone"))}
    </div>
  )

  const presetMenu = loaded
    ? [
        { label: tt("Rename"), onClick: () => { setName(loaded.name); setNaming("rename") } },
        { label: tt("Delete"), variant: "destructive" as const, onClick: () => void remove() },
      ]
    : []

  return (
    <>
      <div className={cn("mx-auto flex items-center justify-between gap-3 pt-2", LIST_WIDTH, GUTTER)}>
        <div className="flex min-w-0 items-center gap-1">
          <button type="button" onClick={onBack} aria-label={tt("All widgets")} className="-ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#4b5563] hover:bg-[#eceef1] hover:text-[#1a1a2e] max-md:h-10 max-md:w-10" data-widget-back="">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="truncate text-[18px] font-semibold text-[#1a1a2e]">{nameOf(widget)}</h2>
        </div>
        <div className="hidden md:block">{deviceSwitch}</div>
      </div>

      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        <Notices data={data} />
        <div className="mt-3 grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section aria-label={tt("Preview")} className={cn(card, "overflow-hidden lg:sticky lg:top-[124px]")} data-widget-stage="">
            <div className="border-b border-[#eef0f2] px-3 py-2 md:px-4 md:py-2.5">
              <p className="hidden truncate text-[13px] text-[#6b7280] md:block">{lineOf(widget)}</p>
              {/* A phone has the room for the switch alone, at full width. */}
              <div className="md:hidden">{deviceSwitch}</div>
            </div>
            <div className={cn("max-h-[58vh] overflow-y-auto overscroll-contain md:max-h-[calc(100vh-170px)]", device === "mobile" ? "bg-[#f1f2f4] px-3 py-4" : "bg-white")}>
              <div className={device === "mobile" ? "mx-auto max-w-[390px] overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(16,24,40,0.08)]" : ""}>
                <WidgetPreview type={widget.type} settings={values} theme={data.theme} reviews={data.reviews} device={device} product={widget.page === "product"} />
              </div>
            </div>
          </section>

          <div className="space-y-3">
            <section aria-label={tt("Add to website")} className={cn(card, "p-4")} data-widget-place="">
              {data.compat ? (
                <p className="text-[13px] leading-snug text-[#6b7280]">
                  {widget.compat ? tt("Your website uses an imported theme. The editor opens on Add section › Apps › Reviews, where this widget is.") : tt("Your website uses an imported theme, which has Product reviews and Star rating. This widget needs a Storelib theme.")}
                </p>
              ) : data.installId ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <p className="text-[13px] font-medium text-[#374151]" id="wp-page">{tt("Page")}</p>
                    <div role="radiogroup" aria-labelledby="wp-page" className="grid grid-cols-3 gap-1 rounded-lg bg-[#f1f2f4] p-1">
                      {segment<PlacementPage | "other">("product", page, setPage, tt("Product"))}
                      {segment<PlacementPage | "other">("home", page, setPage, tt("Home"))}
                      {segment<PlacementPage | "other">("other", page, setPage, tt("Another"))}
                    </div>
                  </div>
                  {page !== "other" ? (
                    <div className="space-y-1.5">
                      <p className="text-[13px] font-medium text-[#374151]" id="wp-at">{tt("Where on the page")}</p>
                      <div role="radiogroup" aria-labelledby="wp-at" className={cn("grid gap-1 rounded-lg bg-[#f1f2f4] p-1", page === "product" ? "grid-cols-3" : "grid-cols-2")}>
                        {segment<PlacementAt>("top", at, setAt, tt("Top"))}
                        {page === "product" ? segment<PlacementAt>("after_product", at, setAt, tt("Under product")) : null}
                        {segment<PlacementAt>("bottom", at, setAt, tt("Bottom"))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[13px] leading-snug text-[#6b7280]">{tt("The editor opens on Add section › Apps › Reviews. Open the page there and place it.")}</p>
                  )}
                </div>
              ) : (
                <p className="text-[13px] leading-snug text-[#6b7280]">
                  {tt("You have no website yet.")}{" "}
                  <a href="/app/website-builder" className="font-medium text-[#1a1a2e] underline underline-offset-4">{tt("Make one")}</a>
                </p>
              )}
              <button type="button" onClick={place} disabled={!canPlace} className={cn(buttonPrimary, "mt-3 h-10 w-full text-[14px]")} data-widget-add="">
                {tt("Add to website")}
              </button>
              <p className="mt-2 text-[12px] leading-snug text-[#9ca3af]">{tt("Hide or remove it later in the website editor. Saved settings stay here.")}</p>
            </section>

            <section aria-label={tt("Saved settings")} className={cn(card, "p-4")} data-widget-presets="">
              <div className="flex items-center gap-2">
                <label htmlFor="wp-preset" className="sr-only">{tt("Saved settings")}</label>
                <select
                  id="wp-preset"
                  value={presetId ?? ""}
                  onChange={(e) => load(e.target.value || null)}
                  disabled={!data.presets.ready}
                  className="h-9 min-w-0 flex-1 cursor-pointer truncate rounded-lg border border-[#e3e4e8] bg-white px-3 text-[14px] font-medium text-[#1a1a2e] outline-none disabled:cursor-not-allowed disabled:opacity-60 max-md:h-10 max-md:text-[16px]"
                >
                  <option value="">{tt("Default settings")}</option>
                  {mine.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {loaded ? <ResponsiveActionMenu title={loaded.name} align="end" trigger={<RowMenuButton label={tt("Actions for {name}", { name: loaded.name })} className="h-9 w-9 max-md:h-10 max-md:w-10" />} items={presetMenu} /> : null}
              </div>
              {!data.presets.ready ? (
                <p className="mt-2 rounded-lg bg-[#fff8e6] px-3 py-2 text-[12.5px] text-[#5c4300]">{tt("Saving settings turns on after the database update (run-now part 205).")}</p>
              ) : naming ? (
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void (naming === "new" ? saveNew() : rename())
                  }}
                >
                  <input autoFocus aria-label={tt("Name")} maxLength={MAX_PRESET_NAME} value={name} onChange={(e) => setName(e.target.value)} placeholder={tt("Name, like Home page grid")} className="h-9 min-w-0 flex-1 rounded-lg border border-[#e3e4e8] bg-white px-3 text-[14px] outline-none focus:border-[#9ca3af] max-md:h-10 max-md:text-[16px]" />
                  <button type="submit" disabled={busy || !name.trim()} className={cn(buttonPrimary, "h-9 max-md:h-10")}>{tt("Save")}</button>
                  <button type="button" onClick={() => setNaming(null)} className={cn(buttonSecondary, "h-9 max-md:h-10")}>{tt("Cancel")}</button>
                </form>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {loaded && dirty ? <button type="button" disabled={busy} onClick={() => void saveOver()} className={cn(buttonPrimary, "max-md:h-10")}>{tt("Save changes")}</button> : null}
                  <button type="button" disabled={busy} onClick={() => { setName(""); setNaming("new") }} className={cn(buttonSecondary, "max-md:h-10")} data-widget-save-new="">{loaded ? tt("Save as new") : tt("Save these settings")}</button>
                  {Object.keys(changed).length > 0 ? <button type="button" onClick={() => setValues(loaded ? { ...defaults, ...loaded.settings } : defaults)} className="h-8 rounded-lg px-2 text-[13px] font-medium text-[#6b7280] hover:text-[#1a1a2e] max-md:h-10">{loaded ? tt("Undo changes") : tt("Reset")}</button> : null}
                </div>
              )}
            </section>

            <section aria-label={tt("Settings")} className={cn(card, "overflow-hidden")}>
              <WidgetControls fields={fields} values={values} theme={data.theme} onChange={(id, v) => setValues((prev) => ({ ...prev, [id]: v }))} />
            </section>
          </div>
        </div>
      </div>
    </>
  )
}
