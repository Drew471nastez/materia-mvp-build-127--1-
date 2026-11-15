/**
 * The digital product the home page's commerce sections sell in their mocks
 * (How it works and the checkout scene): Nadia Brooks's e-book, "The Loop",
 * a street photography field guide to downtown Chicago. Its cover is one real
 * file (public/home/commerce/guide-loop.webp), the way a seller uploads it.
 */

export const EBOOK = {
  title: "The Loop",
  author: "Nadia Brooks",
  kind: "E-book",
  file: "The-Loop-Field-Guide.pdf",
  size: "24.6 MB",
  pages: 84,
  priceCents: 1900,
} as const

/* Landing round 5: the owner did not like "After Dark". The cover is the same file the checkout scene sells (guide-loop.webp), its title printed on it. */
export function EbookCover({ className = "" }: { className?: string }) {
  return (
    <span className={`ebc ${className}`}>
      <img className="ebc-img" src="/home/commerce/guide-loop.webp" alt="" width={600} height={800} loading="lazy" decoding="async" />
    </span>
  )
}

export const EBOOK_COVER_CSS = `
.ebc{position:relative;display:block;aspect-ratio:3/4;overflow:hidden;background:#ece8e1}
.ebc-img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover}
`

/** One stylesheet for every cover on the page (React keeps one copy per href). */
export function EbookCoverStyle() {
  return (
    <style href="w13-ebook-cover" precedence="default">
      {EBOOK_COVER_CSS}
    </style>
  )
}
