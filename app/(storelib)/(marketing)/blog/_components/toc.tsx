import type { TocItem } from "@/lib/blog/article"

/**
 * ON THIS PAGE: the article's h2 and h3 headings as links (lib/blog/article
 * articleOutline gives both the list and the headings' ids, so they agree).
 * Plain links that work with no script; ./toc-spy marks the one being read
 * with aria-current, drawn as a thin ink rule on the list's hairline.
 *
 * Beside the article from 1200px ("side"); narrower, a closed <details>
 * above the body ("inline"), one tap to open, each link a 44px target.
 * Round 47: 14px in the rail (it was 13.5px for the h3), the one being
 * read in ink, semibold, with Storelib's violet rule. Round 49: drawn
 * heavier with a hairline stroke instead of a heavier weight, which is
 * wider and rewrapped a heading in the 260px rail as the reader scrolled,
 * moving everything under it (measured as layout shift).
 */
function List({ items }: { items: TocItem[] }) {
  return (
    <ol className="relative before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-[#e5e7eb]" data-blog-toc="">
      {items.map((t) => (
        <li key={t.id}>
          <a
            href={`#${t.id}`}
            className={`relative block py-2 pr-2 text-[14px] leading-[1.45] text-[#4b5563] transition-colors before:absolute before:inset-y-[6px] before:left-0 before:w-[2px] before:rounded-full before:bg-transparent before:transition-colors hover:text-[#1a1a2e] aria-[current=true]:text-[#1a1a2e] aria-[current=true]:[-webkit-text-stroke:0.4px_currentColor] aria-[current=true]:before:bg-[#7c3aed] max-[1199px]:flex max-[1199px]:min-h-[44px] max-[1199px]:items-center max-[1199px]:text-[16px] ${t.level === 3 ? "pl-8" : "pl-4"}`}
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
        <p className="mb-3 text-[15px] font-semibold text-[#1a1a2e]">On this page</p>
        <List items={items} />
      </nav>
    )
  }
  return (
    <details className="group rounded-[20px] bg-[#f5f5f6] px-5 min-[1200px]:hidden" data-blog-toc-inline="">
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 text-[16px] font-semibold text-[#1a1a2e] [&::-webkit-details-marker]:hidden">
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
