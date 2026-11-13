/**
 * The digital product the home page sells in its mockups (How it works and
 * the checkout scene): Maya Ellis's e-book, "Weeknight Pasta". Its cover is
 * drawn here the way a cookbook cover looks, a real photograph (Unsplash,
 * stored under public/home/commerce) over a paper band with the title set in
 * a serif, so it stays sharp at any size. Below 64px wide only the photograph
 * shows, the way a small thumbnail of a cover reads.
 */

export const EBOOK = {
  title: "Weeknight Pasta",
  author: "Maya Ellis",
  kind: "E-book",
  file: "Weeknight-Pasta.pdf",
  size: "18.4 MB",
  pages: 96,
  priceCents: 1900,
} as const

export function EbookCover({ className = "" }: { className?: string }) {
  return (
    <span className={`ebc ${className}`}>
      <img className="ebc-img" src="/home/commerce/ebook-pasta.webp" alt="" width={640} height={400} loading="lazy" decoding="async" />
      <span className="ebc-t">
        <b>{EBOOK.title}</b>
        <small>{EBOOK.author}</small>
      </span>
    </span>
  )
}

export const EBOOK_COVER_CSS = `
.ebc{position:relative;display:block;aspect-ratio:1;overflow:hidden;background:#f2ece2;color:#2b2219;container-type:inline-size;text-align:left}
.ebc-img{position:absolute;left:0;top:0;display:block;width:100%;height:62%;object-fit:cover}
.ebc-t{position:absolute;left:9%;right:9%;bottom:8%;display:flex;flex-direction:column;gap:2.4cqw;line-height:1}
.ebc-t b{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-size:12.5cqw;font-weight:400;letter-spacing:-.02em;white-space:nowrap}
.ebc-t small{font-size:5cqw;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#7d6c59}
@container (max-width:64px){.ebc-t{display:none}.ebc-img{height:100%}}
`

/** One stylesheet for every cover on the page (React keeps one copy per href). */
export function EbookCoverStyle() {
  return (
    <style href="w13-ebook-cover" precedence="default">
      {EBOOK_COVER_CSS}
    </style>
  )
}
