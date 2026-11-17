"use client"

/**
 * ===========================================================================
 *  IMPORT ONE PRODUCT FROM ITS LINK
 * ===========================================================================
 * The Import answer of Create new product (./kind-chooser): paste a Shopify
 * or Gumroad product link, see what was read, choose what it becomes, and it
 * comes in as a draft (app/api/app/products/import/link).
 *
 * Products round 15:
 *
 *   NO KEYBOARD ON THE WAY IN. The link field took the focus as it mounted,
 *   so on a phone the tap on Import raised the keyboard while the sheet was
 *   still changing to this step, and iOS panned the page to show a field in
 *   a fixed sheet: the sheet went up past the top of the screen. The field
 *   takes the focus by itself only where there is no on screen keyboard (a
 *   fine pointer); on a phone the keyboard comes when the field is tapped,
 *   with the sheet already still, the way every other sheet with a field
 *   works (lib/ui/keyboard-safe-sheet).
 *
 *   THE TYPE IS A SEGMENTED CONTROL, the product editor's own (./editor-
 *   controls Segmented), not the browser's select.
 *
 *   ALREADY IN YOUR PRODUCTS. The preview says when the store already has
 *   this product (lib/products/import/duplicates: its platform id, its
 *   address, or its title), and the choice is Skip, the default, which opens
 *   the one you have, or Import a copy. The server asks again before it
 *   writes, so a stale page cannot make a second one.
 */

import { useEffect, useRef, useState } from "react"
import { ArrowLeft, Loader2, Check, Link2 } from "lucide-react"
import { SiGumroad } from "@/components/icons/brand/SiGumroad"
import { SiShopify } from "@/components/icons/brand/SiShopify"
import { PRIMARY_BUTTON } from "../../analytics/add-reports"
import { Segmented } from "./editor-controls"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import type { LinkProduct } from "@/lib/products/import/product-link"
import type { DuplicateMatch } from "@/lib/products/import/duplicates"

export function ImportArt() {
  return <span aria-hidden className="relative block h-14 w-16 shrink-0">
    <span className="absolute left-0 top-1 grid h-10 w-10 -rotate-12 place-items-center rounded-[13px] border border-[#dce8d5] bg-[#f0f8e9] text-[#7aab40] shadow-sm"><SiShopify size={25} /></span>
    <span className="absolute bottom-0 right-0 grid h-10 w-10 rotate-12 place-items-center rounded-[13px] border border-[#efcad5] bg-[#ffd9e7] text-[#242424] shadow-sm"><SiGumroad size={22} /></span>
  </span>
}

const BUTTON = cn(PRIMARY_BUTTON, "h-12 w-full gap-2 rounded-xl text-[15px] transition-[background-color,opacity] duration-150 disabled:cursor-not-allowed disabled:opacity-50")
const NOTE = "text-[13px] leading-5 text-[#6b7280]"
const ALERT = "rounded-xl bg-[#fef3f2] px-3 py-2.5 text-[13px] leading-5 text-[#8a1c0f]"

type Choice = "skip" | "copy"

export function LinkImportForm({ onBack, onImported }: { onBack: () => void; onImported: (productId: string) => void }) {
  const [url, setUrl] = useState("")
  const [product, setProduct] = useState<LinkProduct | null>(null)
  const [storeCurrency, setStoreCurrency] = useState("")
  const [type, setType] = useState<LinkProduct["type"]>("digital")
  const [existing, setExisting] = useState<DuplicateMatch | null>(null)
  const [choice, setChoice] = useState<Choice>("skip")
  const [busy, setBusy] = useState<"preview" | "import" | null>(null)
  const [error, setError] = useState("")
  const [done, setDone] = useState<{ id: string; message: string } | null>(null)
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

  const request = async (action: "preview" | "import") => {
    if (busy) return
    setBusy(action); setError("")
    const control = new AbortController(); controller.current = control
    const timer = setTimeout(() => control.abort(), 60_000)
    try {
      const response = await fetch("/api/app/products/import/link", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ action, url, type, copy: action === "import" && !!existing && choice === "copy" }), signal: control.signal })
      const data = await response.json()
      /* Found in the store since the preview (another tab, a stale page): said here, nothing written. */
      if (data?.status === "duplicate" && data.existing) { setExisting(data.existing); setChoice("skip"); return }
      if (!response.ok || data.error) throw new Error(data.error || tt("Could not import this product. Try again."))
      if (action === "preview") { setProduct(data.product); setStoreCurrency(data.storeCurrency); setType(data.product.type); setExisting(data.existing ?? null); setChoice("skip") }
      else if (typeof data.productId === "string") {
        const failed = Number(data.imagesFailed ?? 0)
        setDone({ id: data.productId, message: failed > 0 ? tt("Draft saved. {value} images could not be copied. Add them in the editor before publishing.", { value: failed }) : data.status === "exists" ? tt("This product has already been imported. Open its draft to review it.") : tt("Your draft is ready. Review the product and add any files before publishing.") })
      } else throw new Error(tt("The import did not finish. Please try again."))
    } catch (e) {
      if (!control.signal.aborted || controller.current === control) setError(control.signal.aborted ? tt("The import took too long. Check your products before retrying.") : e instanceof Error ? e.message : tt("Could not read this product."))
    } finally { clearTimeout(timer); if (controller.current === control) { controller.current = null; setBusy(null) } }
  }

  const mismatch = product && product.currency !== storeCurrency
  const skipping = !!existing && choice === "skip"
  const types: { value: LinkProduct["type"]; label: string }[] = [
    { value: "digital", label: tt("Digital") },
    { value: "course", label: tt("Course") },
    ...(physical || product?.type === "physical" ? [{ value: "physical" as const, label: tt("Physical") }] : []),
  ]

  return <div data-link-import="" aria-busy={!!busy} className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
    <button type="button" onClick={onBack} disabled={!!busy} className="-ml-2 mb-2 inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-[14px] font-medium text-[#6b7280] outline-none transition-colors duration-150 hover:bg-[#f5f6f8] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/40 disabled:opacity-50 [-webkit-tap-highlight-color:transparent]"><ArrowLeft className="h-4 w-4" />{tt("Back")}</button>
    {done ? <div role="status" className="space-y-4 py-3 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#e7f5eb] text-[#277344]"><Check className="h-5 w-5" /></span>
      <p className="text-[15px] leading-6 text-[#4b5563]">{done.message}</p>
      <button type="button" onClick={() => onImported(done.id)} className={BUTTON}>{tt("Open product")}</button>
    </div> : <>
      <div className="mb-4 flex items-center gap-3"><ImportArt /><p className="text-[14px] leading-5 text-[#6b7280]">{tt("Paste a Shopify or Gumroad product link to bring it into your store.")}</p></div>
      <form onSubmit={(e) => { e.preventDefault(); void request("preview") }}>
        <label htmlFor="product-import-url" className="mb-1.5 block text-[13px] font-medium text-[#1a1a2e]">{tt("Product link")}</label>
        <div className="flex h-12 items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-3 transition-[border-color,box-shadow] duration-150 focus-within:border-[#8b5cf6]/60 focus-within:shadow-[0_0_0_3px_rgba(139,92,246,0.15)]">
          <Link2 className="h-4 w-4 shrink-0 text-[#9ca3af]" />
          <input ref={field} id="product-import-url" type="url" required maxLength={2048} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://your-store.com/products/..." value={url} onChange={(e) => { setUrl(e.target.value); setProduct(null); setExisting(null); setError("") }} disabled={!!busy} className="min-w-0 flex-1 bg-transparent text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af]" />
        </div>
        {!product ? <button type="submit" disabled={!!busy || !url.trim()} className={cn(BUTTON, "mt-3")}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{busy === "preview" ? tt("Reading product…") : tt("Continue")}</button> : null}
      </form>
      {product ? <div data-link-preview="" className="mt-4 space-y-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:animate-none">
        <div className="flex items-center gap-3 rounded-2xl bg-[#f8f9fa] p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {product.images[0] ? <img src={product.images[0]} alt="" referrerPolicy="no-referrer" className="h-14 w-14 shrink-0 rounded-xl bg-white object-cover" /> : <ImportArt />}
          <div className="min-w-0">
            <p className="line-clamp-2 break-words text-[15px] font-semibold leading-5 text-[#1a1a2e]">{product.title}</p>
            <p className="mt-0.5 text-[13px] text-[#6b7280]">{new Intl.NumberFormat(undefined, { style: "currency", currency: product.currency }).format(product.priceCents / 100)} · {tt("{value} images · {value2} variants", { value: product.images.length, value2: product.variants.length })}</p>
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

        {!skipping && product.warnings.length ? <div className="space-y-1.5">{product.warnings.map((warning) => <p key={warning} className={NOTE}>{tt(warning)}</p>)}</div> : null}
        {!skipping && mismatch ? <p role="alert" className={ALERT}>{tt("This product uses {value}; your store uses {value2}. Match the currencies before importing.", { value: product.currency, value2: storeCurrency })}</p> : null}
        {!skipping && type === "physical" && !physical ? <p role="alert" className={ALERT}>{tt("Physical products are not enabled.")}</p> : null}

        {skipping
          ? <button type="button" onClick={() => onImported(existing.productId)} className={BUTTON}>{tt("Open product")}</button>
          : <button type="button" onClick={() => void request("import")} disabled={!!busy || !!mismatch || (type === "physical" && !physical)} className={BUTTON}>{busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{busy === "import" ? tt("Importing…") : existing ? tt("Import a copy as draft") : tt("Import as draft")}</button>}
      </div> : null}
      {error ? <p role="alert" className={cn(ALERT, "mt-3")}>{error}</p> : null}
    </>}
  </div>
}
