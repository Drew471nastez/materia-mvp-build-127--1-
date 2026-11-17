"use client"

/**
 * ===========================================================================
 *  IMPORT FROM A LINK
 * ===========================================================================
 * The Import answer of Create new product (./kind-chooser): paste a Shopify,
 * Gumroad or Payhip product link, see what was read, choose what it becomes,
 * and it comes in as a draft (app/api/app/products/import/link). A Shopify
 * store's own address lists its catalog to pick several from; each is then
 * imported by its own link, one request each, so one that fails says so on
 * its own row and the rest still come in.
 *
 * Products round 15:
 *
 *   NO KEYBOARD ON THE WAY IN. The link field takes the focus by itself only
 *   where there is no on screen keyboard (a fine pointer); on a phone the
 *   keyboard comes when the field is tapped, with the sheet already still
 *   (lib/ui/keyboard-safe-sheet).
 *
 *   THE TYPE IS A SEGMENTED CONTROL, the product editor's own (./editor-
 *   controls Segmented), not the browser's select.
 *
 *   ALREADY IN YOUR PRODUCTS. The preview says when the store already has
 *   this product (lib/products/import/duplicates: its platform id, its
 *   address, or its title), and the choice is Skip, the default, which opens
 *   the one you have, or Import a copy. The server asks again before it
 *   writes, so a stale page cannot make a second one. In a store's list the
 *   ones already in the store start unticked; ticking one imports a copy.
 *
 * The look is /app's: white surfaces with the #e5e7eb hairline, #1a1a2e ink,
 * #6b7280 for what is said quietly, rows at least 44px tall, 200ms moves that
 * stop under reduced motion.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Check, ChevronRight, Link2, Loader2, Search } from "lucide-react"
import { SiGumroad } from "@/components/icons/brand/SiGumroad"
import { SiShopify } from "@/components/icons/brand/SiShopify"
import { SiPayhip } from "@/components/icons/brand/SiPayhip"
import { PRIMARY_BUTTON } from "../../analytics/add-reports"
import { Checkbox, buttonSecondary, formatMoney } from "../../orders/order-parts"
import { Segmented } from "./editor-controls"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import type { CatalogItem, LinkProduct, LinkSource } from "@/lib/products/import/product-link"
import type { DuplicateMatch } from "@/lib/products/import/duplicates"

/* ── the platforms' own marks ─────────────────────────────────────────── */

const SOURCES: Record<LinkSource, { Icon: typeof SiShopify; color: string }> = {
  shopify: { Icon: SiShopify, color: "#5e8e3e" },
  gumroad: { Icon: SiGumroad, color: "#1a1a2e" },
  payhip: { Icon: SiPayhip, color: "#1a1a2e" },
}

function SourceMark({ source, size = 16, className }: { source: LinkSource; size?: number; className?: string }) {
  const { Icon, color } = SOURCES[source]
  return <Icon aria-hidden size={size} color={color} className={cn("shrink-0", className)} />
}

/** The three platforms an import reads, flat tiles on the hairline; the Import row of the product kinds draws it too. */
export function ImportArt() {
  const tile = "absolute grid h-8 w-8 place-items-center rounded-[10px] border border-[#e5e7eb] bg-white"
  return <span aria-hidden className="relative block h-14 w-16 shrink-0">
    <span className={cn(tile, "left-0 top-1")}><SourceMark source="shopify" size={17} /></span>
    <span className={cn(tile, "right-0 top-1")}><SourceMark source="gumroad" size={16} /></span>
    <span className={cn(tile, "bottom-0 left-4")}><SourceMark source="payhip" size={16} /></span>
  </span>
}

/** Which platform a link reads as while it is typed, for the field's mark. The server decides for real. */
function sourceOf(value: string): LinkSource | null {
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value.trim()) ? value.trim() : `https://${value.trim()}`)
    const h = url.hostname.toLowerCase()
    if (h === "gumroad.com" || h.endsWith(".gumroad.com")) return "gumroad"
    if (h === "payhip.com" || h === "www.payhip.com") return "payhip"
    if (h.endsWith(".myshopify.com") || /\/products\//.test(url.pathname)) return "shopify"
  } catch { /* Not a link yet. */ }
  return null
}

/* ── shared looks ─────────────────────────────────────────────────────── */

const BUTTON = cn(PRIMARY_BUTTON, "h-12 w-full gap-2 rounded-xl text-[15px] transition-[background-color,opacity] duration-200 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none")
const QUIET_BUTTON = cn(buttonSecondary, "h-12 w-full rounded-xl text-[15px]")
const NOTE = "text-[13px] leading-5 text-[#6b7280]"
const ALERT = "rounded-xl border border-[#f5c2bd] bg-[#fef3f2] px-3 py-2.5 text-[13px] leading-5 text-[#8a1c0f]"
const FIELD = "flex h-12 items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-3 transition-[border-color,box-shadow] duration-200 focus-within:border-[#1a1a2e]/40 focus-within:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] motion-reduce:transition-none"
const SURFACE = "rounded-2xl border border-[#e5e7eb] bg-white"
const ENTER = "animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:animate-none"

const money = (cents: number, currency: string) => { try { return formatMoney(cents, currency) } catch { return `${(cents / 100).toFixed(2)} ${currency}` } } // i18n-ignore: an amount

type Choice = "skip" | "copy"
type Listed = CatalogItem & { existing: DuplicateMatch | null }
interface Catalog { origin: string; currency: string; items: Listed[]; truncated: boolean }
type Outcome = { item: Listed; kind: "imported" | "exists" | "failed"; productId?: string; message?: string }
type Show = "all" | "new" | "in-store"

async function post(body: Record<string, unknown>, signal: AbortSignal) {
  const response = await fetch("/api/app/products/import/link", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body), signal })
  const data = await response.json().catch(() => null)
  return { response, data: (data ?? {}) as Record<string, unknown> & { error?: string } }
}

export function LinkImportForm({ onBack, onImported, onImportedMany }: { onBack: () => void; onImported: (productId: string) => void; onImportedMany?: () => void }) {
  const [url, setUrl] = useState("")
  const [product, setProduct] = useState<LinkProduct | null>(null)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [storeCurrency, setStoreCurrency] = useState("")
  const [type, setType] = useState<LinkProduct["type"]>("digital")
  const [existing, setExisting] = useState<DuplicateMatch | null>(null)
  const [choice, setChoice] = useState<Choice>("skip")
  const [busy, setBusy] = useState<"preview" | "import" | null>(null)
  const [error, setError] = useState("")
  const [done, setDone] = useState<{ id: string; message: string } | null>(null)
  const [picks, setPicks] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<{ done: number; total: number; title: string } | null>(null)
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null)
  const controller = useRef<AbortController | null>(null)
  const field = useRef<HTMLInputElement>(null)
  const physical = usePhysicalCommerceEnabled()
  useEffect(() => () => controller.current?.abort(), [])
  /* A computer's cursor goes straight to the link; a phone waits for a tap (NO KEYBOARD ON THE WAY IN). */
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return
    /* A frame later: the dialog's focus trap first settles the focus the Import button took with it. */
    const frame = requestAnimationFrame(() => field.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [])

  const reset = () => { setProduct(null); setCatalog(null); setExisting(null); setError("") }

  const request = async (action: "preview" | "import") => {
    if (busy) return
    setBusy(action); setError("")
    const control = new AbortController(); controller.current = control
    const timer = setTimeout(() => control.abort(), 60_000)
    try {
      const { response, data } = await post({ action, url, type, copy: action === "import" && !!existing && choice === "copy" }, control.signal)
      /* Found in the store since the preview (another tab, a stale page): said here, nothing written. */
      if (data.status === "duplicate" && data.existing) { setExisting(data.existing as DuplicateMatch); setChoice("skip"); return }
      if (response.status === 429) throw new Error(tt("Too many tries. Wait a few minutes and try again."))
      if (!response.ok || data.error) throw new Error(data.error || tt("Could not import this product. Try again."))
      if (action === "preview" && data.catalog) {
        const next = data.catalog as Catalog
        setCatalog(next); setStoreCurrency(String(data.storeCurrency ?? ""))
        setPicks(new Set(next.items.filter((i) => !i.existing && (physical || i.type !== "physical")).map((i) => i.url)))
      } else if (action === "preview") {
        const read = data.product as LinkProduct
        setProduct(read); setStoreCurrency(String(data.storeCurrency ?? "")); setType(read.type); setExisting((data.existing as DuplicateMatch | null) ?? null); setChoice("skip")
      } else if (typeof data.productId === "string") {
        const failed = Number(data.imagesFailed ?? 0)
        setDone({ id: data.productId, message: failed > 0 ? tt("Draft saved. {value} images could not be copied. Add them in the editor before publishing.", { value: failed }) : data.status === "exists" ? tt("This product has already been imported. Open its draft to review it.") : tt("Your draft is ready. Review the product and add any files before publishing.") })
      } else throw new Error(tt("The import did not finish. Please try again."))
    } catch (e) {
      if (!control.signal.aborted || controller.current === control) setError(control.signal.aborted ? tt("The import took too long. Check your products before retrying.") : e instanceof Error ? e.message : tt("Could not read this product."))
    } finally { clearTimeout(timer); if (controller.current === control) { controller.current = null; setBusy(null) } }
  }

  /* A store's picks, one link per request; a product that fails says so on its own row and the rest still come in. */
  const importMany = async () => {
    if (!catalog || busy) return
    const chosen = catalog.items.filter((i) => picks.has(i.url))
    if (!chosen.length) return
    setBusy("import"); setError("")
    const control = new AbortController(); controller.current = control
    const out: Outcome[] = []
    for (const item of chosen) {
      if (control.signal.aborted) break
      setProgress({ done: out.length, total: chosen.length, title: item.title })
      try {
        const { response, data } = await post({ action: "import", url: item.url, copy: !!item.existing }, control.signal)
        if (data.status === "duplicate" && data.existing) out.push({ item, kind: "exists", productId: (data.existing as DuplicateMatch).productId })
        else if (response.ok && typeof data.productId === "string") out.push({ item, kind: data.status === "exists" ? "exists" : "imported", productId: data.productId })
        else {
          out.push({ item, kind: "failed", message: response.status === 429 ? tt("Too many tries. Wait a few minutes and try again.") : data.error || tt("It was not imported. Try again.") })
          /* The database is not ready, or the limit is reached: the next ones would fail the same way. */
          if (response.status === 503 || response.status === 429) break
        }
      } catch {
        if (control.signal.aborted) break
        out.push({ item, kind: "failed", message: tt("Storelib did not answer. Try again.") })
      }
    }
    if (controller.current === control) { controller.current = null; setBusy(null); setProgress(null); setOutcomes(out) }
  }

  const mismatch = (product && product.currency !== storeCurrency) || (catalog && catalog.items.length > 0 && catalog.currency !== storeCurrency)
  const skipping = !!existing && choice === "skip"
  const types: { value: LinkProduct["type"]; label: string }[] = [
    { value: "digital", label: tt("Digital") },
    { value: "course", label: tt("Course") },
    ...(physical || product?.type === "physical" ? [{ value: "physical" as const, label: tt("Physical") }] : []),
  ]
  const typed = sourceOf(url)

  return <div data-link-import="" aria-busy={!!busy} className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
    <button type="button" onClick={onBack} disabled={!!busy} className="-ml-2 mb-2 inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-[14px] font-medium text-[#6b7280] outline-none transition-colors duration-200 hover:bg-[#f5f6f8] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 disabled:opacity-50 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"><ArrowLeft className="h-4 w-4" />{tt("Back")}</button>
    {done ? <div role="status" className="space-y-4 py-3 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#e7f5eb] text-[#277344]"><Check className="h-5 w-5" /></span>
      <p className="text-[15px] leading-6 text-[#4b5563]">{done.message}</p>
      <button type="button" onClick={() => onImported(done.id)} className={BUTTON}>{tt("Open product")}</button>
    </div> : outcomes ? <Outcomes outcomes={outcomes} onOpen={onImported} onDone={onImportedMany ?? onBack} /> : <>
      {!product && !catalog ? <p className="mb-3 text-[14px] leading-5 text-[#6b7280]">{tt("Paste a product link from Shopify, Gumroad or Payhip. Paste a Shopify store's address to pick several products.")}</p> : null}
      <form onSubmit={(e) => { e.preventDefault(); void request("preview") }}>
        <label htmlFor="product-import-url" className="mb-1.5 block text-[13px] font-medium text-[#1a1a2e]">{tt("Product or store link")}</label>
        <div className={FIELD}>
          {typed ? <SourceMark source={typed} /> : <Link2 aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />}
          <input ref={field} id="product-import-url" type="text" enterKeyHint="go" required maxLength={2048} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://store.com/products/..." value={url} onChange={(e) => { setUrl(e.target.value); reset() }} disabled={!!busy} className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af]" />
        </div>
        {!product && !catalog ? <button type="submit" disabled={!!busy || !url.trim()} className={cn(BUTTON, "mt-3")}>{busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : null}{busy === "preview" ? tt("Reading…") : tt("Continue")}</button> : null}
      </form>

      {!product && !catalog && !busy ? <Link href="/app/products/import/gumroad" data-gumroad-account="" className="mt-3 flex min-h-12 items-center gap-3 rounded-xl px-1 text-[14px] text-[#1a1a2e] outline-none transition-colors duration-200 hover:bg-[#f8f9fa] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 motion-reduce:transition-none">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border border-[#e5e7eb] bg-white"><SourceMark source="gumroad" /></span>
        <span className="min-w-0 flex-1">{tt("Import every Gumroad product with an access token")}</span>
        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#b6bac2]" />
      </Link> : null}

      {product ? <div data-link-preview="" className={cn("mt-4 space-y-4", ENTER)}>
        <div className={cn(SURFACE, "flex items-center gap-3 p-2.5")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {product.images[0] ? <img src={product.images[0]} alt="" referrerPolicy="no-referrer" width={56} height={56} className="h-14 w-14 shrink-0 rounded-xl bg-[#f1f2f4] object-cover" /> : <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[#f1f2f4]"><SourceMark source={product.source} size={20} /></span>}
          <div className="min-w-0">
            <p className="line-clamp-2 break-words text-[15px] font-semibold leading-5 text-[#1a1a2e]">{product.title}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[#6b7280]"><SourceMark source={product.source} size={12} /><span className="min-w-0 truncate">{money(product.priceCents, product.currency)} · {tt("{value} images · {value2} variants", { value: product.images.length, value2: product.variants.length })}</span></p>
          </div>
        </div>

        {existing ? <div data-import-duplicate="" className="space-y-2.5">
          <div>
            <p className="text-[14px] font-semibold text-[#1a1a2e]">{tt("Already in your products")}</p>
            <p className={cn(NOTE, "truncate")}>{existing.title}</p>
          </div>
          <Segmented<Choice> label={tt("Already in your products")} value={choice} onChange={setChoice} options={[{ value: "skip", label: tt("Skip") }, { value: "copy", label: tt("Import a copy") }]} />
        </div> : null}

        {!skipping ? <div>
          <p className="mb-1.5 text-[13px] font-medium text-[#1a1a2e]">{tt("Product type")}</p>
          <Segmented<LinkProduct["type"]> label={tt("Product type")} value={type} onChange={setType} options={types} />
        </div> : null}

        {!skipping && product.warnings.length ? <ul className="space-y-1.5">{product.warnings.map((warning) => <li key={warning} className={NOTE}>{tt(warning)}</li>)}</ul> : null}
        {!skipping && mismatch ? <p role="alert" className={ALERT}>{tt("This product uses {value}; your store uses {value2}. Match the currencies before importing.", { value: product.currency, value2: storeCurrency })}</p> : null}
        {!skipping && type === "physical" && !physical ? <p role="alert" className={ALERT}>{tt("Physical products are not enabled.")}</p> : null}

        {skipping
          ? <button type="button" onClick={() => onImported(existing.productId)} className={BUTTON}>{tt("Open product")}</button>
          : <button type="button" onClick={() => void request("import")} disabled={!!busy || !!mismatch || (type === "physical" && !physical)} className={BUTTON}>{busy === "import" ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : null}{busy === "import" ? tt("Importing…") : existing ? tt("Import a copy as draft") : tt("Import as draft")}</button>}
      </div> : null}

      {catalog ? <CatalogPicker catalog={catalog} storeCurrency={storeCurrency} picks={picks} setPicks={setPicks} physical={physical} mismatch={!!mismatch} progress={progress} onImport={() => void importMany()} /> : null}
      {error ? <p role="alert" className={cn(ALERT, "mt-3")}>{error}</p> : null}
    </>}
  </div>
}

/* ── a store's catalog ────────────────────────────────────────────────── */

function CatalogPicker({ catalog, storeCurrency, picks, setPicks, physical, mismatch, progress, onImport }: {
  catalog: Catalog; storeCurrency: string; picks: Set<string>; setPicks: (next: Set<string>) => void; physical: boolean; mismatch: boolean
  progress: { done: number; total: number; title: string } | null; onImport: () => void
}) {
  const [query, setQuery] = useState("")
  const [show, setShow] = useState<Show>("all")
  const host = new URL(catalog.origin).hostname
  const blocked = (i: Listed) => i.type === "physical" && !physical
  const inStore = catalog.items.filter((i) => i.existing).length
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return catalog.items.filter((i) => (show === "all" || (show === "new") === !i.existing) && (!q || i.title.toLowerCase().includes(q)))
  }, [catalog.items, query, show])
  const pickable = visible.filter((i) => !blocked(i))
  const allPicked = pickable.length > 0 && pickable.every((i) => picks.has(i.url))
  const toggle = (url: string, on: boolean) => { const next = new Set(picks); if (on) next.add(url); else next.delete(url); setPicks(next) }
  const setVisible = (on: boolean) => { const next = new Set(picks); for (const i of pickable) if (on) next.add(i.url); else next.delete(i.url); setPicks(next) }
  const count = picks.size

  if (progress) return <div role="status" data-catalog-progress="" className={cn("mt-4 space-y-3", ENTER)}>
    <p className="text-[15px] font-semibold text-[#1a1a2e]">{tt("Importing {done} of {total}", { done: progress.done + 1, total: progress.total })}</p>
    <div className="h-1.5 overflow-hidden rounded-full bg-[#eef0f2]"><div className="h-full rounded-full bg-[#1a1a2e] transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} /></div>
    <p className={cn(NOTE, "truncate")}>{progress.title}</p>
  </div>

  return <div data-catalog="" className={cn("mt-4 space-y-3", ENTER)}>
    <div className="flex min-h-11 items-center justify-between gap-3">
      <p className="flex min-w-0 items-center gap-1.5 text-[14px] font-semibold text-[#1a1a2e]"><SourceMark source="shopify" size={14} /><span className="truncate">{catalog.items.length === 1 ? tt("1 product on {store}", { store: host }) : tt("{count} products on {store}", { count: catalog.items.length, store: host })}</span></p>
      {pickable.length > 1 ? <button type="button" onClick={() => setVisible(!allPicked)} className="-mr-2 h-11 shrink-0 rounded-lg px-2 text-[14px] font-medium text-[#1a1a2e] outline-none transition-colors duration-200 hover:bg-[#f5f6f8] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 motion-reduce:transition-none">{allPicked ? tt("Clear") : tt("Select all")}</button> : null}
    </div>

    {catalog.items.length > 8 ? <label className={FIELD}>
      <Search aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />
      <span className="sr-only">{tt("Search products")}</span>
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tt("Search products")} className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af]" />
    </label> : null}
    {inStore > 0 ? <Segmented<Show> label={tt("Show")} value={show} onChange={setShow} fit="content" options={[{ value: "all", label: tt("All") }, { value: "new", label: tt("Not imported") }, { value: "in-store", label: tt("In your products") }]} /> : null}

    {catalog.items.length === 0 ? <p className={cn(SURFACE, NOTE, "px-4 py-6 text-center")}>{tt("This store lists no products with a price.")}</p>
      : <ul className={cn(SURFACE, "max-h-[min(46dvh,420px)] divide-y divide-[#eef0f2] overflow-y-auto overscroll-contain")}>
        {visible.length === 0 ? <li className={cn(NOTE, "px-4 py-6 text-center")}>{tt("No products match.")}</li> : visible.map((i) => {
          const off = blocked(i)
          return <li key={i.url}>
            <label className={cn("flex min-h-[60px] items-center gap-3 px-3 py-2 transition-colors duration-200 motion-reduce:transition-none", off ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-[#f8f9fa]")}>
              {off ? <span aria-hidden className="h-4 w-4 shrink-0" /> : <Checkbox checked={picks.has(i.url)} onChange={(on) => toggle(i.url, on)} label={i.existing ? tt("Import a copy of {name}", { name: i.title }) : tt("Import {name}", { name: i.title })} />}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {i.image ? <img src={i.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" width={40} height={40} className="h-10 w-10 shrink-0 rounded-lg bg-[#f1f2f4] object-cover" /> : <span aria-hidden className="h-10 w-10 shrink-0 rounded-lg bg-[#f1f2f4]" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{i.title}</span>
                <span className={cn(NOTE, "block truncate")}>
                  {off ? tt("Physical products are not enabled.") : i.existing ? tt("In your products. Tick to import a copy.") : [money(i.priceCents, catalog.currency), i.variants ? tt("{count} variants", { count: i.variants }) : "", i.type === "physical" ? tt("Ships") : ""].filter(Boolean).join(" · ")}
                </span>
              </span>
            </label>
          </li>
        })}
      </ul>}

    {catalog.truncated ? <p className={NOTE}>{tt("Showing the first {count} products.", { count: catalog.items.length })}</p> : null}
    {mismatch ? <p role="alert" className={ALERT}>{tt("This store sells in {value}; your store uses {value2}. Match the currencies before importing.", { value: catalog.currency, value2: storeCurrency })}</p> : null}
    {count > 0 && !mismatch ? <p className={NOTE}>{tt("Each comes in as a draft. Files are not copied.")}</p> : null}
    <button type="button" onClick={onImport} disabled={!count || mismatch} data-catalog-run="" className={BUTTON}>{count === 1 ? tt("Import 1 product") : tt("Import {count} products", { count })}</button>
  </div>
}

function Outcomes({ outcomes, onOpen, onDone }: { outcomes: Outcome[]; onOpen: (productId: string) => void; onDone: () => void }) {
  const made = outcomes.filter((o) => o.kind === "imported").length
  return <div role="status" data-catalog-done="" className={cn("space-y-3", ENTER)}>
    <div>
      <p className="text-[15px] font-semibold text-[#1a1a2e]">{made === 1 ? tt("1 draft added") : tt("{count} drafts added", { count: made })}</p>
      <p className={cn(NOTE, "mt-0.5")}>{tt("Open each one, upload its files, then publish it.")}</p>
    </div>
    <ul className={cn(SURFACE, "max-h-[min(46dvh,420px)] divide-y divide-[#eef0f2] overflow-y-auto overscroll-contain")}>
      {outcomes.map((o) => <li key={o.item.url} className="flex min-h-[60px] items-center gap-3 px-3 py-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{o.item.title}</span>
          <span className={cn("block text-[13px] leading-5", o.kind === "failed" ? "text-[#8a1c0f]" : "text-[#6b7280]")}>{o.kind === "imported" ? tt("Draft. Add its files.") : o.kind === "exists" ? tt("Already in your products") : o.message}</span>
        </span>
        {o.productId ? <button type="button" onClick={() => onOpen(o.productId as string)} className={cn(buttonSecondary, "h-11 shrink-0 rounded-[10px] px-4 text-[14px] sm:h-9")}>{tt("Open")}</button> : null}
      </li>)}
    </ul>
    <button type="button" onClick={onDone} className={QUIET_BUTTON}>{tt("Done")}</button>
  </div>
}
