"use client"

/**
 * ===========================================================================
 *  THE PRODUCTS THIS SECTION SHOWS, IN THE ORDER THEY ARE SHOWN
 * ===========================================================================
 * The control for `product_list`. What it holds is ids; what it shows is
 * the products: a picture, a name and a price per row, the way the shop
 * lists them, so the choice is made by recognising products rather than by
 * reading ids.
 *
 * Up and Down reorder, the X removes, and Add product opens the rest of the
 * shop under the list with a search box, in the flow of the sidebar like
 * every other picker here (field-popover.tsx), so it cannot be clipped by
 * the sheet it is in. A product that was chosen and has since been
 * unpublished or deleted stays in the list, named as missing, until
 * somebody removes it: it is still in the section's settings, and a row
 * that silently disappears is a setting nobody can see.
 */
import * as React from "react"
import { ArrowDown, ArrowUp, Plus, Search, X } from "lucide-react"

import { FieldPopover, usePhoneLayout } from "@/components/website-builder/field-popover"
import { cn } from "@/lib/utils"
import { useEditorFieldEnv, type PickerProduct } from "./context"
import { ADD_BUTTON, ICON_BUTTON, NOTE } from "./styles"

const DEFAULT_LIMIT = 12

function Thumb({ product }: { product?: PickerProduct }) {
  return product?.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={product.image} alt="" loading="lazy" decoding="async" width={36} height={36} className="h-9 w-9 shrink-0 rounded-md border border-border object-cover" />
  ) : (
    <span aria-hidden className="h-9 w-9 shrink-0 rounded-md border border-border bg-muted" />
  )
}

export function ProductListControl({
  value,
  onChange,
  limit,
  label,
}: {
  value: unknown
  onChange: (ids: string[]) => void
  limit?: number
  label?: string
}) {
  const env = useEditorFieldEnv()
  const phone = usePhoneLayout()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const products = env?.products ?? []
  const byId = React.useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const byUrl = React.useMemo(() => new Map(products.filter((p) => p.url).map((p) => [p.url, p])), [products])
  const chosen = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []
  const max = typeof limit === "number" && limit > 0 ? Math.min(24, limit) : DEFAULT_LIMIT
  const find = (key: string) => byId.get(key) ?? byUrl.get(key)

  const move = (from: number, to: number) => {
    if (to < 0 || to >= chosen.length) return
    const next = [...chosen]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onChange(next)
  }
  const remove = (at: number) => onChange(chosen.filter((_, i) => i !== at))
  const add = (id: string) => {
    if (chosen.includes(id) || chosen.length >= max) return
    onChange([...chosen, id])
    setQuery("")
    if (chosen.length + 1 >= max) setOpen(false)
  }

  const taken = new Set(chosen.map((k) => find(k)?.id ?? k))
  const q = query.trim().toLowerCase()
  const offer = products.filter((p) => !taken.has(p.id) && (!q || p.title.toLowerCase().includes(q)))

  return (
    <div className="space-y-2" data-product-list="">
      {chosen.length > 0 && (
        <ul className="space-y-1.5" aria-label={label ? `${label}, in order` : "Chosen products, in order"}>
          {chosen.map((key, i) => {
            const p = find(key)
            return (
              <li key={`${key}-${i}`} className="flex items-center gap-2 rounded-lg border border-border bg-background p-1.5 pr-1">
                <Thumb product={p} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-[13px] max-sm:text-[15px] font-medium", !p && "text-muted-foreground")}>
                    {p ? p.title : "A product that is no longer published"}
                  </span>
                  {p?.price && <span className="block text-[11px] max-sm:text-[13px] text-muted-foreground tabular-nums">{p.price}</span>}
                </span>
                <button type="button" className={ICON_BUTTON} aria-label={`Move ${p?.title ?? "product"} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" className={ICON_BUTTON} aria-label={`Move ${p?.title ?? "product"} down`} disabled={i === chosen.length - 1} onClick={() => move(i, i + 1)}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button type="button" className={ICON_BUTTON} aria-label={`Remove ${p?.title ?? "product"}`} onClick={() => remove(i)}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {products.length === 0 ? (
        <p className={NOTE}>Products you publish in your shop can be chosen here.</p>
      ) : chosen.length >= max ? (
        <p className={NOTE}>This section shows {max} at most. Remove one to add another.</p>
      ) : (
        <FieldPopover
          open={open}
          onOpenChange={(o) => { setOpen(o); if (!o) setQuery("") }}
          trigger={
            <button type="button" className={ADD_BUTTON} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              <Plus className="h-3.5 w-3.5" />
              Add product
            </button>
          }
        >
          <div className="border-b border-border px-2.5 py-2">
            <label className="flex items-center gap-2">
              <Search aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                type="search"
                autoFocus={!phone}
                className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Search your products"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && offer[0]) {
                    e.preventDefault()
                    add(offer[0].id)
                  }
                }}
              />
            </label>
          </div>
          <ul role="listbox" aria-label="Your products" className="max-h-60 overflow-y-auto wb-slim-scroll py-1">
            {offer.length === 0 && <li className="px-3 py-2.5 text-[13px] text-muted-foreground">{q ? "Nothing matches that." : "Every product is already in the list."}</li>}
            {offer.map((p) => (
              <li key={p.id} role="option" aria-selected={false}>
                <button type="button" className="flex w-full items-center gap-2.5 px-2.5 py-1.5 max-sm:min-h-12 text-left transition-colors hover:bg-muted/60" onClick={() => add(p.id)}>
                  <Thumb product={p} />
                  <span className="min-w-0 flex-1 truncate text-[13px] max-sm:text-[15px]">{p.title}</span>
                  {p.price && <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{p.price}</span>}
                </button>
              </li>
            ))}
          </ul>
        </FieldPopover>
      )}
    </div>
  )
}

/**
 * ===========================================================================
 *  ONE PRODUCT, CHOSEN BY ITS PICTURE AND NAME
 * ===========================================================================
 * The control for `product_picker`. It used to be a plain select of names,
 * with no picture, no search and nothing to say which product a long list
 * of similar names meant. Now it is the list control's row, alone: the
 * chosen product with its picture and price, Change to search the shop, and
 * the X to clear it.
 *
 * WHAT IT STORES is the product's address (`/products/<slug>`), as it always
 * has, so every section printing `{{ settings.product | url }}` keeps
 * working; the engine reads the product's id, address or handle alike
 * (lib/storelib-theme/resolve.ts productRef).
 *
 * THIS PAGE'S PRODUCT. On the product template the first choice is the
 * product the page is about (`@current`, resolve.ts CURRENT_REF), Shopify's
 * dynamic source: one section set once shows each product on its own page.
 */
const CURRENT_REF = "@current"

export function ProductPickerControl({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const env = useEditorFieldEnv()
  const phone = usePhoneLayout()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const products = env?.products ?? []
  const onProductPage = env?.template === "product"
  const current = value.trim()
  const chosen = current && current !== CURRENT_REF ? products.find((p) => p.url === current || p.id === current || p.url === `/products/${current}`) : undefined
  const q = query.trim().toLowerCase()
  const offer = products.filter((p) => p.id !== chosen?.id && (!q || p.title.toLowerCase().includes(q)))
  const pick = (v: string) => {
    onChange(v)
    setQuery("")
    setOpen(false)
  }

  return (
    <div className="space-y-2" data-product-picker="">
      {current ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background p-1.5 pr-1">
          {current === CURRENT_REF ? <span aria-hidden className="h-9 w-9 shrink-0 rounded-md border border-dashed border-border bg-muted" /> : <Thumb product={chosen} />}
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-[13px] max-sm:text-[15px] font-medium", current !== CURRENT_REF && !chosen && "text-muted-foreground")}>
              {current === CURRENT_REF ? "This page's product" : chosen ? chosen.title : "A product that is no longer published"}
            </span>
            {current === CURRENT_REF ? (
              <span className="block text-[11px] max-sm:text-[13px] text-muted-foreground">Each product page shows its own</span>
            ) : (
              chosen?.price && <span className="block text-[11px] max-sm:text-[13px] text-muted-foreground tabular-nums">{chosen.price}</span>
            )}
          </span>
          <button type="button" className={ICON_BUTTON} aria-label={`Clear ${label ?? "product"}`} onClick={() => onChange("")}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {products.length === 0 && !onProductPage ? (
        <p className={NOTE}>Products you publish in your shop can be chosen here.</p>
      ) : (
        <FieldPopover
          open={open}
          onOpenChange={(o) => { setOpen(o); if (!o) setQuery("") }}
          trigger={
            <button type="button" className={ADD_BUTTON} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {current ? "Change" : <><Plus className="h-3.5 w-3.5" />Choose a product</>}
            </button>
          }
        >
          <div className="border-b border-border px-2.5 py-2">
            <label className="flex items-center gap-2">
              <Search aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                type="search"
                autoFocus={!phone}
                className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Search your products"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && offer[0]) {
                    e.preventDefault()
                    pick(offer[0].url || offer[0].id)
                  }
                }}
              />
            </label>
          </div>
          <ul role="listbox" aria-label="Your products" className="max-h-60 overflow-y-auto wb-slim-scroll py-1">
            {onProductPage && current !== CURRENT_REF && !q && (
              <li role="option" aria-selected={false}>
                <button type="button" className="flex w-full items-center gap-2.5 px-2.5 py-1.5 max-sm:min-h-12 text-left transition-colors hover:bg-muted/60" onClick={() => pick(CURRENT_REF)}>
                  <span aria-hidden className="h-9 w-9 shrink-0 rounded-md border border-dashed border-border bg-muted" />
                  <span className="min-w-0 flex-1 truncate text-[13px] max-sm:text-[15px] font-medium">This page&rsquo;s product</span>
                </button>
              </li>
            )}
            {offer.length === 0 && <li className="px-3 py-2.5 text-[13px] text-muted-foreground">{q ? "Nothing matches that." : "No other products yet."}</li>}
            {offer.map((p) => (
              <li key={p.id} role="option" aria-selected={false}>
                <button type="button" className="flex w-full items-center gap-2.5 px-2.5 py-1.5 max-sm:min-h-12 text-left transition-colors hover:bg-muted/60" onClick={() => pick(p.url || p.id)}>
                  <Thumb product={p} />
                  <span className="min-w-0 flex-1 truncate text-[13px] max-sm:text-[15px]">{p.title}</span>
                  {p.price && <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{p.price}</span>}
                </button>
              </li>
            ))}
          </ul>
        </FieldPopover>
      )}
    </div>
  )
}
