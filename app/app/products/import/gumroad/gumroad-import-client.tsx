"use client"

/**
 * ===========================================================================
 *  PRODUCTS › IMPORT FROM GUMROAD
 * ===========================================================================
 * Three screens in one column, Products' measures (../../products-client.tsx):
 *
 *   TOKEN     the seller pastes an access token they made in Gumroad. It is
 *             sent once, to app/api/app/products/import/gumroad, and the
 *             field is emptied whatever the answer. Nothing keeps it: not
 *             this page's state after the request, not the browser's storage.
 *   PRODUCTS  what Gumroad has, one row each with a checkbox. A row opens to
 *             its title, price and option prices. A product Storelib cannot
 *             take as a digital product (a membership, a thing that ships, a
 *             bundle) says why and has no checkbox; one already imported
 *             links to its Storelib product instead.
 *   DONE      each product as it went in, a draft, with Edit beside it, and
 *             the one thing left to do: upload its files and publish.
 *
 * Imported one product per request, so a store with a hundred products never
 * waits on one long request, and a product that fails says so on its own row.
 */

import * as React from "react"
import Link from "next/link"
import { ArrowLeft, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"
import { accentDepth } from "@/components/ui/depth-button"
import { toMajor, toMinor } from "@/lib/payments/money"
import { Checkbox, GUTTER, LIST_BAR, PaneBar, StatusBadge, buttonSecondary, card, formatMoney, iconButton } from "../../../orders/order-parts"
import { gumroadToHundredths, type ImportCandidate, type ImportNote } from "@/lib/products/import/gumroad"

type Candidate = ImportCandidate & { importedProductId: string | null }

interface Listed {
  products: Candidate[]
  currency: string
  ready: boolean
  sqlPart: number
  truncated: boolean
}

interface Draft {
  selected: boolean
  title: string
  price: string
  variantPrices: string[]
}

type Outcome =
  | { kind: "imported"; productId: string; imagesFailed: number; variantsSaved: boolean }
  | { kind: "exists"; productId: string }
  | { kind: "failed"; message: string }

const WIDTH = "max-w-[760px]"
const PRIMARY = cn(accentDepth, "h-11 gap-1.5 rounded-[10px] px-4 text-[15px] sm:h-9 sm:rounded-lg sm:px-3.5 sm:text-[14px] disabled:cursor-not-allowed disabled:opacity-50")
const SECONDARY = cn(buttonSecondary, "h-11 rounded-[10px] px-4 text-[15px] sm:h-9 sm:rounded-lg sm:text-[14px]")
const INPUT = "h-11 w-full rounded-[10px] border border-[#e5e7eb] bg-white px-3 text-[15px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#1a1a2e]/40 focus:ring-2 focus:ring-[#1a1a2e]/10 sm:h-10 sm:text-[14px]"
const LABEL = "mb-1.5 block text-[13px] font-medium text-[#1a1a2e]"
const MUTED = "text-[13px] leading-5 text-[#6b7280]"

const PRICE = /^\d{1,7}([.,]\d{1,2})?$/

function priceText(cents: number | null, currency: string): string {
  return cents === null ? "" : toMajor(cents, currency)
}

function readPrice(text: string, currency: string): number | null {
  const t = text.trim()
  if (!PRICE.test(t)) return null
  try {
    return toMinor(t.replace(",", "."), currency)
  } catch {
    return null
  }
}

/** Gumroad's own price, written in its own currency. */
function gumroadPriceLabel(p: Candidate): string {
  const { amount, currency } = p.gumroadPrice
  try {
    return new Intl.NumberFormat(appLocale(), { style: "currency", currency }).format(gumroadToHundredths(amount, currency) / 100)
  } catch {
    return `${(gumroadToHundredths(amount, currency) / 100).toFixed(2)} ${currency}` // i18n-ignore: an amount
  }
}

function listError(code: unknown): string {
  if (code === "bad_token") return tt("Gumroad did not accept that token. Generate a new one and paste it again.")
  if (code === "gumroad_down") return tt("Gumroad did not answer. Try again in a minute.")
  if (code === "gumroad_refused") return tt("Gumroad answered with something Storelib could not read. Try again.")
  return tt("Storelib did not answer. Try again.")
}

function importError(code: unknown): string {
  if (code === "no_price") return tt("Type a price first.")
  if (code === "no_title") return tt("Give it a title first.")
  if (code === "not_ready") return tt("Gumroad import turns on after the database update (SQL part {part}).", { part: 344 })
  if (code === "busy") return tt("Another import of this product is still running. Try again in a few minutes.")
  return tt("It was not imported. Try again.")
}

function noteText(note: ImportNote, p: Candidate, currency: string): string | null {
  if (note === "currency") return tt("Sold for {price} on Gumroad. Your store sells in {currency}, so type the price.", { price: gumroadPriceLabel(p), currency })
  if (note === "variants_trimmed") return tt("Only the first {count} option combinations come in.", { count: 30 })
  if (note === "images_left") return tt("Some pictures are not on Gumroad's servers and stay behind.")
  return null
}

function unsupportedText(p: Candidate): string {
  if (p.unsupported === "membership") return tt("Memberships are not imported. Sell them as a paid community.")
  if (p.unsupported === "physical") return tt("Ships a physical item. Add it with New product.")
  return tt("Bundles are not imported. Import the products in it instead.")
}

const editHref = (id: string) => `/app/products/${id}`

export function GumroadImportClient() {
  const [token, setToken] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [listed, setListed] = React.useState<Listed | null>(null)
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({})
  const [open, setOpen] = React.useState<Set<string>>(new Set())
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null)
  const [results, setResults] = React.useState<{ id: string; title: string; outcome: Outcome }[] | null>(null)

  async function findProducts(e: React.FormEvent) {
    e.preventDefault()
    const sent = token.trim()
    /* Emptied before the answer: the token is in the request and nowhere on the page. */
    setToken("")
    if (!sent) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/app/products/import/gumroad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ action: "list", token: sent }),
      })
      const body = (await res.json().catch(() => null)) as (Listed & { error?: string }) | null
      if (!res.ok || !body || !Array.isArray(body.products)) {
        setError(res.status === 429 ? tt("Too many tries. Wait a few minutes and try again.") : listError(body?.error))
        return
      }
      const next: Record<string, Draft> = {}
      const needsPrice = new Set<string>()
      for (const p of body.products) {
        const selectable = !p.unsupported && !p.importedProductId
        next[p.gumroadId] = {
          selected: selectable,
          title: p.title,
          price: priceText(p.priceCents, body.currency),
          variantPrices: p.variants.map((v) => priceText(v.priceCents, body.currency)),
        }
        if (selectable && p.priceCents === null) needsPrice.add(p.gumroadId)
      }
      setDrafts(next)
      setOpen(needsPrice)
      setListed(body)
    } catch {
      setError(tt("Storelib did not answer. Try again."))
    } finally {
      setBusy(false)
    }
  }

  const products = listed?.products ?? []
  const currency = listed?.currency ?? "USD"
  const choosable = products.filter((p) => !p.unsupported && !p.importedProductId)
  const chosen = choosable.filter((p) => drafts[p.gumroadId]?.selected)
  const missingPrice = chosen.filter((p) => readPrice(drafts[p.gumroadId].price, currency) === null || !drafts[p.gumroadId].title.trim())

  const update = (id: string, change: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...change } }))
  const toggleOpen = (id: string) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const setAll = (on: boolean) => setDrafts((d) => Object.fromEntries(Object.entries(d).map(([id, v]) => [id, { ...v, selected: on && choosable.some((p) => p.gumroadId === id) }])))

  async function runImport() {
    if (!chosen.length || missingPrice.length) {
      if (missingPrice.length) setOpen((s) => new Set([...s, ...missingPrice.map((p) => p.gumroadId)]))
      return
    }
    setError(null)
    const out: { id: string; title: string; outcome: Outcome }[] = []
    setProgress({ done: 0, total: chosen.length })
    for (const p of chosen) {
      const d = drafts[p.gumroadId]
      const priceCents = readPrice(d.price, currency) ?? 0
      const item = {
        gumroadId: p.gumroadId,
        title: d.title.trim(),
        descriptionHtml: p.descriptionHtml,
        priceCents,
        payWhatYouWant: p.payWhatYouWant,
        images: p.images,
        variants: p.variants.map((v, i) => ({ name: v.name, priceCents: readPrice(d.variantPrices[i] ?? "", currency) ?? priceCents, payWhatYouWant: v.payWhatYouWant })),
        tags: p.tags,
      }
      let outcome: Outcome
      try {
        const res = await fetch("/api/app/products/import/gumroad", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({ action: "import", item }),
        })
        const body = (await res.json().catch(() => null)) as { status?: string; productId?: string; imagesFailed?: number; variantsSaved?: boolean; error?: string } | null
        if (res.ok && body?.status === "imported" && body.productId) outcome = { kind: "imported", productId: body.productId, imagesFailed: body.imagesFailed ?? 0, variantsSaved: body.variantsSaved !== false }
        else if (res.ok && body?.status === "exists" && body.productId) outcome = { kind: "exists", productId: body.productId }
        else outcome = { kind: "failed", message: res.status === 429 ? tt("Too many tries. Wait a few minutes and try again.") : importError(body?.status === "busy" ? "busy" : body?.error) }
        if (body?.error === "not_ready") {
          out.push({ id: p.gumroadId, title: item.title, outcome })
          break
        }
      } catch {
        outcome = { kind: "failed", message: tt("Storelib did not answer. Try again.") }
      }
      out.push({ id: p.gumroadId, title: item.title, outcome })
      setProgress({ done: out.length, total: chosen.length })
    }
    setProgress(null)
    setResults(out)
  }

  const importing = progress !== null

  return (
    <div className="orders-pane page-scroll h-full overflow-y-auto overflow-x-hidden bg-[#f8f9fa] app-page-enter" data-gumroad-import="">
      <PaneBar width={WIDTH} className={LIST_BAR}>
        <div className="flex min-w-0 items-center gap-1.5">
          <Link href="/app/products" aria-label={tt("Back to products")} className={cn(iconButton, "-ml-1.5 h-9 w-9 shrink-0 hover:bg-[#eceef1] active:bg-[#e4e6ea]")}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="min-w-0 truncate text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{tt("Import from Gumroad")}</h1>
        </div>
      </PaneBar>

      <div className={cn("mx-auto w-full pb-[calc(96px+env(safe-area-inset-bottom))] pt-2", WIDTH, GUTTER)}>
        <p className="sr-only" aria-live="polite">
          {progress ? tt("Importing {done} of {total}", { done: progress.done, total: progress.total }) : ""}
        </p>
        {error ? (
          <div role="alert" className="mb-3 rounded-xl border border-[#f5c2bd] bg-[#fef3f2] px-4 py-3 text-[14px] leading-5 text-[#8a1c0f]">
            {error}
          </div>
        ) : null}

        {results ? (
          <Done results={results} />
        ) : !listed ? (
          <form onSubmit={findProducts} className={cn(card, "p-4 sm:p-5")} data-gumroad-token="">
            <ol className="mb-4 list-decimal space-y-1 pl-5 text-[14px] leading-6 text-[#1a1a2e]">
              <li>{tt("In Gumroad, open Settings › Advanced.")}</li>
              <li>{tt("Under Applications, create one. Any name works; for the redirect URI type http://127.0.0.1.")}</li>
              <li>{tt("Press Generate access token and paste it here.")}</li>
            </ol>
            <label htmlFor="gumroad-token" className={LABEL}>
              {tt("Access token")}
            </label>
            <input
              id="gumroad-token"
              type="password"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className={cn(INPUT, "font-mono")}
            />
            <p className={cn(MUTED, "mt-2")}>
              {tt("Storelib uses it once to read your product list and does not keep it. Buyers, sales and files stay on Gumroad. Delete the application in Gumroad when you are done.")}
            </p>
            <div className="mt-4 flex justify-end">
              <button type="submit" disabled={busy || !token.trim()} className={PRIMARY}>
                {busy ? tt("Reading Gumroad") : tt("Find products")}
              </button>
            </div>
          </form>
        ) : (
          <>
            {!listed.ready ? (
              <p data-sql-needed={listed.sqlPart} className="mb-3 rounded-xl bg-[#fff8e6] px-4 py-3 text-[14px] leading-5 text-[#5c4300]">
                {tt("Gumroad import turns on after the database update (SQL part {part}).", { part: listed.sqlPart })}
              </p>
            ) : null}
            {listed.truncated ? <p className={cn(MUTED, "mb-3")}>{tt("Showing the first {count} products.", { count: products.length })}</p> : null}

            <section className={card} data-gumroad-products="">
              <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[#eef0f2] px-4">
                <p className="text-[14px] font-medium text-[#1a1a2e]">
                  {products.length === 0 ? tt("No products on this Gumroad account") : tt("{selected} of {count} selected", { selected: chosen.length, count: products.length })}
                </p>
                {choosable.length > 1 ? (
                  <button type="button" className="h-11 text-[14px] font-medium text-[#6d28d9] sm:h-8 sm:text-[13px]" onClick={() => setAll(chosen.length < choosable.length)}>
                    {chosen.length < choosable.length ? tt("Select all") : tt("Clear")}
                  </button>
                ) : null}
              </div>
              <ul>
                {products.map((p) => (
                  <ProductRow
                    key={p.gumroadId}
                    product={p}
                    draft={drafts[p.gumroadId]}
                    currency={currency}
                    expanded={open.has(p.gumroadId)}
                    disabled={importing}
                    onToggle={() => toggleOpen(p.gumroadId)}
                    onChange={(c) => update(p.gumroadId, c)}
                  />
                ))}
              </ul>
            </section>
          </>
        )}
      </div>

      {listed && !results && products.length > 0 ? (
        <div className="sticky bottom-0 z-30 border-t border-[#e5e7eb] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_rgba(17,24,39,0.10)]">
          <div className={cn("mx-auto flex min-h-16 items-center justify-between gap-3 py-2.5", WIDTH, GUTTER)}>
            <p className={cn(MUTED, "min-w-0")}>
              {progress
                ? tt("Importing {done} of {total}", { done: progress.done, total: progress.total })
                : missingPrice.length
                  ? tt("{count} need a price", { count: missingPrice.length })
                  : tt("Imported as drafts. Nothing is published.")}
            </p>
            <button type="button" className={PRIMARY} disabled={importing || !listed.ready || chosen.length === 0} onClick={() => void runImport()} data-gumroad-run="">
              {chosen.length === 1 ? tt("Import 1 product") : tt("Import {count} products", { count: chosen.length })}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ProductRow({
  product: p,
  draft,
  currency,
  expanded,
  disabled,
  onToggle,
  onChange,
}: {
  product: Candidate
  draft: Draft | undefined
  currency: string
  expanded: boolean
  disabled: boolean
  onToggle: () => void
  onChange: (c: Partial<Draft>) => void
}) {
  const selectable = !p.unsupported && !p.importedProductId && !!draft
  const price = draft ? readPrice(draft.price, currency) : null
  const notes = p.notes.map((n) => noteText(n, p, currency)).filter((n): n is string => !!n)
  const panel = `gumroad-row-${p.gumroadId.replace(/[^A-Za-z0-9_-]/g, "")}`

  return (
    <li className="border-b border-[#eef0f2] last:border-b-0" data-gumroad-row={p.gumroadId}>
      <div className="flex min-h-16 items-center gap-3 px-4 py-2.5">
        {selectable ? (
          <Checkbox checked={!!draft?.selected} onChange={(on) => onChange({ selected: on })} label={tt("Import {name}", { name: p.title })} />
        ) : (
          <span className="h-4 w-4 shrink-0" aria-hidden />
        )}
        {p.images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.images[0]} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-lg bg-[#f1f2f4] object-cover" />
        ) : (
          <span className="h-10 w-10 shrink-0 rounded-lg bg-[#f1f2f4]" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-[#1a1a2e] sm:text-[14px]">{draft?.title || p.title}</p>
          <p className={cn(MUTED, !p.unsupported && "truncate")}>
            {p.unsupported
              ? unsupportedText(p)
              : p.importedProductId
                ? tt("Already in your store")
                : price !== null
                  ? p.payWhatYouWant
                    ? tt("Pay what you want, from {price}", { price: formatMoney(price, currency) })
                    : formatMoney(price, currency)
                  : tt("Needs a price")}
          </p>
        </div>
        {!p.published ? <StatusBadge tone="neutral" className="max-sm:hidden">{tt("Unpublished on Gumroad")}</StatusBadge> : null}
        {p.importedProductId ? (
          <Link href={editHref(p.importedProductId)} className={cn(buttonSecondary, "max-sm:h-10")}>
            {tt("Edit")}
          </Link>
        ) : selectable ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={panel}
            aria-label={expanded ? tt("Close {name}", { name: p.title }) : tt("Review {name}", { name: p.title })}
            onClick={onToggle}
            className={cn(iconButton, "h-11 w-11 sm:h-8 sm:w-8")}
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform duration-150", expanded && "rotate-180")} />
          </button>
        ) : null}
      </div>

      {selectable && expanded && draft ? (
        <div id={panel} className="space-y-3 px-4 pb-4 sm:pl-[60px]">
          <div>
            <label className={LABEL} htmlFor={`${panel}-title`}>
              {tt("Title")}
            </label>
            <input id={`${panel}-title`} className={INPUT} value={draft.title} disabled={disabled} maxLength={200} onChange={(e) => onChange({ title: e.target.value })} />
          </div>
          <div>
            <label className={LABEL} htmlFor={`${panel}-price`}>
              {p.payWhatYouWant ? tt("Lowest price ({currency})", { currency }) : tt("Price ({currency})", { currency })}
            </label>
            <input
              id={`${panel}-price`}
              className={cn(INPUT, "sm:max-w-[200px]", draft.price && price === null && "border-[#e3a39b]")}
              inputMode="decimal"
              placeholder="0.00"
              value={draft.price}
              disabled={disabled}
              onChange={(e) => onChange({ price: e.target.value })}
            />
            {p.notes.includes("currency") ? null : <p className={cn(MUTED, "mt-1")}>{tt("On Gumroad: {price}", { price: gumroadPriceLabel(p) })}</p>}
          </div>
          {p.variants.length ? (
            <fieldset className="min-w-0">
              <legend className={LABEL}>{tt("Options")}</legend>
              <ul className="space-y-2">
                {p.variants.map((v, i) => (
                  <li key={`${v.name}-${i}`} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-[14px] text-[#1a1a2e]">{v.name}</span>
                    <input
                      aria-label={tt("Price of {name}", { name: v.name })}
                      className={cn(INPUT, "w-[120px] shrink-0")}
                      inputMode="decimal"
                      placeholder={draft.price || "0.00"}
                      value={draft.variantPrices[i] ?? ""}
                      disabled={disabled}
                      onChange={(e) => {
                        const next = [...draft.variantPrices]
                        next[i] = e.target.value
                        onChange({ variantPrices: next })
                      }}
                    />
                  </li>
                ))}
              </ul>
            </fieldset>
          ) : null}
          {p.excerpt ? (
            <div>
              <p className={LABEL}>{tt("Description")}</p>
              <p className="line-clamp-4 whitespace-pre-line text-[14px] leading-5 text-[#3f3f46]">{p.excerpt}</p>
            </div>
          ) : null}
          {notes.map((n) => (
            <p key={n} className="rounded-lg bg-[#fff8e6] px-3 py-2 text-[13px] leading-5 text-[#5c4300]">
              {n}
            </p>
          ))}
        </div>
      ) : null}
      {selectable && draft?.selected ? (
        <p className={cn(MUTED, "px-4 pb-3 sm:pl-[60px]")} data-files-note="">
          {tt("Files are not copied. Upload them again in the product editor.")}
        </p>
      ) : null}
    </li>
  )
}

function Done({ results }: { results: { id: string; title: string; outcome: Outcome }[] }) {
  const made = results.filter((r) => r.outcome.kind === "imported").length
  return (
    <section className={card} data-gumroad-done="">
      <div className="border-b border-[#eef0f2] px-4 py-3.5">
        <p className="text-[15px] font-semibold text-[#1a1a2e]">{made === 1 ? tt("1 draft added") : tt("{count} drafts added", { count: made })}</p>
        <p className={cn(MUTED, "mt-0.5")}>{tt("Open each one, upload its files, then publish it.")}</p>
      </div>
      <ul>
        {results.map((r) => (
          <li key={r.id} className="flex min-h-16 items-center gap-3 border-b border-[#eef0f2] px-4 py-2.5 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium text-[#1a1a2e] sm:text-[14px]">{r.title}</p>
              <p className={cn(MUTED)}>
                {r.outcome.kind === "imported"
                  ? [
                      tt("Draft. Add its files."),
                      r.outcome.imagesFailed > 0 ? tt("{count} pictures did not copy.", { count: r.outcome.imagesFailed }) : "",
                      r.outcome.variantsSaved ? "" : tt("Its options did not save. Add them in the editor."),
                    ]
                      .filter(Boolean)
                      .join(" ")
                  : r.outcome.kind === "exists"
                    ? tt("Already in your store")
                    : r.outcome.message}
              </p>
            </div>
            {r.outcome.kind !== "failed" ? (
              <Link href={editHref(r.outcome.productId)} className={cn(buttonSecondary, "max-sm:h-10")}>
                {tt("Edit")}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="flex justify-end border-t border-[#eef0f2] px-4 py-3">
        <Link href="/app/products" className={SECONDARY}>
          {tt("Back to products")}
        </Link>
      </div>
    </section>
  )
}
