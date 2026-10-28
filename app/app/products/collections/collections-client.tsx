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
 * A collection opens on a page of its own (./collection-editor.tsx, at
 * /app/products/collections/<id>, and /new for a new one), as a size chart
 * or an offer does (round 41, the owner: "Collections and edit collections
 * should act as subpages, not modals"): on a phone it rises over this list
 * and drops back to it. Coming back, the list says what was done and tints
 * the row (./list-return).
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { accentDepth } from "@/components/ui/depth-button"
import { GUTTER, LIST_BAR, PaneBar } from "../../orders/order-parts"
import { Pill, usePill } from "../../coupons/coupon-parts"
import { CollectionCover, StatusMark, countWords, howWords, picturesOf, type Collection, type CollectionProduct } from "./collection-parts"
import { LAYER_LEAVE_MS } from "@/components/app/page-layer"
import { tintReturnedRow } from "@/components/app/list-return"
import { holdLanding, prefetchAppPage } from "@/lib/ui/app-navigation"
import { collectionHref, collectionsReturn, newCollectionHref } from "./list-return"
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

export function CollectionsClient({ initialCollections, products }: { initialCollections: Collection[]; products: CollectionProduct[] }) {
  const router = useRouter()
  /* The collections as a collection's page saved them, laid over the ones the router kept (./list-return). */
  const [list, setList] = React.useState(() => collectionsReturn.peek()?.collections ?? initialCollections)
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
  const sectionRef = React.useRef<HTMLElement>(null)
  const [returning] = React.useState(() => collectionsReturn.isReturning())
  React.useLayoutEffect(() => {
    if (returning) holdLanding()
  }, [returning])
  React.useEffect(() => {
    const back = collectionsReturn.take()
    if (!back) return
    if (back.message) say(back.message)
    if (back.collections || back.deleted) router.refresh()
    if (back.id && !back.deleted) tintReturnedRow(sectionRef.current, back.id, LAYER_LEAVE_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the list lands
  }, [])
  const warmed = React.useRef(new Set<string>())
  const warm = (href: string) => {
    if (warmed.current.has(href)) return
    warmed.current.add(href)
    prefetchAppPage(router, href)
  }
  /* A collection opens on its own page, rising over the list on a phone. */
  const start = (collection: Collection | null) => collectionsReturn.open(router, collection ? collectionHref(collection.id) : newCollectionHref())
  /*
    ?collection=<id>, from an older link to the list: that collection's own
    page, in place of the list in the history.
  */
  React.useEffect(() => {
    const id = new URL(window.location.href).searchParams.get("collection")
    if (id && list.some((c) => c.id === id)) router.replace(collectionHref(id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter">
      <Pill notice={notice} />
      <PaneBar width={PAGE_WIDTH} className={cn(LIST_BAR, PAGE_BAR, PAGE_GUTTER)}>
        <h1 className="min-w-0 truncate text-[22px] font-bold leading-7 text-[#1a1a2e] sm:text-[25px] sm:leading-8 lg:text-[28px] lg:leading-[35px]">{tt("Collections")}</h1>
        {list.length > 0 ? (
          <button type="button" data-new-collection="" className={NEW_LOOK} onPointerEnter={() => warm(newCollectionHref())} onClick={() => start(null)}>
            {tt("New collection")}
          </button>
        ) : null}
      </PaneBar>

      <div className={cn("mx-auto pb-2 md:pb-8", PAGE_WIDTH, GUTTER, PAGE_GUTTER)}>
        <section ref={sectionRef} aria-label={tt("Collections")} data-collections-card="" className="relative mt-1 overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] md:mt-2 lg:mt-[9px]">
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
                    <button type="button" data-row-open="" aria-label={c.title} onClick={() => start(c)} onPointerDown={() => warm(collectionHref(c.id))} {...pressMark} className="absolute inset-0 z-0 cursor-pointer outline-none [-webkit-tap-highlight-color:transparent] focus-visible:shadow-[inset_0_0_0_2px_#1a1a2e]" />
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
                      onMouseEnter={() => warm(collectionHref(c.id))}
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
