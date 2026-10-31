import type { TocItem } from "@/lib/blog/article"

/**
 * ON THIS PAGE: the article's h2 and h3 headings as links (lib/blog/article
 * articleOutline gives both the list and the headings' ids, so they agree).
 * Plain links that work with no script; ./toc-spy marks the one being read
 * with aria-current, drawn as a thin ink rule on the list's hairline.
 *
 * Beside the article on a wide screen ("side"); on a phone and a tablet a
 * closed <details> under the header ("inline"), one tap to open.
 */
function List({ items }: { items: TocItem[] }) {
  return (
    <ol className="relative before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-[#e5e7eb]" data-blog-toc="">
      {items.map((t) => (
        <li key={t.id}>
          <a
            href={`#${t.id}`}
            className={`relative block py-[7px] pr-2 text-[14px] leading-snug text-[#6b7280] transition-colors before:absolute before:inset-y-[5px] before:left-0 before:w-[2px] before:rounded-full before:bg-transparent before:transition-colors hover:text-[#1a1a2e] aria-[current=true]:font-medium aria-[current=true]:text-[#1a1a2e] aria-[current=true]:before:bg-[#1a1a2e] max-lg:min-h-[44px] max-lg:flex max-lg:items-center ${t.level === 3 ? "pl-7 text-[13.5px]" : "pl-4"}`}
          >
            {t.text}
          </a>
        </li>
      ))}
    </ol>
  )
}

export function OnThisPage({ items, variant }: { items: TocItem[]; variant: "side" | "inline" }) {
  if (items.length < 2) return null
  if (variant === "side") {
    return (
      <nav aria-label="On this page">
        <p className="mb-3 text-[15px] font-medium text-[#1a1a2e]">On this page</p>
        <List items={items} />
      </nav>
    )
  }
  return (
    <details className="group border-y border-[#e5e7eb] lg:hidden" data-blog-toc-inline="">
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-medium text-[#1a1a2e] [&::-webkit-details-marker]:hidden">
        On this page
        <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 text-[#6b7280] transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 8l5 5 5-5" />
        </svg>
      </summary>
      <nav aria-label="On this page" className="pb-4">
        <List items={items} />
      </nav>
    </details>
  )
}
