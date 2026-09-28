"use client"

/**
 * ===========================================================================
 *  SEARCH, AS ITS OWN SCREEN
 * ===========================================================================
 * Where the buyer's tab bar's Search goes (components/nav/buyer-tab-bar.tsx).
 * Explore already searches: its field is under its heading and a query
 * lands on Explore with the results (`/explore?q=`). What a phone needs on
 * top of that is a place a thumb can go to type straight away, from any
 * page, so this is that and nothing more:
 *
 *   THE FIELD      at the top, the focus in it as the screen arrives (the
 *                  tab bar asked for the keyboard on the press). The same
 *                  field as Explore's: 10px corners, the same depth. Search
 *                  on the keyboard's return key sends it to Explore's results.
 *   THE CATEGORIES under it, as a plain list: the other way into the
 *                  catalogue when you do not know the word yet.
 *
 * It carries Explore's search anchor, so the header does not grow a second
 * field while this one is on screen (lib/explore/use-search-handoff).
 *
 * A static route under /explore rather than /search: every root segment is a
 * word no creator can hold as a handle (lib/routes/reserved-segments), and
 * taking a common word away from creators who may already have it was not
 * this screen's to do.
 */

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { ChevronRight, Search, X } from "lucide-react"

import { CATEGORY_NAV } from "@/lib/marketplace/categories"
import { hasCategoryPage } from "@/lib/explore/category-pages"
import { SEARCH_ANCHOR_ATTR } from "@/lib/explore/use-search-handoff"

/** The categories that have a page of their own, in the catalogue's order. */
const BROWSE = CATEGORY_NAV.filter((c) => hasCategoryPage(c.id))

export function SearchScreen() {
  const router = useRouter()
  const [draft, setDraft] = useState("")
  const field = useRef<HTMLInputElement>(null)

  /* The focus, as the screen arrives. From the tab bar a hidden field already
     holds the keyboard, and this takes the focus from it; arriving any other
     way it is simply the field's focus. */
  useEffect(() => {
    field.current?.focus({ preventScroll: true })
  }, [])

  const send = () => {
    const q = draft.trim()
    if (!q) return
    field.current?.blur()
    router.push(`/explore?q=${encodeURIComponent(q)}`)
  }

  return (
    <div className="min-h-[60svh] bg-[#f8f9fa]" data-search-screen="">
      <div className="mx-auto w-full max-w-[720px] px-4 pb-8 pt-4 sm:px-6 sm:pt-8">
        <h1 className="sr-only">Search Storelib</h1>
        <div {...{ [SEARCH_ANCHOR_ATTR]: "" }}>
          <form
            role="search"
            className="relative"
            onSubmit={(e) => {
              e.preventDefault()
              send()
            }}
          >
            <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400" />
            <input
              ref={field}
              data-search-screen-field=""
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Search products, creators, topics..."
              aria-label="Search products, creators and topics"
              /* Explore's field, so the two read as the same control: 10px
                 corners, the same hairline and depth, 16px type so iOS does
                 not zoom to it. */
              className="h-[52px] w-full rounded-[10px] border border-neutral-200/80 bg-white pl-12 pr-12 text-[16px] text-neutral-900 shadow-[0_1px_3px_rgba(15,23,42,0.045),0_9px_27px_-16px_rgba(15,23,42,0.315)] outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-300 [&::-webkit-search-cancel-button]:appearance-none"
            />
            {draft ? (
              <button
                type="button"
                aria-label="Clear"
                onClick={() => {
                  setDraft("")
                  field.current?.focus()
                }}
                className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:text-neutral-700"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            ) : null}
          </form>
        </div>

        <h2 className="mb-2 mt-7 px-1 text-[13px] font-medium text-[#6b7280]">Browse categories</h2>
        <ul className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-search-categories="">
          {BROWSE.map((c) => (
            <li key={c.id} className="border-b border-[#f0f1f3] last:border-b-0">
              <Link
                href={c.href}
                className="flex min-h-[48px] items-center justify-between gap-3 px-4 text-[15px] text-[#1a1a2e] transition-colors active:bg-[#f3f4f6] hover:bg-[#fafafa]"
              >
                <span>{c.label}</span>
                <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[#9ca3af]" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
