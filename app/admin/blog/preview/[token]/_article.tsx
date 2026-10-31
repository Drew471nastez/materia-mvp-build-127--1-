import type { Block } from "@/lib/blog/blocks"
import { headingAnchor } from "@/lib/blog/blocks"
import { embedFrameSrc, parseChapter } from "@/lib/blog/embed"
import { safeHref, sanitizeInlineHtml } from "@/lib/blog/sanitize"

/**
 * A post's blocks drawn for the preview, in the article's own light look
 * (app/(marketing)/blog/[slug]/page.tsx renderBlock). The public article is
 * being rebuilt in the same round; when it exports its block renderer this
 * file is replaced by an import of it, and the preview draws exactly what
 * the post will. Every line of HTML is sanitized again here, on read.
 */

const html = (s: string | undefined) => ({ __html: sanitizeInlineHtml(s ?? "") })

export function PreviewBlocks({ blocks }: { blocks: Block[] }) {
  return <>{blocks.map((b) => <PreviewBlock key={b.id} block={b} />)}</>
}

function PreviewBlock({ block: b }: { block: Block }) {
  switch (b.type) {
    case "p":
      return <p className="my-4 text-[17px] leading-relaxed text-neutral-700 [&_a]:underline [&_code]:rounded [&_code]:bg-neutral-100 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.9em]" dangerouslySetInnerHTML={html(b.html)} />
    case "h2":
      return <h2 id={headingAnchor(b)} className="mb-4 mt-10 text-2xl font-bold text-neutral-900" dangerouslySetInnerHTML={html(b.html)} />
    case "h3":
      return <h3 id={headingAnchor(b)} className="mb-3 mt-8 text-xl font-semibold text-neutral-900" dangerouslySetInnerHTML={html(b.html)} />
    case "quote":
      return <blockquote className="my-6 border-l-4 border-neutral-900 pl-5 text-lg italic text-neutral-700" dangerouslySetInnerHTML={html(b.html)} />
    case "callout": {
      const tone = b.tone === "warning" ? "border-amber-400 bg-amber-50" : b.tone === "tip" ? "border-emerald-500 bg-emerald-50" : "border-neutral-300 bg-neutral-50"
      return (
        <aside className={`my-6 rounded-lg border-l-4 px-5 py-4 ${tone}`}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{b.tone === "warning" ? "Warning" : b.tone === "tip" ? "Tip" : "Note"}</p>
          <p className="text-[16px] leading-relaxed text-neutral-800 [&_a]:underline" dangerouslySetInnerHTML={html(b.html)} />
        </aside>
      )
    }
    case "hr":
      return <hr className="my-10 border-neutral-200" />
    case "ul":
    case "ol": {
      const Tag = b.type
      return (
        <Tag className={`my-4 ml-5 space-y-1.5 text-[17px] text-neutral-700 ${b.type === "ol" ? "list-decimal" : "list-disc"}`}>
          {(b.items ?? []).map((it, i) => (
            <li key={i} className="pl-1 leading-relaxed [&_a]:underline" dangerouslySetInnerHTML={html(it)} />
          ))}
        </Tag>
      )
    }
    case "code":
      return (
        <div className="my-6 overflow-hidden rounded-xl">
          <div className="border-b border-neutral-800 bg-neutral-900 px-4 py-2 font-mono text-xs text-neutral-400">{b.lang || "code"}</div>
          <pre className="overflow-x-auto bg-neutral-950 p-4">
            <code className="font-mono text-sm leading-relaxed text-emerald-400">{b.text ?? ""}</code>
          </pre>
        </div>
      )
    case "table":
      return (
        <figure className="my-6 overflow-x-auto rounded-xl border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>{(b.headers ?? []).map((h, i) => <th key={i} className="border-b border-neutral-200 px-4 py-3 text-left font-semibold text-neutral-900">{h}</th>)}</tr>
            </thead>
            <tbody>
              {(b.rows ?? []).map((r, ri) => (
                <tr key={ri} className="border-b border-neutral-100 last:border-0">
                  {r.map((c, ci) => <td key={ci} className="px-4 py-3 text-neutral-700">{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {b.caption ? <figcaption className="px-4 py-2 text-sm text-neutral-500">{b.caption}</figcaption> : null}
        </figure>
      )
    case "img":
      return b.url ? (
        <figure className="my-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={b.url} alt={b.alt ?? ""} className="w-full rounded-xl" />
          {b.caption ? <figcaption className="mt-2 text-center text-sm text-neutral-500">{b.caption}</figcaption> : null}
          {!b.alt ? <p className="mt-1 text-center text-xs text-amber-700">Preview only: this picture has no alt text.</p> : null}
        </figure>
      ) : null
    case "video":
      return b.url ? (
        <figure className="my-8">
          <video src={b.url} controls preload="metadata" aria-label={b.alt || undefined} className="w-full rounded-xl bg-black" />
          {b.caption ? <figcaption className="mt-2 text-center text-sm text-neutral-500">{b.caption}</figcaption> : null}
        </figure>
      ) : null
    case "youtube":
      return b.videoId ? (
        <figure className="my-8">
          <div className="aspect-video overflow-hidden rounded-xl bg-black">
            <iframe src={`https://www.youtube-nocookie.com/embed/${b.videoId}`} title={b.caption || "YouTube video"} allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen className="h-full w-full" />
          </div>
          {b.chapters?.length ? (
            <ol className="mt-3 space-y-1 text-sm">
              {b.chapters.map((line, i) => {
                const c = parseChapter(line)
                return c ? (
                  <li key={i}>
                    <a href={`https://www.youtube.com/watch?v=${b.videoId}&t=${c.seconds}s`} className="text-neutral-700 underline-offset-2 hover:underline">
                      <span className="font-mono text-neutral-500">{line.trim().split(/\s/)[0]}</span> {c.title}
                    </a>
                  </li>
                ) : null
              })}
            </ol>
          ) : null}
          {b.transcript ? (
            <details className="mt-3 rounded-lg border border-neutral-200 px-4 py-2 text-sm text-neutral-700">
              <summary className="cursor-pointer font-medium">Transcript</summary>
              <p className="mt-2 whitespace-pre-wrap leading-relaxed">{b.transcript}</p>
            </details>
          ) : null}
        </figure>
      ) : null
    case "embed": {
      const src = embedFrameSrc(b)
      const href = safeHref(b.url)
      if (!src) return href ? <p className="my-4 text-[17px]"><a href={href} rel="noopener noreferrer" target="_blank" className="underline">{href}</a></p> : null
      return (
        <figure className="my-8">
          <iframe src={src} title={b.caption || `${b.provider} embed`} loading="lazy" className={`w-full rounded-xl border border-neutral-200 ${b.provider === "spotify" ? "h-[232px]" : b.provider === "x" ? "h-[560px]" : "aspect-video"}`} allowFullScreen />
          {b.caption ? <figcaption className="mt-2 text-center text-sm text-neutral-500">{b.caption}</figcaption> : null}
        </figure>
      )
    }
    case "cta": {
      const href = safeHref(b.url)
      return (
        <aside className="my-8 rounded-2xl bg-neutral-900 px-6 py-7 text-white">
          {b.title ? <p className="text-xl font-semibold">{b.title}</p> : null}
          {b.body ? <p className="mt-1 text-neutral-300">{b.body}</p> : null}
          {href && b.label ? <a href={href} className="mt-4 inline-block rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-900">{b.label}</a> : null}
        </aside>
      )
    }
    default:
      return null
  }
}
