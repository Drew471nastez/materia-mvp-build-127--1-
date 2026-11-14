/**
 * The digital product the home page's commerce sections sell in their mocks
 * (How it works and the checkout scene): Nadia Brooks's e-book, "After Dark",
 * a field guide to photographing cities at night. Its cover is drawn here the
 * way a photo book's cover looks, a real photograph (Unsplash, photo
 * 1601042879364-f3947d3f9c16, stored under public/home/commerce) running to
 * the edges with the title set over a dark foot, so it stays sharp at any
 * size. Below 64px wide only the photograph shows, the way a small thumbnail
 * of a cover reads.
 */

export const EBOOK = {
  title: "After Dark",
  author: "Nadia Brooks",
  kind: "E-book",
  file: "After-Dark-Field-Guide.pdf",
  size: "24.6 MB",
  pages: 84,
  priceCents: 1900,
} as const

export function EbookCover({ className = "" }: { className?: string }) {
  return (
    <span className={`ebc ${className}`}>
      <img className="ebc-img" src="/home/commerce/ebook-night.webp" alt="" width={540} height={720} loading="lazy" decoding="async" />
      <span className="ebc-t">
        <small>A night photography field guide</small>
        <b>{EBOOK.title}</b>
        <i>{EBOOK.author}</i>
      </span>
    </span>
  )
}

export const EBOOK_COVER_CSS = `
.ebc{position:relative;display:block;aspect-ratio:3/4;overflow:hidden;background:#0d0f14;color:#fff;container-type:inline-size;text-align:left}
.ebc-img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover;object-position:52% 50%}
.ebc::after{content:"";position:absolute;inset:40% 0 0;background:linear-gradient(180deg,rgba(9,10,14,0),rgba(9,10,14,.82) 62%)}
.ebc-t{position:absolute;z-index:1;left:9%;right:9%;bottom:8%;display:flex;flex-direction:column;gap:2.6cqw;line-height:1}
.ebc-t small{font-size:5.2cqw;font-weight:500;letter-spacing:.02em;color:rgba(255,255,255,.72)}
.ebc-t b{font-size:15cqw;font-weight:600;letter-spacing:-.04em;white-space:nowrap}
.ebc-t i{font-style:normal;font-size:5cqw;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.8)}
@container (max-width:64px){.ebc-t,.ebc::after{display:none}}
`

/** One stylesheet for every cover on the page (React keeps one copy per href). */
export function EbookCoverStyle() {
  return (
    <style href="w13-ebook-cover" precedence="default">
      {EBOOK_COVER_CSS}
    </style>
  )
}
