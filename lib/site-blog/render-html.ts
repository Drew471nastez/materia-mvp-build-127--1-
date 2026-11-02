/**
 * ===========================================================================
 *  A CREATOR'S POST AS HTML
 * ===========================================================================
 * The one article markup every creator site draws: an imported theme's
 * `{{ article.content }}`, a native `main_article` section, and the plain
 * Storelib frame for a theme without an article template. Classes are
 * `sl-post__*`, styled by SITE_BLOG_ARTICLE_CSS under `.sl-post`, and a
 * theme may restyle them.
 *
 * The blocks go through sanitizeSiteBlocks again here, so what is drawn is
 * clean whatever the row holds. Every text is escaped, inline HTML is only
 * what sanitizeInlineHtml keeps, a frame only ever points at embedFrameSrc
 * (or YouTube's no-cookie player for a checked video id), and pictures load
 * lazily.
 */
import { headingAnchor } from "@/lib/blog/blocks"
import { embedFrameSrc, parseChapter } from "@/lib/blog/embed"
import { plainText, sanitizeInlineHtml } from "@/lib/blog/sanitize"
import type { SiteBlock } from "./blocks"
import { sanitizeSiteBlocks } from "./sanitize"

export function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

const attr = escapeHtml
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/

function caption(c: string | undefined): string {
  return c ? `<figcaption class="sl-post__caption">${escapeHtml(c)}</figcaption>` : ""
}

function img(url: string, alt: string, cls: string): string {
  return `<img class="${cls}" src="${attr(url)}" alt="${attr(alt)}" loading="lazy" decoding="async">`
}

function link(url: string, label: string, cls: string): string {
  const external = /^https?:\/\//i.test(url)
  return `<a class="${cls}" href="${attr(url)}"${external ? ' rel="noopener"' : ""}>${escapeHtml(label)}</a>`
}

function chapterSeconds(line: string): string {
  const c = parseChapter(line)
  return c ? `<li><span class="sl-post__chapter-time">${escapeHtml(line.trim().split(/\s+/)[0])}</span> ${escapeHtml(c.title)}</li>` : `<li>${escapeHtml(line)}</li>`
}

function block(b: SiteBlock): string {
  switch (b.type) {
    case "p": {
      const html = sanitizeInlineHtml(b.html ?? "")
      return html ? `<p class="sl-post__p">${html}</p>` : ""
    }
    case "h2":
    case "h3": {
      const html = sanitizeInlineHtml(b.html ?? "")
      return html ? `<${b.type} class="sl-post__${b.type}" id="${attr(headingAnchor(b))}">${html}</${b.type}>` : ""
    }
    case "quote": {
      const html = sanitizeInlineHtml(b.html ?? "")
      return html ? `<blockquote class="sl-post__quote"><p>${html}</p></blockquote>` : ""
    }
    case "callout": {
      const html = sanitizeInlineHtml(b.html ?? "")
      const tone = b.tone === "tip" || b.tone === "warning" ? b.tone : "note"
      return html ? `<aside class="sl-post__callout sl-post__callout--${tone}" role="note"><p>${html}</p></aside>` : ""
    }
    case "hr":
      return `<hr class="sl-post__hr">`
    case "ul":
    case "ol": {
      const items = (b.items ?? []).map((it) => sanitizeInlineHtml(it, 5000)).filter(Boolean)
      return items.length ? `<${b.type} class="sl-post__${b.type}">${items.map((it) => `<li>${it}</li>`).join("")}</${b.type}>` : ""
    }
    case "code": {
      const lang = (b.lang ?? "").replace(/[^a-z0-9+#.-]/gi, "")
      return `<pre class="sl-post__code"${lang ? ` data-lang="${attr(lang)}"` : ""}><code${lang ? ` class="language-${attr(lang)}"` : ""}>${escapeHtml(b.text ?? "")}</code></pre>`
    }
    case "table": {
      const headers = b.headers ?? []
      const head = headers.some(Boolean) ? `<thead><tr>${headers.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join("")}</tr></thead>` : ""
      const rows = (b.rows ?? []).map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("")
      if (!head && !rows) return ""
      return `<figure class="sl-post__table-wrap"><table class="sl-post__table">${head}<tbody>${rows}</tbody></table>${caption(b.caption)}</figure>`
    }
    case "img":
      return b.url ? `<figure class="sl-post__figure">${img(b.url, b.alt ?? "", "sl-post__img")}${caption(b.caption)}</figure>` : ""
    case "gallery": {
      const images = (b.images ?? []).filter((i) => i.url)
      if (!images.length) return ""
      const items = images.map((i) => `<figure class="sl-post__gallery-item">${img(i.url, i.alt ?? "", "sl-post__img")}${caption(i.caption)}</figure>`).join("")
      return `<div class="sl-post__gallery" data-count="${images.length}">${items}</div>${b.caption ? `<p class="sl-post__caption">${escapeHtml(b.caption)}</p>` : ""}`
    }
    case "video":
      return b.url
        ? `<figure class="sl-post__figure"><video class="sl-post__video" src="${attr(b.url)}" controls playsinline preload="metadata"${b.alt ? ` aria-label="${attr(b.alt)}"` : ""}></video>${caption(b.caption)}</figure>`
        : ""
    case "youtube": {
      if (!b.videoId || !YOUTUBE_ID.test(b.videoId)) return ""
      const title = b.title || b.caption || "YouTube video"
      const frame = `<div class="sl-post__frame sl-post__frame--video"><iframe src="https://www.youtube-nocookie.com/embed/${b.videoId}" title="${attr(title)}" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`
      const chapters = b.chapters?.length ? `<ol class="sl-post__chapters">${b.chapters.map(chapterSeconds).join("")}</ol>` : ""
      const transcript = b.transcript ? `<details class="sl-post__transcript"><summary>Transcript</summary><p>${escapeHtml(b.transcript)}</p></details>` : ""
      return `<figure class="sl-post__figure">${frame}${caption(b.caption)}</figure>${chapters}${transcript}`
    }
    case "embed": {
      if (!b.url) return ""
      const src = embedFrameSrc(b)
      if (!src) return `<p class="sl-post__p">${link(b.url, b.caption || b.url, "sl-post__link")}</p>`
      const tall = b.provider === "x" || b.provider === "spotify" || b.provider === "codepen"
      return `<figure class="sl-post__figure"><div class="sl-post__frame sl-post__frame--${attr(b.provider ?? "embed")}${tall ? " sl-post__frame--tall" : ""}"><iframe src="${attr(src)}" title="${attr(b.caption || "Embedded content")}" loading="lazy" allow="encrypted-media; fullscreen; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>${caption(b.caption)}</figure>`
    }
    case "cta": {
      if (!b.title && !b.body && !(b.label && b.url)) return ""
      return `<aside class="sl-post__cta">${b.title ? `<p class="sl-post__cta-title">${escapeHtml(b.title)}</p>` : ""}${b.body ? `<p class="sl-post__cta-body">${escapeHtml(b.body)}</p>` : ""}${b.label && b.url ? link(b.url, b.label, "sl-post__button sl-post__button--primary") : ""}</aside>`
    }
    case "button":
      return b.label && b.url ? `<p class="sl-post__button-row">${link(b.url, b.label, `sl-post__button sl-post__button--${b.style === "secondary" ? "secondary" : "primary"}`)}</p>` : ""
    default:
      return ""
  }
}

/** The post's article markup, cleaned again, every block in order. Wrap it in `<div class="sl-post">` to apply SITE_BLOG_ARTICLE_CSS. */
export function renderBlocksHtml(blocks: SiteBlock[]): string {
  return sanitizeSiteBlocks(blocks).map(block).filter(Boolean).join("\n")
}

/** What a reader reads, as plain text: headings, paragraphs, items, cells, code, captions. */
export function blocksPlainText(blocks: SiteBlock[]): string {
  const parts: string[] = []
  const add = (s?: string) => {
    if (s) {
      const t = plainText(s.replace(/<br\s*\/?>/gi, " "), 1_000_000).replace(/\s+/g, " ").trim()
      if (t) parts.push(t)
    }
  }
  for (const b of Array.isArray(blocks) ? blocks : []) {
    if (!b || typeof b !== "object") continue
    if (b.type === "code") continue
    add(b.html)
    b.items?.forEach(add)
    b.headers?.forEach(add)
    b.rows?.forEach((r) => r.forEach(add))
    add(b.title)
    add(b.body)
    if (b.type === "button") add(b.label)
  }
  return parts.join(" ")
}

/** The first `maxWords` words of a text, with an ellipsis when cut. */
export function truncateWords(text: string, maxWords: number): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean)
  if (words.length <= maxWords) return words.join(" ")
  return `${words.slice(0, maxWords).join(" ").replace(/[,;:.!?-]+$/, "")}…`
}

/** A card's summary as safe HTML: the opening words of the post in one paragraph. */
export function summaryHtml(blocks: SiteBlock[], maxWords = 60): string {
  const t = truncateWords(blocksPlainText(blocks), maxWords)
  return t ? `<p>${escapeHtml(t)}</p>` : ""
}

/**
 * The article's own look: readable defaults that take the theme's fonts and
 * colours (inherit, currentColor), scoped under `.sl-post` so nothing else on
 * the page changes. A theme's article template may restyle any of it.
 */
export const SITE_BLOG_ARTICLE_CSS = `.sl-post{line-height:1.7;font-size:1.0625rem;overflow-wrap:break-word}
.sl-post>*+*{margin-top:1.15em}
.sl-post__h2{font-size:1.6em;line-height:1.25;margin-top:1.8em;scroll-margin-top:5rem}
.sl-post__h3{font-size:1.3em;line-height:1.3;margin-top:1.5em;scroll-margin-top:5rem}
.sl-post a{color:inherit;text-decoration:underline;text-underline-offset:.18em}
.sl-post code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em}
.sl-post__ul,.sl-post__ol{padding-left:1.4em}
.sl-post__ul{list-style:disc}.sl-post__ol{list-style:decimal}
.sl-post__ul li+li,.sl-post__ol li+li{margin-top:.35em}
.sl-post__quote{border-left:3px solid currentColor;padding:.2em 0 .2em 1.1em;font-style:italic;opacity:.9}
.sl-post__callout{border-radius:12px;padding:1em 1.2em;background:color-mix(in srgb,currentColor 7%,transparent)}
.sl-post__callout--warning{background:color-mix(in srgb,#d97706 16%,transparent)}
.sl-post__callout--tip{background:color-mix(in srgb,#059669 14%,transparent)}
.sl-post__hr{border:0;border-top:1px solid color-mix(in srgb,currentColor 20%,transparent);margin:2em 0}
.sl-post__figure{margin-left:0;margin-right:0}
.sl-post__img,.sl-post__video{display:block;width:100%;height:auto;border-radius:10px}
.sl-post__caption{font-size:.875em;opacity:.7;margin-top:.5em;text-align:center}
.sl-post__gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}
.sl-post__gallery[data-count="1"]{grid-template-columns:1fr}
@media (min-width:768px){.sl-post__gallery[data-count="3"],.sl-post__gallery[data-count="6"],.sl-post__gallery[data-count="9"]{grid-template-columns:repeat(3,minmax(0,1fr))}}
.sl-post__gallery-item{margin:0}.sl-post__gallery-item .sl-post__img{aspect-ratio:1/1;object-fit:cover}
.sl-post__frame{position:relative;width:100%;aspect-ratio:16/9;border-radius:10px;overflow:hidden}
.sl-post__frame--tall{aspect-ratio:auto;height:420px}
.sl-post__frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.sl-post__chapters{list-style:none;padding:0;font-size:.9em}.sl-post__chapter-time{font-variant-numeric:tabular-nums;opacity:.7}
.sl-post__transcript summary{cursor:pointer;font-weight:600}
.sl-post__code{overflow-x:auto;padding:1em 1.2em;border-radius:10px;background:color-mix(in srgb,currentColor 8%,transparent);font-size:.9em;line-height:1.55}
.sl-post__table-wrap{overflow-x:auto;margin-left:0;margin-right:0}
.sl-post__table{width:100%;border-collapse:collapse;font-size:.95em}
.sl-post__table th,.sl-post__table td{border:1px solid color-mix(in srgb,currentColor 18%,transparent);padding:.5em .75em;text-align:left;vertical-align:top}
.sl-post__cta{border-radius:14px;padding:1.4em;background:color-mix(in srgb,currentColor 6%,transparent);text-align:center}
.sl-post__cta-title{font-weight:700;font-size:1.15em}
.sl-post__button-row{text-align:center}
.sl-post a.sl-post__button{display:inline-block;padding:.75em 1.4em;border-radius:999px;font-weight:600;text-decoration:none;line-height:1.2}
.sl-post a.sl-post__button--primary{background:var(--color-button,#111);color:var(--color-button-text,#fff)}
.sl-post a.sl-post__button--secondary{border:1.5px solid currentColor;color:inherit}`
