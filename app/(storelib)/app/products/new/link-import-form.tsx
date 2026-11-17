"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowLeft, Loader2, Check, Link2 } from "lucide-react"
import { SiGumroad } from "@/components/icons/brand/SiGumroad"
import { SiShopify } from "@/components/icons/brand/SiShopify"
import { PRIMARY_BUTTON } from "../../analytics/add-reports"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import type { LinkProduct } from "@/lib/products/import/product-link"

export function ImportArt() {
  return <span aria-hidden className="relative block h-16 w-20 shrink-0">
    <span className="absolute left-0 top-1 grid h-12 w-12 -rotate-12 place-items-center rounded-2xl border border-[#dce8d5] bg-[#f0f8e9] text-[#7aab40] shadow-sm"><SiShopify size={30} /></span>
    <span className="absolute bottom-0 right-0 grid h-12 w-12 rotate-12 place-items-center rounded-2xl border border-[#efcad5] bg-[#ffd9e7] text-[#242424] shadow-sm"><SiGumroad size={27} /></span>
  </span>
}

export function LinkImportForm({ onBack, onImported }: { onBack: () => void; onImported: (productId: string) => void }) {
  const [url, setUrl] = useState("")
  const [product, setProduct] = useState<LinkProduct | null>(null)
  const [storeCurrency, setStoreCurrency] = useState("")
  const [type, setType] = useState<LinkProduct["type"]>("digital")
  const [busy, setBusy] = useState<"preview" | "import" | null>(null)
  const [error, setError] = useState("")
  const [done, setDone] = useState<{ id: string; message: string } | null>(null)
  const controller = useRef<AbortController | null>(null)
  const physical = usePhysicalCommerceEnabled()
  useEffect(() => () => controller.current?.abort(), [])
  const request = async (action: "preview" | "import") => {
    if (busy) return
    setBusy(action); setError("")
    const control = new AbortController(); controller.current = control
    const timer = setTimeout(() => control.abort(), 60_000)
    try {
      const response = await fetch("/api/app/products/import/link", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ action, url, type }), signal: control.signal })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || tt("Could not import this product. Try again."))
      if (action === "preview") { setProduct(data.product); setStoreCurrency(data.storeCurrency); setType(data.product.type) }
      else if (typeof data.productId === "string") {
        const failed = Number(data.imagesFailed ?? 0)
        setDone({ id: data.productId, message: failed > 0 ? tt("Draft saved. {value} images could not be copied. Add them in the editor before publishing.", { value: failed }) : data.status === "exists" ? tt("This product has already been imported. Open its draft to review it.") : tt("Your draft is ready. Review the product and add any files before publishing.") })
      } else throw new Error(tt("The import did not finish. Please try again."))
    } catch (e) {
      if (!control.signal.aborted || controller.current === control) setError(control.signal.aborted ? tt("The import took too long. Check your products before retrying.") : e instanceof Error ? e.message : tt("Could not read this product."))
    } finally { clearTimeout(timer); if (controller.current === control) { controller.current = null; setBusy(null) } }
  }
  const mismatch = product && product.currency !== storeCurrency
  return <div data-link-import="" aria-busy={!!busy} className="animate-in fade-in-0 slide-in-from-right-2 duration-200 motion-reduce:animate-none">
    <button type="button" onClick={onBack} disabled={!!busy} className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-lg text-[14px] text-[#6b7280] outline-none hover:text-[#1a1a2e] focus-visible:ring-2 disabled:opacity-50"><ArrowLeft className="h-4 w-4" />{tt("Back")}</button>
    {done ? <div role="status" className="space-y-5 py-4 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#e7f5eb] text-[#277344]"><Check className="h-6 w-6" /></span><p className="text-[15px] leading-6 text-[#4b5563]">{done.message}</p><button type="button" onClick={() => onImported(done.id)} className={cn(PRIMARY_BUTTON, "h-12 w-full")}>{tt("Open product")}</button></div> : <>
      <div className="mb-5 flex items-center gap-4"><ImportArt /><p className="text-[14px] leading-5 text-[#6b7280]">{tt("Paste a Shopify or Gumroad product link to bring it into your store.")}</p></div>
      <form onSubmit={(e) => { e.preventDefault(); void request("preview") }}>
        <label htmlFor="product-import-url" className="mb-2 block text-[14px] font-medium">{tt("Product link")}</label>
        <div className="flex h-12 items-center gap-2 rounded-xl border border-[#dfe1e6] bg-white px-3 focus-within:ring-2 focus-within:ring-[#8b5cf6]/20"><Link2 className="h-4 w-4 shrink-0 text-[#9ca3af]" /><input id="product-import-url" type="url" required maxLength={2048} autoFocus inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://your-store.com/products/..." value={url} onChange={(e) => { setUrl(e.target.value); setProduct(null); setError("") }} disabled={!!busy} className="min-w-0 flex-1 bg-transparent text-[16px] outline-none" /></div>
        {!product ? <button type="submit" disabled={!!busy || !url.trim()} className={cn(PRIMARY_BUTTON, "mt-4 h-12 w-full gap-2 disabled:opacity-50")}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{busy === "preview" ? tt("Reading product…") : tt("Continue")}</button> : null}
      </form>
      {product ? <div className="mt-5 space-y-4">
        <div className="flex items-center gap-3 rounded-2xl border border-[#e5e7eb] p-3">{product.images[0] ? <img src={product.images[0]} alt="" referrerPolicy="no-referrer" className="h-16 w-16 rounded-xl bg-[#f5f6f8] object-cover" /> : <ImportArt />}<div className="min-w-0"><p className="break-words text-[15px] font-semibold">{product.title}</p><p className="mt-1 text-[14px] text-[#6b7280]">{new Intl.NumberFormat(undefined, { style: "currency", currency: product.currency }).format(product.priceCents / 100)}</p><p className="mt-1 text-[12px] text-[#6b7280]">{tt("{value} images · {value2} variants", { value: product.images.length, value2: product.variants.length })}</p></div></div>
        <label className="block text-[14px] font-medium">{tt("Product type")}<select value={type} onChange={(e) => setType(e.target.value as LinkProduct["type"])} disabled={!!busy} className="mt-2 h-11 w-full rounded-xl border border-[#dfe1e6] bg-white px-3 text-[16px]"><option value="digital">{tt("Digital product")}</option><option value="course">{tt("Video course")}</option>{physical || product.type === "physical" ? <option value="physical" disabled={!physical}>{tt("Physical product")}</option> : null}</select></label>
        <div className="space-y-2 text-[13px] leading-5 text-[#6b7280]">{product.warnings.map((warning) => <p key={warning}>{tt(warning)}</p>)}</div>
        {mismatch ? <p role="alert" className="text-[13px] text-[#a33b25]">{tt("This product uses {value}; your store uses {value2}. Match the currencies before importing.", { value: product.currency, value2: storeCurrency })}</p> : null}
        {type === "physical" && !physical ? <p role="alert" className="text-[13px] text-[#a33b25]">{tt("Physical products are not enabled.")}</p> : null}
        <button type="button" onClick={() => void request("import")} disabled={!!busy || !!mismatch || (type === "physical" && !physical)} className={cn(PRIMARY_BUTTON, "h-12 w-full gap-2 disabled:opacity-50")}>{busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{busy === "import" ? tt("Importing…") : tt("Import as draft")}</button>
      </div> : null}
      {error ? <p role="alert" className="mt-3 text-[14px] leading-5 text-[#b13d36]">{error}</p> : null}
    </>}
  </div>
}
