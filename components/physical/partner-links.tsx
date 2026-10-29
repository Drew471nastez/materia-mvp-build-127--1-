"use client"

/**
 * ===========================================================================
 *  MATCH YOUR PRODUCTS TO GELATO'S OR CJ'S
 * ===========================================================================
 * Opened from a connected Gelato or CJ Dropshipping card in Settings ›
 * Integrations. One row per physical variant, those sold from the partner's
 * location first, each saying what it is matched to:
 *
 *   CJ       Match: search CJ by SKU or words, open a product, choose its
 *            variant. A variant whose SKU is exactly CJ's needs no match
 *            (CJ confirms it when the order is sent), and the row says so.
 *            Each product can keep its stock in step with CJ's.
 *   Gelato   Match: the Gelato product UID (from Gelato's catalogue) and the
 *            print file's https address. Both are checked with Gelato.
 *
 * Every match is saved through the server, which asks the partner first
 * (lib/integrations/fulfilment/links-server.ts). Nothing is matched for the
 * seller: an unmatched item is never sent, the order says so instead.
 */

import * as React from "react"
import { cn } from "@/lib/utils"
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, Field, MUTED, Notice, Pill, TextInput, Toggle, api } from "./ui"
import { tt } from "@/lib/i18n/text"

interface LinkRow {
  variantId: string
  productId: string
  productTitle: string
  variantName: string | null
  sku: string | null
  atPartner: boolean
  link: { providerVariantId: string; label: string | null; providerSku: string | null; fileUrl: string | null; stockSync: boolean; stockLevel: number | null; stockSyncedAt: string | null; stockError: string | null } | null
}
interface CjVariant {
  vid: string
  pid: string | null
  sku: string
  name: string
  image: string | null
  price: string | null
}
interface CjProduct {
  pid: string
  sku: string
  name: string
  image: string | null
  price: string | null
}

type Provider = "gelato" | "cj_dropshipping"

export function PartnerLinks({ provider, name, locationName }: { provider: Provider; name: string; locationName: string | null }) {
  const base = `/api/physical/integrations/${provider}/links`
  const [rows, setRows] = React.useState<LinkRow[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [showAll, setShowAll] = React.useState(false)

  React.useEffect(() => {
    let live = true
    void api<{ rows: LinkRow[] }>(base).then((r) => {
      if (!live) return
      if (r.ok) setRows(r.data.rows)
      else setError(("error" in r ? r.error : ""))
    })
    return () => {
      live = false
    }
  }, [base])

  const save = async (body: Record<string, unknown>): Promise<string | null> => {
    setBusy(true)
    const r = await api<{ rows: LinkRow[] }>(base, { method: "PUT", body })
    setBusy(false)
    if (!r.ok) return ("error" in r ? r.error : "")
    setRows(r.data.rows)
    setEditing(null)
    return null
  }

  const stock = async (body: Record<string, unknown>) => {
    setBusy(true)
    setError(null)
    const r = await api<{ rows: LinkRow[] }>(base, { method: "POST", body })
    setBusy(false)
    if (!r.ok) return setError(("error" in r ? r.error : ""))
    setRows(r.data.rows)
  }

  if (error && !rows) return <Notice className="mt-3">{error}</Notice>
  if (!rows) return <p className={cn(MUTED, "mt-3")} data-partner-links-loading="">{tt("Reading your products…")}</p>

  const atPartner = rows.filter((r) => r.atPartner)
  const shown = showAll || atPartner.length === 0 ? rows : atPartner
  const matched = shown.filter((r) => r.link).length

  return (
    <div className="mt-3" data-partner-links={provider}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] font-medium text-[#1a1a2e]">
          {tt("{matched} of {length} matched", { matched, length: shown.length })}
          {atPartner.length > 0 && !showAll ? <span className="font-normal text-[#6b7280]"> · {tt("sold from")} {locationName ?? name}</span> : null}
        </p>
        {atPartner.length > 0 && atPartner.length < rows.length ? (
          <button type="button" className={cn(BTN_GHOST, "h-8 px-2 text-[13px]")} onClick={() => setShowAll((v) => !v)}>
            {showAll ? tt("Only {value}", { value: locationName ?? name }) : tt("All physical products")}
          </button>
        ) : null}
      </div>
      {error ? <Notice className="mt-2">{error}</Notice> : null}
      {rows.length === 0 ? <p className={cn(MUTED, "mt-2")}>{tt("You have no physical products yet. Add one, then match it here.")}</p> : null}
      {atPartner.length === 0 && rows.length > 0 ? <p className={cn(MUTED, "mt-1")}>{tt("No product is sold from")} {locationName ?? name} {tt("yet. In a product, choose")} {provider === "cj_dropshipping" ? tt("Dropshipping") : tt("Print on demand")} {tt("and the")} {locationName ?? name} {tt("location.")}</p> : null}
      <ul className="mt-2 divide-y divide-[#f1f2f4] rounded-xl border border-[#eceef1]">
        {shown.map((r) => {
          /* One stock switch per product, on its first variant's row. */
          const firstOfProduct = shown.find((x) => x.productId === r.productId)?.variantId === r.variantId
          const productLinks = shown.filter((x) => x.productId === r.productId && x.link)
          const stockOn = productLinks.length > 0 && productLinks.every((x) => x.link?.stockSync)
          return (
            <li key={r.variantId} className="px-3 py-2.5" data-partner-link-row={r.variantId}>
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                {/* At least 220px for the name: on a phone the status and button go under it rather than squeeze it. */}
                <div className="min-w-0 flex-[1_1_220px]">
                  <p className="[overflow-wrap:anywhere] text-[13.5px] font-medium text-[#1a1a2e]">
                    {r.productTitle}
                    {r.variantName ? <span className="font-normal text-[#4b5563]"> · {r.variantName}</span> : null}
                  </p>
                  <p className="mt-0.5 [overflow-wrap:anywhere] text-[12.5px] text-[#6b7280]">
                    {r.link ? (
                      <>
                        {provider === "cj_dropshipping" ? "CJ" : "Gelato"}: {r.link.label ?? r.link.providerVariantId}
                        {r.link.providerSku ? ` · ${r.link.providerSku}` : ""}
                        {r.link.stockSync && r.link.stockLevel != null ? tt(" · {stockLevel} in stock at CJ", { stockLevel: r.link.stockLevel }) : ""}
                      </>
                    ) : r.sku ? (
                      tt("SKU {sku}{value}", { sku: r.sku, value: provider === "cj_dropshipping" ? tt(", sent only if CJ has this exact SKU") : tt(", not matched") })
                    ) : (
                      tt("Not matched, no SKU")
                    )}
                  </p>
                  {r.link?.stockError ? <p className="mt-0.5 text-[12px] text-[#b42318]">{r.link.stockError}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  {r.link ? <Pill tone="green">{tt("Matched")}</Pill> : r.atPartner ? <Pill tone="amber">{tt("Not matched")}</Pill> : null}
                  <button type="button" className={cn(BTN_SECONDARY, "h-8 px-3 text-[13px]")} disabled={busy} onClick={() => setEditing(editing === r.variantId ? null : r.variantId)} data-partner-link-edit="">
                    {editing === r.variantId ? tt("Close") : r.link ? tt("Change") : tt("Match")}
                  </button>
                </div>
              </div>
              {provider === "cj_dropshipping" && firstOfProduct && productLinks.length > 0 ? (
                <div className="mt-2">
                  <Toggle
                    id={`cj-stock-${r.productId}`}
                    label={tt("Keep stock in step with CJ")}
                    description={tt("This product's stock at the CJ location follows CJ's warehouses, read every six hours and when CJ says it changed.")}
                    checked={stockOn}
                    disabled={busy}
                    onChange={(on) => void stock({ productId: r.productId, stockSync: on })}
                  />
                </div>
              ) : null}
              {editing === r.variantId ? (
                provider === "cj_dropshipping" ? (
                  <CjMatch row={r} busy={busy} onSave={(vid) => save({ variantId: r.variantId, providerVariantId: vid })} onRemove={() => save({ variantId: r.variantId, providerVariantId: "" })} />
                ) : (
                  <GelatoMatch row={r} busy={busy} onSave={(uid, fileUrl) => save({ variantId: r.variantId, providerVariantId: uid, fileUrl })} onRemove={() => save({ variantId: r.variantId, providerVariantId: "" })} />
                )
              ) : null}
            </li>
          )
        })}
      </ul>
      {provider === "cj_dropshipping" && rows.some((r) => r.link?.stockSync) ? (
        <div className="mt-2 flex justify-end">
          <button type="button" className={cn(BTN_SECONDARY, "h-9 text-[13px]")} disabled={busy} onClick={() => void stock({ syncNow: true })} data-partner-stock-now="">
            {busy ? tt("Reading CJ") : tt("Read CJ stock now")}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function CjMatch({ row, busy, onSave, onRemove }: { row: LinkRow; busy: boolean; onSave: (vid: string) => Promise<string | null>; onRemove: () => Promise<string | null> }) {
  const [q, setQ] = React.useState(row.sku ?? "")
  const [searching, setSearching] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [found, setFound] = React.useState<{ variants: CjVariant[]; products: CjProduct[] } | null>(null)
  const [open, setOpen] = React.useState<{ pid: string; variants: CjVariant[] | null } | null>(null)

  const search = async () => {
    setSearching(true)
    setError(null)
    setOpen(null)
    const r = await api<{ variants: CjVariant[]; products: CjProduct[] }>(`/api/physical/integrations/cj_dropshipping/search?q=${encodeURIComponent(q.trim())}`)
    setSearching(false)
    if (!r.ok) return setError(("error" in r ? r.error : ""))
    setFound(r.data)
  }
  const openProduct = async (pid: string) => {
    setOpen({ pid, variants: null })
    const r = await api<{ variants: CjVariant[] }>(`/api/physical/integrations/cj_dropshipping/search?pid=${encodeURIComponent(pid)}`)
    if (!r.ok) {
      setOpen(null)
      return setError(("error" in r ? r.error : ""))
    }
    setOpen({ pid, variants: r.data.variants })
  }
  const choose = async (vid: string) => {
    setError(null)
    const e = await onSave(vid)
    if (e) setError(e)
  }

  return (
    <div className="mt-2.5 space-y-2.5 rounded-xl bg-[#f8f9fa] p-3" data-cj-match="">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (q.trim().length >= 2) void search()
        }}
      >
        <TextInput className="min-w-0" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("CJ SKU or product words")} aria-label={tt("Search CJ")} data-cj-search="" />
        <button type="submit" className={cn(BTN_PRIMARY, "shrink-0")} disabled={searching || q.trim().length < 2}>
          {searching ? tt("Searching") : tt("Search CJ")}
        </button>
      </form>
      {error ? <Notice>{error}</Notice> : null}
      {found && found.variants.length === 0 && found.products.length === 0 ? <p className="text-[13px] text-[#6b7280]">{tt("CJ has nothing for that. Try other words, or the SKU from the CJ product page.")}</p> : null}
      {found?.variants.length ? (
        <div>
          <p className="text-[12px] font-medium uppercase tracking-wide text-[#6b7280]">{tt("Exact SKU")}</p>
          <ul className="mt-1 space-y-1">
            {found.variants.map((v) => (
              <VariantChoice key={v.vid} v={v} busy={busy} onChoose={() => void choose(v.vid)} />
            ))}
          </ul>
        </div>
      ) : null}
      {found?.products.length ? (
        <div>
          <p className="text-[12px] font-medium uppercase tracking-wide text-[#6b7280]">{tt("Products")}</p>
          <ul className="mt-1 space-y-1">
            {found.products.map((p) => (
              <li key={p.pid} className="rounded-lg bg-white">
                <button type="button" className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left" onClick={() => void (open?.pid === p.pid ? setOpen(null) : openProduct(p.pid))} aria-expanded={open?.pid === p.pid} data-cj-product={p.pid}>
                  {p.image ? <img src={p.image} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" loading="lazy" /> : <span className="h-9 w-9 shrink-0 rounded-md bg-[#eceef1]" />}
                  <span className="min-w-0 flex-1">
                    <span className="block [overflow-wrap:anywhere] text-[13px] font-medium text-[#1a1a2e]">{p.name || p.sku}</span>
                    <span className="block [overflow-wrap:anywhere] text-[12px] text-[#6b7280]">
                      {p.sku}
                      {p.price ? tt(" · from ${price}", { price: p.price }) : ""}
                    </span>
                  </span>
                </button>
                {open?.pid === p.pid ? (
                  open.variants === null ? (
                    <p className="px-2.5 pb-2 text-[12.5px] text-[#6b7280]">{tt("Reading its variants…")}</p>
                  ) : open.variants.length === 0 ? (
                    <p className="px-2.5 pb-2 text-[12.5px] text-[#6b7280]">{tt("CJ lists no variants for it.")}</p>
                  ) : (
                    <ul className="space-y-1 px-2 pb-2">
                      {open.variants.map((v) => (
                        <VariantChoice key={v.vid} v={v} busy={busy} onChoose={() => void choose(v.vid)} />
                      ))}
                    </ul>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {row.link ? (
        <div className="flex justify-end">
          <button type="button" className={cn(BTN_GHOST, "h-8 px-2 text-[13px] text-[#b42318]")} disabled={busy} onClick={() => void onRemove()}>
            {tt("Remove match")}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function VariantChoice({ v, busy, onChoose }: { v: CjVariant; busy: boolean; onChoose: () => void }) {
  return (
    <li className="flex items-center gap-2.5 rounded-lg border border-[#eceef1] bg-white px-2.5 py-1.5" data-cj-variant={v.vid}>
      {v.image ? <img src={v.image} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" loading="lazy" /> : null}
      <span className="min-w-0 flex-1">
        <span className="block [overflow-wrap:anywhere] text-[13px] text-[#1a1a2e]">{v.name || v.sku}</span>
        <span className="block [overflow-wrap:anywhere] text-[12px] text-[#6b7280]">
          {v.sku}
          {v.price ? ` · $${v.price}` : ""}
        </span>
      </span>
      <button type="button" className={cn(BTN_SECONDARY, "h-8 shrink-0 px-3 text-[13px]")} disabled={busy} onClick={onChoose}>
        {tt("Choose")}
      </button>
    </li>
  )
}

function GelatoMatch({ row, busy, onSave, onRemove }: { row: LinkRow; busy: boolean; onSave: (uid: string, fileUrl: string) => Promise<string | null>; onRemove: () => Promise<string | null> }) {
  const [uid, setUid] = React.useState(row.link?.providerVariantId ?? "")
  const [file, setFile] = React.useState(row.link?.fileUrl ?? "")
  const [error, setError] = React.useState<string | null>(null)
  return (
    <form
      className="mt-2.5 space-y-2.5 rounded-xl bg-[#f8f9fa] p-3"
      data-gelato-match=""
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        const err = await onSave(uid.trim(), file.trim())
        if (err) setError(err)
      }}
    >
      <Field label={tt("Gelato product UID")} hint={tt("From the product in Gelato's catalogue, for this size and colour.")}>
        <TextInput value={uid} onChange={(e) => setUid(e.target.value)} placeholder="apparel_product_gca_t-shirt_gsc_crewneck_…" autoCapitalize="off" autoCorrect="off" spellCheck={false} data-gelato-uid="" />
      </Field>
      <Field label={tt("Print file")} hint={tt("A public https address of the design, a PDF or PNG at print size.")}>
        <TextInput value={file} onChange={(e) => setFile(e.target.value)} placeholder="https://…/design.pdf" inputMode="url" data-gelato-file="" />
      </Field>
      {error ? <Notice>{error}</Notice> : null}
      <div className="flex flex-wrap justify-end gap-2">
        {row.link ? (
          <button type="button" className={cn(BTN_GHOST, "text-[#b42318]")} disabled={busy} onClick={() => void onRemove()}>
            {tt("Remove match")}
          </button>
        ) : null}
        <button type="submit" className={BTN_PRIMARY} disabled={busy || !uid.trim() || !file.trim()}>
          {busy ? tt("Checking with Gelato") : tt("Save match")}
        </button>
      </div>
    </form>
  )
}
