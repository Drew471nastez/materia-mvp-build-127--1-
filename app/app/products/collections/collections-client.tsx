"use client"

/**
 * ===========================================================================
 *  PRODUCTS › COLLECTIONS
 * ===========================================================================
 * The shop's collections, drawn the way the products list draws products
 * (../products-client.tsx): the same bar, column, gutters and white card,
 * a phone row of 64px with a 50px cover, and a light table from 768px. The
 * page arrives with its rows (./page.tsx reads them on the server), so it
 * lands whole, with no skeleton and nothing fetched after it opens.
 *
 * A collection opens in the editor (./collection-editor.tsx): a dialog on a
 * computer and the app's shared bottom sheet on a phone, over this list.
 *
 * ONE QUESTION AT A TIME. The app's confirm (../new/confirm-sheet.tsx) is a
 * sheet on a phone and a small dialog on a computer, and a sheet or dialog
 * drawn over another one is drawn under it on one of the two. So the
 * questions this page asks (discard the changes, delete the collection) are
 * asked once the editor has gone: it slides away, the question rises, and
 * "Keep editing" brings the editor back exactly as it was left.
 */

import * as React from "react"
import { cn } from "@/lib/utils"
import { accentDepth } from "@/components/ui/depth-button"
import { GUTTER, LIST_BAR, PaneBar } from "../../orders/order-parts"
import { useConfirm } from "../new/confirm-sheet"
import { Pill, usePill } from "../../coupons/coupon-parts"
import { CollectionEditor } from "./collection-editor"
import { CollectionCover, StatusMark, countWords, howWords, picturesOf, type Collection, type CollectionProduct } from "./collection-parts"
import { pressMark } from "@/lib/press-mark"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"
import { useStoreCurrency } from "@/lib/store/currency-context"

/* The products page's own measures (../products-client.tsx), so the two pages are one place. */
const BAR_BUTTON_SIZE = "lg:h-[35px] lg:px-[13px] lg:text-[14.5px]"
const PAGE_WIDTH = "max-w-[1200px] lg:max-w-[1323px]"
const PAGE_GUTTER = "lg:px-[35px]"
const PAGE_BAR = "lg:min-h-[73px] lg:pb-[9px] lg:pt-[15px]"
/** A 32px button that a finger still gets 44px of on a phone. */
const PRESS = "relative max-md:after:absolute max-md:after:-inset-1.5 max-md:after:content-['']"
/** New collection: the products page's New product, violet, the one violet button here. */
const NEW_LOOK = cn(accentDepth, PRESS, "h-8 gap-1.5 rounded-lg px-3 text-[13px]", BAR_BUTTON_SIZE)

/** How long the computer's dialog takes to fade out (components/ui/dialog.tsx), before a question takes its place. */
const DIALOG_LEAVE_MS = 200

async function send(url: string, method: string, body?: unknown): Promise<{ ok: true; collections: Collection[] } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !Array.isArray(data?.collections)) return { ok: false, error: typeof data?.error === "string" ? data.error : tt("That did not go through. Try again.") }
    return { ok: true, collections: data.collections as Collection[] }
  } catch {
    return { ok: false, error: tt("No connection. Try again in a moment.") }
  }
}

export interface SaveBody {
  title: string
  description: string
  kind: "manual" | "smart"
  rules: Collection["rules"]
  match: "all" | "any"
  sort: string
  published: boolean
  productIds: string[]
}

export function CollectionsClient({ initialCollections, products }: { initialCollections: Collection[]; products: CollectionProduct[] }) {
  const [list, setList] = React.useState(initialCollections)
  /* The server's list again (a refresh: a change of the store's currency converts price conditions): it is the truth from here, as Coupons does. */
  const [seen, setSeen] = React.useState(initialCollections)
  if (seen !== initialCollections) {
    setSeen(initialCollections)
    setList(initialCollections)
  }
  /* A price condition is in the store's currency: "Price is less than 30 lei". */
  const storeCurrency = useStoreCurrency()
  const byId = React.useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const [notice, say] = usePill()
  const [ask, confirmSheet] = useConfirm()

  /* The editor: which collection (null for a new one), and whether it is up. It stays mounted while a question is asked, so it comes back as it was. */
  const [editing, setEditing] = React.useState<{ key: number; collection: Collection | null } | null>(null)
  const [open, setOpen] = React.useState(false)
  const afterClose = React.useRef<(() => void) | null>(null)

  const start = (collection: Collection | null) => {
    afterClose.current = null
    setEditing({ key: Date.now(), collection })
    setOpen(true)
  }
  /*
    ?collection=<id>, from the search in the header (lib/search/app-search.ts):
    that collection opens as its row would open it. Read once, then taken
    out of the address, so Back and a reload land on the list.
  */
  const openedFromLink = React.useRef(false)
  React.useEffect(() => {
    if (openedFromLink.current) return
    openedFromLink.current = true
    const url = new URL(window.location.href)
    const id = url.searchParams.get("collection")
    if (!id) return
    url.searchParams.delete("collection")
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
    const found = list.find((c) => c.id === id)
    if (found) start(found)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  /** Takes the editor down; `then` runs once it has gone (by default, it is put away). */
  const close = (then?: () => void) => {
    afterClose.current = then ?? (() => setEditing(null))
    setOpen(false)
  }
  const closed = React.useCallback(() => {
    const then = afterClose.current
    afterClose.current = null
    then?.()
  }, [])

  const requestClose = (dirty: boolean) => {
    if (!dirty) return close()
    close(async () => {
      const yes = await ask({ title: tt("Discard changes?"), body: tt("Your edits to this collection will be lost."), confirm: tt("Discard"), cancel: tt("Keep editing") })
      if (yes) setEditing(null)
      else setOpen(true)
    })
  }

  const save = async (id: string | null, body: SaveBody): Promise<string | null> => {
    const r = await send(id ? `/api/collections/${id}` : "/api/collections", id ? "PUT" : "POST", body)
    if (!r.ok) return r.error
    setList(r.collections)
    close()
    say(tt("{value} saved", { value: body.title.trim() }))
    return null
  }

  const remove = (c: Collection) => {
    close(async () => {
      const yes = await ask({
        title: tt("Delete {title}?", { title: c.title }),
        body: tt("The collection and its page on your website go. The products in it stay as they are."),
        confirm: tt("Delete"),
        cancel: tt("Keep it"),
      })
      if (!yes) return setOpen(true)
      setEditing(null)
      const r = await send(`/api/collections/${c.id}`, "DELETE")
      if (!r.ok) return say(r.error, "error")
      setList(r.collections)
      say(tt("{title} deleted", { title: c.title }))
    })
  }

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter">
      <Pill notice={notice} />
      <PaneBar width={PAGE_WIDTH} className={cn(LIST_BAR, PAGE_BAR, PAGE_GUTTER)}>
        <h1 className="min-w-0 truncate text-[22px] font-bold leading-7 text-[#1a1a2e] sm:text-[25px] sm:leading-8 lg:text-[28px] lg:leading-[35px]">{tt("Collections")}</h1>
        {list.length > 0 ? (
          <button type="button" data-new-collection="" className={NEW_LOOK} onClick={() => start(null)}>
            {tt("New collection")}
          </button>
        ) : null}
      </PaneBar>

      <div className={cn("mx-auto pb-2 md:pb-8", PAGE_WIDTH, GUTTER, PAGE_GUTTER)}>
        <section aria-label={tt("Collections")} data-collections-card="" className="relative mt-1 overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] md:mt-2 lg:mt-[9px]">
          {list.length === 0 ? (
            <div data-empty="" className="flex flex-col items-center px-6 py-16 text-center md:py-14 lg:py-[62px]">
              <p className="text-[16px] font-semibold text-[#1a1a2e] md:text-[15px] lg:text-[16.5px]">{tt("No collections yet")}</p>
              <p className="mt-1 max-w-[340px] text-[14px] leading-5 text-[#6b7280] md:text-[13px] lg:max-w-[372px] lg:text-[14.5px]">
                {tt("Group products by hand or by rules, like New in, Courses or Under $30, and show a group on your website.")}
              </p>
              <button type="button" onClick={() => start(null)} className={cn(NEW_LOOK, "mt-5 max-md:h-10 max-md:px-4 max-md:text-[14px]")}>
                {tt("Create collection")}
              </button>
            </div>
          ) : (
            <>
              {/*
                A PHONE: one 64px row per collection, the whole row the press.
                The cover at 50px, the name, and under it how many products and
                what decides them, in grey. A hidden collection says so first,
                with a grey dot; a published one says nothing.
              */}
              <ul aria-label={tt("Collections")} data-list="" className="md:hidden">
                {list.map((c) => (
                  <li
                    key={c.id}
                    data-row={c.id}
                    className="relative flex h-16 items-center gap-3 px-3 data-[pressed]:bg-[#eef0f2] [li+&]:before:absolute [li+&]:before:left-[74px] [li+&]:before:right-0 [li+&]:before:top-0 [li+&]:before:h-px [li+&]:before:bg-[#eceef1]"
                  >
                    <button type="button" data-row-open="" aria-label={c.title} onClick={() => start(c)} {...pressMark} className="absolute inset-0 z-0 cursor-pointer outline-none [-webkit-tap-highlight-color:transparent] focus-visible:shadow-[inset_0_0_0_2px_#1a1a2e]" />
                    <CollectionCover collection={c} pictures={picturesOf(c, byId)} size="phone" />
                    <span className="pointer-events-none min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium leading-[18px] tracking-[-0.01em] text-[#1a1a2e]">{c.title}</span>
                      <span className="mt-1 block h-4 truncate text-[12px] leading-4 text-[#6b7280]">
                        {c.published ? null : (
                          <>
                            <StatusMark published={false} />
                            <Sep />
                          </>
                        )}
                        <span className="tabular-nums">{countWords(c.productIds.length)}</span>
                        <Sep />
                        <span>{howWords(c, storeCurrency)}</span>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>

              {/*
                A COMPUTER: the products table's rows, heights, pictures and
                text, with what decides each collection's products written out
                (Shopify's "Product conditions"), and the whole row opens it.
              */}
              <table className="hidden w-full table-fixed border-separate border-spacing-0 text-[13px] md:table lg:text-[14.5px]">
                <thead>
                  <tr className="h-9 text-left text-[12px] text-[#6b7280] lg:h-[40px] lg:text-[13.5px] xl:h-[44px]">
                    <th scope="col" className="border-b border-[#eef0f2] pl-4 pr-3 font-medium lg:pl-[18px] lg:pr-[13px] xl:pl-[22px]">{tt("Collection")}</th>
                    <th scope="col" className="hidden w-[34%] border-b border-[#eef0f2] px-3 font-medium lg:table-cell lg:px-[13px]">{tt("Product conditions")}</th>
                    <th scope="col" className="w-[112px] border-b border-[#eef0f2] px-3 font-medium lg:w-[132px] lg:px-[13px]">{tt("Status")}</th>
                    <th scope="col" className="w-[104px] border-b border-[#eef0f2] pl-3 pr-4 text-right font-medium lg:w-[124px] lg:pl-[13px] lg:pr-[18px] xl:pr-[22px]">{tt("Products")}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((c) => (
                    <tr
                      key={c.id}
                      data-row={c.id}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("button")) return
                        start(c)
                      }}
                      className="group h-14 cursor-pointer lg:h-[62px] xl:h-[70px] [tr+&>td]:border-t [tr+&>td]:border-[#f1f2f4]"
                    >
                      <td className="bg-white pl-4 pr-3 group-hover:bg-[#fafafb] lg:pl-[18px] lg:pr-[13px] xl:pl-[22px]">
                        <div className="flex min-w-0 items-center gap-3 lg:gap-[13px]">
                          <CollectionCover collection={c} pictures={picturesOf(c, byId)} size="table" />
                          <button type="button" onClick={() => start(c)} className="min-w-0 cursor-pointer truncate text-left text-[13px] font-medium text-[#1a1a2e] outline-none hover:underline focus-visible:underline lg:text-[14.5px] xl:text-[15.5px]">
                            {c.title}
                          </button>
                        </div>
                      </td>
                      <td className="hidden truncate bg-white px-3 text-[#4b5563] group-hover:bg-[#fafafb] lg:table-cell lg:px-[13px]">{howWords(c, storeCurrency)}</td>
                      <td className="whitespace-nowrap bg-white px-3 group-hover:bg-[#fafafb] lg:px-[13px]">
                        <StatusMark published={c.published} strong={c.published} />
                      </td>
                      <td className="whitespace-nowrap bg-white pl-3 pr-4 text-right tabular-nums text-[#1a1a2e] group-hover:bg-[#fafafb] lg:pl-[13px] lg:pr-[18px] xl:pr-[22px]">
                        {c.productIds.length.toLocaleString(appLocale())}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div data-footer="" className="hidden h-10 items-center border-t border-[#eef0f2] px-4 md:flex lg:h-[44px] lg:px-[18px] xl:h-[48px] xl:px-[22px]">
                <span className="text-[12px] tabular-nums text-[#6b7280] lg:text-[13.5px]">{tt("{n, plural, one {# collection} other {# collections}}", { n: list.length })}</span>
              </div>
            </>
          )}
        </section>
      </div>

      {editing ? (
        <CollectionEditor
          key={editing.key}
          open={open}
          collection={editing.collection}
          products={products}
          onRequestClose={requestClose}
          onSave={save}
          onDelete={remove}
          onClosed={closed}
          leaveMs={DIALOG_LEAVE_MS}
        />
      ) : null}
      {confirmSheet}
    </div>
  )
}

/** The middle dot between the parts of a phone row's second line. */
function Sep() {
  return (
    <span aria-hidden className="mx-1.5 text-[#c4c8ce]">
      &middot;
    </span>
  )
}
