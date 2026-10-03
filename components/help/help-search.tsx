"use client"

/**
 * ===========================================================================
 *  THE HELP CENTER'S SEARCH
 * ===========================================================================
 * Results appear under the field as somebody types, from the same
 * searchHelp the /help/search page runs on the server. It is a form first:
 * without script, or on Enter with nothing highlighted, it submits to
 * /help/search?q=, which lists the same results as a page.
 *
 * A combobox by the ARIA pattern: the field owns a listbox, the arrow keys
 * move through it, Enter opens the highlighted article, Escape closes it.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { useRouter } from "next/navigation"
import { helpArticlePath, helpCategory } from "@/lib/help/articles"
import { searchHelp } from "@/lib/help/search"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { cn } from "@/lib/utils"

export function HelpSearch({ size = "large", defaultQuery = "", autoFocus = false }: { size?: "large" | "compact"; defaultQuery?: string; autoFocus?: boolean }) {
  const router = useRouter()
  const id = useId()
  const listId = `${id}-results`
  const [query, setQuery] = useState(defaultQuery)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const box = useRef<HTMLFormElement>(null)
  const physical = usePhysicalCommerceEnabled()
  const results = useMemo(() => searchHelp(query, 8, { physical }), [query, physical])
  const showing = open && query.trim().length > 0

  useEffect(() => {
    if (!showing) return
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", away)
    return () => document.removeEventListener("pointerdown", away)
  }, [showing])

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && results.length) {
      e.preventDefault()
      setOpen(true)
      setActive((i) => (i + 1) % results.length)
    } else if (e.key === "ArrowUp" && results.length) {
      e.preventDefault()
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1))
    } else if (e.key === "Enter" && showing && active >= 0 && results[active]) {
      e.preventDefault()
      router.push(helpArticlePath(results[active].article))
    } else if (e.key === "Escape") {
      if (showing) {
        e.preventDefault()
        setOpen(false)
        setActive(-1)
      }
    }
  }

  const large = size === "large"

  return (
    <form ref={box} action="/help/search" method="get" role="search" className="relative w-full">
      <label htmlFor={`${id}-q`} className="sr-only">
        Search the Help Center
      </label>
      <div className="relative">
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 text-[#9ca3af]", large ? "left-4 h-[18px] w-[18px]" : "left-3.5 h-4 w-4")}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
        >
          <circle cx="8.5" cy="8.5" r="5.75" />
          <path d="m13 13 4 4" />
        </svg>
        <input
          id={`${id}-q`}
          name="q"
          type="search"
          role="combobox"
          aria-expanded={showing}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showing && active >= 0 ? `${id}-r${active}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          enterKeyHint="search"
          placeholder={large ? "Search, for example: refund, custom domain, cash out" : "Search help"}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={cn(
            "w-full rounded-xl border border-[#d1d5db] bg-white text-[#1a1a2e] placeholder:text-[#9ca3af]",
            "outline-none transition-[border-color,box-shadow] duration-150 focus:border-[#1a1a2e] focus:shadow-[0_0_0_3px_rgba(26,26,46,0.08)]",
            "[&::-webkit-search-cancel-button]:appearance-none",
            large ? "h-12 pl-11 pr-4 text-[16px]" : "h-10 pl-10 pr-3 text-[15px]",
          )}
        />
      </div>

      {showing && (
        <div
          className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_12px_32px_-12px_rgba(17,24,39,0.18)]"
        >
          {results.length > 0 ? (
            <ul id={listId} role="listbox" aria-label="Articles" className="max-h-[min(420px,60vh)] overflow-y-auto py-1.5">
              {results.map((r, i) => (
                <li key={`${r.article.category}/${r.article.slug}`} id={`${id}-r${i}`} role="option" aria-selected={i === active}>
                  <a
                    href={helpArticlePath(r.article)}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                      e.preventDefault()
                      router.push(helpArticlePath(r.article))
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={cn("block px-4 py-2.5", i === active && "bg-[#f3f4f6]")}
                  >
                    <span className="block text-[14px] font-medium text-[#1a1a2e]">{r.article.title}</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-[#6b7280]">
                      <span className="text-[#4b5563]">{helpCategory(r.article.category)?.title}</span>
                      <span aria-hidden> · </span>
                      {r.snippet}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p id={listId} role="status" className="px-4 py-3.5 text-[14px] text-[#6b7280]">
              No articles match &ldquo;{query.trim()}&rdquo;. Try another word, or email support@storelib.com.
            </p>
          )}
        </div>
      )}
    </form>
  )
}
