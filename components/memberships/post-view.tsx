"use client"

/**
 * ===========================================================================
 *  ONE UPDATE, AS A MEMBER READS IT
 * ===========================================================================
 * The creator's update in the member's feed (/library/memberships/<id>), and
 * the same drawing in the creator's own list of what they posted
 * (/app/memberships/<id>), so what the creator sees after posting is what
 * members see.
 *
 * The text is shown as it was typed: paragraphs at blank lines, line breaks
 * kept, and web addresses turned into links (https and http only, opened in
 * a new tab, never with the page's authority). Pictures sit under the text
 * in a grid that suits how many there are and open full size on a press.
 * Files are rows with their size and a Download that goes through
 * /api/memberships/files, which checks the member again.
 *
 * A post the member has not opened carries a small violet dot beside its
 * date. The feed decides when it counts as read; this only draws it, and
 * fades it out when it goes.
 */
import * as React from "react"
import Link from "next/link"
import { Download, FileText, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FeedPost } from "@/lib/memberships/view-types"

const URL_RE = /(https?:\/\/[^\s<>"')]+[^\s<>"').,;:!?])/g

/** One paragraph's text with its line breaks and links. */
function Inline({ text }: { text: string }) {
  const lines = text.split("\n")
  return (
    <>
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <br /> : null}
          {line.split(URL_RE).map((part, j) =>
            j % 2 === 1 ? (
              <a key={j} href={part} target="_blank" rel="noopener noreferrer nofollow ugc" className="break-words font-medium text-[#6d28d9] underline decoration-[#c4b5fd] underline-offset-2 hover:decoration-[#6d28d9]">
                {part.replace(/^https?:\/\//, "")}
              </a>
            ) : (
              <React.Fragment key={j}>{part}</React.Fragment>
            ),
          )}
        </React.Fragment>
      ))}
    </>
  )
}

export function PostText({ body, className }: { body: string; className?: string }) {
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  if (paragraphs.length === 0) return null
  return (
    <div className={cn("space-y-3 text-[15px] leading-[1.65] text-[#374151] [overflow-wrap:anywhere]", className)}>
      {paragraphs.map((p, i) => (
        <p key={i}>
          <Inline text={p} />
        </p>
      ))}
    </div>
  )
}

export function fileSize(bytes: number): string {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

export function postDate(iso: string, now = Date.now()): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ""
  const minutes = Math.round((now - t) / 60_000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const d = new Date(t)
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })
}

function Pictures({ images, title }: { images: FeedPost["images"]; title: string }) {
  const [open, setOpen] = React.useState<number | null>(null)
  React.useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null)
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : Math.min(images.length - 1, i + 1)))
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : Math.max(0, i - 1)))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, images.length])
  if (images.length === 0) return null
  const shown = images.slice(0, 4)
  const more = images.length - shown.length
  return (
    <>
      <div className={cn("grid gap-1.5 overflow-hidden rounded-xl", shown.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
        {shown.map((img, i) => (
          <button
            key={img.url}
            type="button"
            onClick={() => setOpen(i)}
            className={cn(
              "group/pic relative block overflow-hidden bg-[#f1f2f4] outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]",
              shown.length === 1 ? "max-h-[520px]" : "aspect-square",
              shown.length === 3 && i === 0 && "row-span-2 aspect-auto",
            )}
            aria-label={`Open picture ${i + 1} of ${images.length}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={title ? `${title}, picture ${i + 1}` : `Picture ${i + 1}`} loading="lazy" decoding="async" className={cn("h-full w-full object-cover transition-[scale] duration-300 ease-out group-hover/pic:scale-[1.015] motion-reduce:transition-none", shown.length === 1 && "max-h-[520px] object-contain")} />
            {more > 0 && i === shown.length - 1 ? <span className="absolute inset-0 grid place-items-center bg-black/45 text-[17px] font-semibold text-white">+{more}</span> : null}
          </button>
        ))}
      </div>
      {open !== null ? (
        <div role="dialog" aria-modal="true" aria-label="Picture" className="fixed inset-0 z-[2147483000] grid place-items-center bg-black/90 p-4 pt-[max(1rem,env(safe-area-inset-top))]" onClick={() => setOpen(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[open].url} alt="" className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          <button type="button" onClick={() => setOpen(null)} className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
          {images.length > 1 ? <p className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-0 right-0 text-center text-[13px] text-white/70">{open + 1} of {images.length}</p> : null}
        </div>
      ) : null}
    </>
  )
}

export function PostView({
  post,
  fileHref,
  aside,
  now,
  locked = false,
}: {
  post: FeedPost
  /** Where a file downloads from; null when files are not offered (the creator's preview offers its own). */
  fileHref: ((assetId: string) => string) | null
  /** The creator's menu, or nothing. */
  aside?: React.ReactNode
  now?: number
  locked?: boolean
}) {
  return (
    <article id={`post-${post.id}`} data-post={post.id} data-unread={post.unread ? "" : undefined} className="scroll-mt-24 rounded-2xl border border-[#e5e7eb]/70 bg-white px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:px-6 sm:py-5">
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[12.5px] font-medium text-[#6b7280]">
            <span
              aria-hidden
              className={cn("inline-block h-2 w-2 rounded-full bg-[#8b5cf6] transition-[opacity,scale] duration-500 ease-out motion-reduce:transition-none", post.unread ? "opacity-100" : "-mr-2 w-0 scale-0 opacity-0")}
            />
            {post.unread ? <span className="sr-only">New. </span> : null}
            <time dateTime={post.publishedAt}>{postDate(post.publishedAt, now)}</time>
          </p>
          {post.title ? <h2 className="mt-1 text-[17px] font-semibold leading-snug text-[#1a1a2e] sm:text-[18px]">{post.title}</h2> : null}
        </div>
        {aside}
      </header>

      {locked ? (
        <p className="mt-3 text-[14px] text-[#9ca3af]">For members.</p>
      ) : (
        <div className="mt-3 space-y-4">
          {post.body ? <PostText body={post.body} /> : null}
          <Pictures images={post.images} title={post.title} />
          {post.attachments.length > 0 ? (
            <ul className="divide-y divide-[#eef0f3] overflow-hidden rounded-xl border border-[#e8eaee]">
              {post.attachments.map((a) => (
                <li key={a.assetId} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f4f4f6] text-[#6b7280]">
                    <FileText aria-hidden className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{a.name}</p>
                    {a.size ? <p className="text-[12.5px] text-[#6b7280]">{fileSize(a.size)}</p> : null}
                  </div>
                  {fileHref ? (
                    <a href={fileHref(a.assetId)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[#e1e3e7] bg-white px-3 text-[13px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f7f7f8] active:bg-[#f1f2f4]">
                      <Download aria-hidden className="h-3.5 w-3.5" />
                      Download
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {post.links.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {post.links.map((l) => (
                <Link key={l.id} href={l.href} className="group/link flex max-w-full items-center gap-2.5 rounded-xl border border-[#e8eaee] bg-[#fafafb] py-2 pl-2 pr-3.5 transition-colors hover:border-[#d9dce1] hover:bg-white">
                  {l.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.cover} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" loading="lazy" />
                  ) : (
                    <span className="h-9 w-9 shrink-0 rounded-lg bg-[#eceef2]" />
                  )}
                  <span className="truncate text-[13.5px] font-medium text-[#1a1a2e]">{l.title}</span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </article>
  )
}
