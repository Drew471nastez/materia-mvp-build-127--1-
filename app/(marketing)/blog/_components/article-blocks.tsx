/**
 * ===========================================================================
 *  THE ARTICLE'S BODY: EVERY BLOCK TYPE IN lib/blog/blocks.ts
 * ===========================================================================
 * A server component. The only parts that run in the browser are the
 * YouTube player (./youtube-facade, nothing loads until a press) and
 * nothing else: a video is the browser's own player, a transcript is a
 * <details> rendered here so a crawler reads it, an embed is a lazy frame.
 *
 * INLINE HTML. p, h2, h3, quote, callout and list items carry limited
 * inline html written in /admin. It goes through sanitizeInline before it
 * is drawn: b, strong, i, em, u, s, a (href only), code and br, every
 * other tag dropped with its text kept (script, style and the like with
 * their text too), every attribute but an a's href dropped, so no on*
 * handler survives, and an href only when it is http(s), mailto, tel, a
 * path on this site or an anchor (never javascript: or data:).
 * The work is lib/blog/sanitize.ts sanitizeInlineHtml (the editor's own,
 * run again here on read); this file reaches it through one name.
 *
 * Tested in tests/blog-public-r45.test.ts: every block type renders, the
 * sanitiser's cases, the anchors the contents list links to.
 */
import type { ReactNode } from "react"
import type { Block } from "@/lib/blog/blocks"
import { articleOutline, escapeHtml, parseChapters, safeImageUrl, youtubeWatchUrl, YOUTUBE_ID } from "@/lib/blog/article"
import { blogEmbed, embedProviderName } from "@/lib/blog/embed"
import { sanitizeInlineHtml } from "@/lib/blog/sanitize"
import { BlogImage } from "./blog-image"
import { YouTubeFacade } from "./youtube-facade"

/* ─── The sanitiser ──────────────────────────────────────────────────── */

/**
 * Inline html as the article may draw it: lib/blog/sanitize.ts
 * sanitizeInlineHtml, the same function the editor saves through, run again
 * on read. Behind this one name so every drawn line goes through one place.
 */
export function sanitizeInline(html: string | null | undefined): string {
  return sanitizeInlineHtml(html ?? "")
}

/* ─── Styles ─────────────────────────────────────────────────────────── */

/** Inline links near black and underlined; bold in ink; inline code on a quiet tint. */
export const INLINE =
  "[&_a]:font-medium [&_a]:text-[#1a1a2e] [&_a]:underline [&_a]:decoration-[#1a1a2e]/40 [&_a]:decoration-1 [&_a]:underline-offset-[3px] [&_a:hover]:decoration-[#1a1a2e] [&_strong]:font-semibold [&_strong]:text-[#1a1a2e] [&_b]:font-semibold [&_b]:text-[#1a1a2e] [&_code]:rounded-[5px] [&_code]:bg-[#f1f2f4] [&_code]:px-[5px] [&_code]:py-[1px] [&_code]:font-mono [&_code]:text-[0.88em] [&_code]:text-[#1a1a2e]"

/* Round 47 ("the text is too small and cramped"): 17px on a phone, 18px from 640px, 1.7 line height, a darker grey than before. */
const BODY = `text-[17px] leading-[1.7] text-[#374151] sm:text-[18px] ${INLINE}`

const Html = ({ as: Tag, html, className, id }: { as: "p" | "h2" | "h3" | "li" | "div"; html: string | undefined; className?: string; id?: string }) => (
  <Tag id={id} className={className} dangerouslySetInnerHTML={{ __html: sanitizeInline(html) }} />
)

const TONES: Record<NonNullable<Block["tone"]>, { label: string; box: string }> = {
  note: { label: "Note", box: "border-[#d4d7dc] bg-[#f6f7f9]" },
  tip: { label: "Tip", box: "border-[#b5cc2e] bg-[#f7fbe4]" },
  warning: { label: "Warning", box: "border-[#e0a43a] bg-[#fdf6e7]" },
}

function Caption({ children }: { children: ReactNode }) {
  return <figcaption className="mt-3 text-[15px] leading-[1.5] text-[#6b7280]">{children}</figcaption>
}

function safeLink(url: string | undefined): string | null {
  const u = (url ?? "").trim()
  return /^https?:\/\//i.test(u) || (u.startsWith("/") && !u.startsWith("//")) ? u : null
}

/* ─── Blocks ─────────────────────────────────────────────────────────── */

export interface ArticleBlocksProps {
  blocks: Block[]
  /** The post's title: a video's name when its block has none. */
  postTitle: string
  /** Reusable blocks already read, by snippet id. An unresolved snippet draws nothing. */
  snippets?: Record<string, Block[]>
  /** Drawn after this block index: the inline sign up box, placed by the page. */
  insertAfter?: { index: number; node: ReactNode }
}

export function ArticleBlocks({ blocks, postTitle, snippets, insertAfter }: ArticleBlocksProps) {
  const { anchors } = articleOutline(blocks)
  return (
    <div className="blog-article" data-blog-body="">
      {blocks.map((b, i) => (
        <BlockAt key={b.id || i} block={b} anchor={anchors[i]} postTitle={postTitle} snippets={snippets} after={insertAfter?.index === i ? insertAfter.node : null} />
      ))}
    </div>
  )
}

function BlockAt({ block, anchor, postTitle, snippets, after }: { block: Block; anchor?: string; postTitle: string; snippets?: Record<string, Block[]>; after: ReactNode }) {
  const drawn = renderBlock(block, anchor, postTitle, snippets)
  if (!after) return <>{drawn}</>
  return (
    <>
      {drawn}
      {after}
    </>
  )
}

function renderBlock(b: Block, anchor: string | undefined, postTitle: string, snippets?: Record<string, Block[]>): ReactNode {
  switch (b.type) {
    case "p":
      return <Html as="p" html={b.html ?? (b.text ? escapeHtml(b.text) : "")} className={`mt-[1.25em] first:mt-0 ${BODY}`} />
    case "h2":
      return <Html as="h2" id={anchor} html={b.html ?? escapeHtml(b.text ?? "")} className="mt-14 scroll-mt-28 text-[27px] font-semibold leading-[1.2] tracking-[-0.022em] text-[#1a1a2e] first:mt-0 sm:mt-16 sm:text-[32px]" />
    case "h3":
      return <Html as="h3" id={anchor} html={b.html ?? escapeHtml(b.text ?? "")} className="mt-10 scroll-mt-28 text-[21px] font-semibold leading-[1.3] tracking-[-0.012em] text-[#1a1a2e] sm:text-[23px]" />
    case "hr":
      return <hr className="mx-auto my-12 w-24 border-0 border-t border-[#d4d7dc]" />
    case "quote":
      return (
        <blockquote className="my-10 border-l-2 border-[#1a1a2e] pl-5 sm:pl-6">
          <Html as="p" html={b.html ?? escapeHtml(b.text ?? "")} className={`text-[20px] leading-[1.55] tracking-[-0.01em] text-[#1a1a2e] sm:text-[22px] ${INLINE}`} />
        </blockquote>
      )
    case "ul":
    case "ol": {
      const List = b.type === "ul" ? "ul" : "ol"
      return (
        <List className={`mt-[1.25em] space-y-3 pl-6 ${b.type === "ul" ? "list-disc" : "list-decimal"} marker:text-[#9ca3af] ${BODY}`}>
          {(b.items ?? []).map((item, j) => (
            <Html key={j} as="li" html={item} className="pl-1.5" />
          ))}
        </List>
      )
    }
    case "img": {
      const src = safeImageUrl(b.url)
      if (!src) return null
      return (
        <figure className="my-10">
          <BlogImage src={src} alt={b.alt ?? ""} sizes="(min-width: 768px) 720px, calc(100vw - 32px)" className="h-auto w-full rounded-2xl bg-[#f1f2f4]" />
          {b.caption ? <Caption>{b.caption}</Caption> : null}
        </figure>
      )
    }
    case "youtube": {
      if (!b.videoId || !YOUTUBE_ID.test(b.videoId)) return null
      const chapters = parseChapters(b.chapters)
      const title = b.title || b.caption || postTitle
      return (
        <figure className="my-10" data-blog-video={b.videoId}>
          <YouTubeFacade videoId={b.videoId} title={title} chapters={chapters} chapterHrefs={chapters.map((c) => youtubeWatchUrl(b.videoId!, c.seconds))} />
          {b.caption ? <Caption>{b.caption}</Caption> : null}
          {b.transcript ? (
            <details className="group mt-4 border-y border-[#eef0f2]" data-blog-transcript="">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between text-[15px] font-medium text-[#1a1a2e] [&::-webkit-details-marker]:hidden">
                Transcript
                <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 text-[#6b7280] transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 8l5 5 5-5" />
                </svg>
              </summary>
              <div className="max-h-[420px] overflow-y-auto pb-4 text-[15px] leading-[1.7] text-[#4b5563]">
                {b.transcript.split(/\n{2,}|\r\n\r\n/).map((para, j) => (
                  <p key={j} className="mt-3 first:mt-0 whitespace-pre-line">
                    {para}
                  </p>
                ))}
              </div>
            </details>
          ) : null}
        </figure>
      )
    }
    case "video": {
      const src = safeLink(b.url)
      const type = src?.match(/\.(mp4|webm)(?:[?#]|$)/i)?.[1]?.toLowerCase()
      if (!src || !type) return null
      return (
        <figure className="my-10">
          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[#0e0e10]">
            <video controls preload="none" playsInline className="absolute inset-0 h-full w-full object-contain" aria-label={b.alt || b.caption || undefined}>
              <source src={src} type={`video/${type}`} />
            </video>
          </div>
          {b.caption ? <Caption>{b.caption}</Caption> : null}
        </figure>
      )
    }
    case "embed": {
      const embed = blogEmbed(b)
      const link = safeLink(b.url)
      if (!embed) {
        return link ? (
          <p className={`mt-6 ${BODY}`}>
            <a href={link} rel="noopener">
              {b.caption || link}
            </a>
          </p>
        ) : null
      }
      if (embed.kind === "youtube") {
        return (
          <figure className="my-10" data-blog-video={embed.videoId}>
            <YouTubeFacade videoId={embed.videoId} title={b.caption || postTitle} chapters={[]} chapterHrefs={[]} />
            {b.caption ? <Caption>{b.caption}</Caption> : null}
          </figure>
        )
      }
      return (
        <figure className="my-10" data-blog-embed={embed.provider}>
          <div className="relative w-full overflow-hidden rounded-xl border border-[#e5e7eb] bg-[#f6f7f9]" style={embed.ratio ? { aspectRatio: String(embed.ratio) } : { height: embed.height }}>
            <iframe src={embed.src} title={b.caption || embed.title} loading="lazy" allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write" allowFullScreen className="absolute inset-0 h-full w-full border-0" />
          </div>
          <Caption>
            {b.caption ? `${b.caption} ` : null}
            {link ? (
              <a href={link} rel="noopener" className="text-[#1a1a2e] underline decoration-[#1a1a2e]/40 underline-offset-[3px]">
                Open on {embedProviderName(embed.provider)}
              </a>
            ) : null}
          </Caption>
        </figure>
      )
    }
    case "table":
      return (
        <figure className="my-10">
          <div className="overflow-x-auto rounded-xl border border-[#e5e7eb]">
            <table className="w-full min-w-[480px] border-collapse text-left text-[15px] leading-snug">
              {b.headers?.length ? (
                <thead>
                  <tr>
                    {b.headers.map((h, j) => (
                      <th key={j} scope="col" className="border-b border-[#e5e7eb] bg-[#f8f9fa] px-4 py-3 font-semibold text-[#1a1a2e]">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
              ) : null}
              <tbody>
                {(b.rows ?? []).map((row, j) => (
                  <tr key={j} className="border-b border-[#f0f0f2] last:border-0">
                    {row.map((cell, k) => (
                      <td key={k} className={`px-4 py-3 align-top ${k === 0 ? "font-medium text-[#1a1a2e]" : "text-[#4b5563]"}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {b.caption ? <Caption>{b.caption}</Caption> : null}
        </figure>
      )
    case "code":
      return (
        <figure className="my-8">
          <div className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-[#f8f9fa]">
            {b.lang ? <div className="border-b border-[#e5e7eb] px-4 py-2 font-mono text-[14px] text-[#4b5563]">{b.lang}</div> : null}
            <pre className="overflow-x-auto p-4 text-[14px] leading-[1.65]">
              <code className="font-mono text-[#1a1a2e]">{b.text ?? ""}</code>
            </pre>
          </div>
        </figure>
      )
    case "callout": {
      const tone = TONES[b.tone ?? "note"] ?? TONES.note
      return (
        <aside className={`my-8 rounded-xl border-l-[3px] px-5 py-4 ${tone.box}`} data-blog-callout={b.tone ?? "note"}>
          <p className="text-[15px] font-semibold text-[#1a1a2e]">{b.title || tone.label}</p>
          <Html as="div" html={b.html ?? escapeHtml(b.text ?? "")} className={`mt-1.5 text-[17px] leading-[1.65] text-[#374151] ${INLINE}`} />
        </aside>
      )
    }
    case "cta": {
      const href = safeLink(b.url)
      if (!b.title && !b.body) return null
      return (
        <aside className="my-10 rounded-2xl bg-[#1a1a2e] px-6 py-7 text-white sm:px-8" data-blog-cta-block="">
          {b.title ? <p className="text-[22px] font-semibold leading-tight tracking-[-0.015em]">{b.title}</p> : null}
          {b.body ? <p className="mt-2 text-[16px] leading-relaxed text-white/70">{b.body}</p> : null}
          {href && b.label ? (
            <a href={href} className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white px-5 text-[15px] font-semibold text-[#1a1a2e] transition-colors hover:bg-[#ede9fe]">
              {b.label}
              <span aria-hidden>&rarr;</span>
            </a>
          ) : null}
        </aside>
      )
    }
    case "snippet": {
      const inner = b.snippetId ? snippets?.[b.snippetId] : undefined
      if (!inner?.length) return null
      return (
        <>
          {inner
            .filter((s) => s.type !== "snippet")
            .map((s, j) => (
              <BlockAt key={s.id || j} block={s} postTitle={postTitle} after={null} />
            ))}
        </>
      )
    }
    default:
      return null
  }
}
