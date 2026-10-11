/**
 * The parts every Help Center page is drawn with: the container, the
 * breadcrumbs, an article's body and the way to reach a person.
 *
 * Server components. Nothing here needs the browser except the search box,
 * which lives in ./help-search.
 */
import Link from "next/link"
import type { ReactNode } from "react"
import { SUPPORT_EMAIL, headingId, plainText, type HelpBlock } from "@/lib/help/articles"
import { HelpFigure } from "./help-figures"

/** The page container every /app page uses, so help sits in the same frame. */
export const HELP_CONTAINER = "mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8"

/**
 * The frame for a topic, an article and the results: narrower, so a reading
 * column of about seventy characters and the list beside it make one block
 * instead of a column of text with a wide gap and a list at the far edge.
 */
export const HELP_READING = "mx-auto w-full max-w-[960px] px-4 sm:px-6 lg:px-8"

/** [label](/path) inside a sentence, as a link. Everything else is text. */
export function RichText({ text }: { text: string }) {
  const parts: ReactNode[] = []
  const re = /\[([^\]]+)\]\(([^)\s]+)\)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const [, label, href] = m
    const cls = "font-medium text-[#6d28d9] underline decoration-[#6d28d9]/30 underline-offset-2 hover:decoration-[#6d28d9]"
    parts.push(
      href.startsWith("/") ? (
        <Link key={m.index} href={href} className={cls}>
          {label}
        </Link>
      ) : (
        <a key={m.index} href={href} className={cls}>
          {label}
        </a>
      ),
    )
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-[13px] text-[#6b7280]">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, i) => (
          <li key={item.label} className="flex items-center gap-x-2">
            {i > 0 && (
              <span aria-hidden className="text-[#d1d5db]">
                /
              </span>
            )}
            {item.href ? (
              <Link href={item.href} className="hover:text-[#1a1a2e] hover:underline hover:underline-offset-2">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-[#1a1a2e]">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

/**
 * AN ARTICLE, SET FOR READING. One column no wider than about seventy
 * characters, sixteen pixel type at a generous line height, headings with
 * room above them and little below, so each belongs to what follows it.
 */
export function ArticleBody({ blocks }: { blocks: HelpBlock[] }) {
  /* Each heading gets the id the contents list links to (lib/help/articles helpToc): the same words, the same id. */
  const seen = new Map<string, number>()
  const idOf = (text: string) => {
    const base = headingId(text)
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base}-${n}`
  }
  return (
    <div className="text-[16px] leading-[1.7] text-[#374151] sm:text-[16.5px]" data-help-body="">
      {blocks.map((b, i) => {
        const gap = i === 0 ? "" : "mt-5"
        switch (b.type) {
          case "p":
            return (
              <p key={i} className={gap}>
                <RichText text={b.text} />
              </p>
            )
          case "h":
            return (
              <h2 key={i} id={idOf(b.text)} className="mt-12 scroll-mt-24 text-[21px] font-semibold leading-snug tracking-[-0.01em] text-[#1a1a2e] first:mt-0 sm:text-[22px]">
                {b.text}
              </h2>
            )
          case "steps":
            return (
              <ol key={i} className={`${gap} help-steps space-y-3`}>
                {b.items.map((item, j) => (
                  <li key={j} className="relative pl-10">
                    <span aria-hidden className="absolute left-0 top-[3px] flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#f1f2f4] text-[13px] font-semibold tabular-nums text-[#1a1a2e]">
                      {j + 1}
                    </span>
                    <RichText text={item} />
                  </li>
                ))}
              </ol>
            )
          case "list":
            return (
              <ul key={i} className={`${gap} list-disc space-y-2 pl-6 marker:text-[#9ca3af]`}>
                {b.items.map((item, j) => (
                  <li key={j} className="pl-1">
                    <RichText text={item} />
                  </li>
                ))}
              </ul>
            )
          case "figure":
            return (
              <div key={i} className={`${gap} -mx-1 sm:mx-0`}>
                <HelpFigure figure={b.figure} caption={b.caption} />
              </div>
            )
          case "image":
            return (
              <figure key={i} className={`${gap} my-8`} data-help-image="">
                {/* A screenshot of the real screen (public/help/), at its own size, never wider than the column. On a phone the
                    phone sized picture of the same screen, when there is one. Pressed, it opens full size. */}
                <a href={b.src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-[#e5e7eb] bg-[#f8f9fa] shadow-[0_1px_3px_rgba(0,0,0,0.04)]" style={{ maxWidth: b.width }} aria-label={`${b.alt} Opens the full size picture.`}>
                  <picture>
                    {b.phone ? <source media="(max-width: 639px)" srcSet={b.phone.src} width={b.phone.width} height={b.phone.height} /> : null}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={b.src} alt={b.alt} width={b.width} height={b.height} loading="lazy" decoding="async" className="block h-auto w-full" />
                  </picture>
                </a>
                {b.caption ? <figcaption className="mt-2.5 text-[14px] leading-snug text-[#6b7280]">{b.caption}</figcaption> : null}
              </figure>
            )
          case "note":
            return (
              <p key={i} className={`${gap} border-l-[3px] border-[#d1d5db] py-0.5 pl-4 text-[15.5px] leading-relaxed text-[#4b5563]`} data-help-note="">
                <RichText text={b.text} />
              </p>
            )
          case "table":
            return <HelpTable key={i} head={b.head} rows={b.rows} className={gap} />
        }
      })}
    </div>
  )
}

/**
 * A TABLE THAT READS ON A PHONE. Wide, it is a table. Narrow, each row
 * becomes a little block: its first cell as the heading and every other cell
 * under the column's name, so nothing scrolls sideways or squeezes into one
 * word per line. One markup for both, so a search engine reads one table.
 */
function HelpTable({ head, rows, className }: { head: string[]; rows: string[][]; className?: string }) {
  return (
    <div className={`${className ?? ""} overflow-hidden rounded-xl border border-[#e5e7eb]`} data-help-table="">
      <table className="w-full border-separate border-spacing-0 text-left text-[14px] leading-normal max-sm:block">
        <thead className="max-sm:hidden">
          <tr>
            {head.map((h, j) => (
              <th key={j} scope="col" className="border-b border-[#e5e7eb] bg-[#f8f9fa] px-4 py-2.5 font-semibold text-[#1a1a2e]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="max-sm:block">
          {rows.map((row, j) => (
            <tr key={j} className={`max-sm:block max-sm:px-4 max-sm:py-3 ${j < rows.length - 1 ? "max-sm:border-b max-sm:border-[#f0f0f2]" : ""}`}>
              {row.map((cell, k) => (
                <td
                  key={k}
                  data-label={head[k] ? plainText(head[k]) : undefined}
                  className={[
                    "px-4 py-2.5 align-top max-sm:block max-sm:p-0",
                    j < rows.length - 1 ? "sm:border-b sm:border-[#f0f0f2]" : "",
                    k === 0 ? "font-medium text-[#1a1a2e] max-sm:text-[15px]" : "max-sm:mt-1 max-sm:text-[14px] max-sm:text-[#4b5563]",
                    k > 0 && head[k] ? "max-sm:before:mr-1.5 max-sm:before:font-medium max-sm:before:text-[#6b7280] max-sm:before:content-[attr(data-label)':']" : "",
                    !cell ? "max-sm:hidden" : "",
                  ].join(" ")}
                >
                  <RichText text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * ON THIS PAGE. The article's headings as links. Beside the article on a
 * wide screen, it stays in view while the article scrolls; on a phone it is
 * a closed list under the title, opened with one tap.
 */
export function OnThisPage({ items, variant }: { items: { id: string; text: string }[]; variant: "side" | "inline" }) {
  if (items.length < 2) return null
  const list = (
    <ol className="space-y-0.5 border-l border-[#e5e7eb]" data-help-toc="">
      {items.map((t) => (
        <li key={t.id}>
          <a href={`#${t.id}`} className="-ml-px block border-l border-transparent py-1.5 pl-4 text-[14px] leading-snug text-[#6b7280] transition-colors hover:border-[#9ca3af] hover:text-[#1a1a2e] aria-[current=true]:border-[#1a1a2e] aria-[current=true]:font-medium aria-[current=true]:text-[#1a1a2e]">
            {t.text}
          </a>
        </li>
      ))}
    </ol>
  )
  if (variant === "side") {
    return (
      <nav aria-label="On this page">
        <h2 className="mb-3 text-[13px] font-semibold text-[#1a1a2e]">On this page</h2>
        {list}
      </nav>
    )
  }
  return (
    <details className="group rounded-xl border border-[#e5e7eb] bg-[#f8f9fa] lg:hidden" data-help-toc-inline="">
      <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 px-4 text-[14px] font-medium text-[#1a1a2e] [&::-webkit-details-marker]:hidden">
        On this page
        <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 text-[#6b7280] transition-[rotate] group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 8l5 5 5-5" />
        </svg>
      </summary>
      <nav aria-label="On this page" className="px-4 pb-3">
        {list}
      </nav>
    </details>
  )
}

/**
 * THE WAY TO A PERSON. A store opens a request in its dashboard (/app/support,
 * answered from /admin/resolution); anyone else, or anyone who'd rather,
 * emails the address that is actually read, with what to put in the message
 * so the first reply can be an answer rather than a question.
 */
export function ContactSupport({ compact = false, frame = HELP_CONTAINER }: { compact?: boolean; frame?: string }) {
  if (compact) {
    return (
      <p className="text-[14px] text-[#6b7280]">
        Still stuck? Email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-[#1a1a2e] underline decoration-[#1a1a2e]/30 underline-offset-2 hover:decoration-[#1a1a2e]">
          {SUPPORT_EMAIL}
        </a>{" "}
        with your username, and for an order the buyer&apos;s email address. Selling on Storelib?{" "}
        <a href="/app/support" className="font-medium text-[#1a1a2e] underline decoration-[#1a1a2e]/30 underline-offset-2 hover:decoration-[#1a1a2e]">
          Open a request
        </a>{" "}
        from your dashboard.
      </p>
    )
  }
  return (
    <section aria-labelledby="contact-support" className="border-t border-[#e5e7eb]">
      <div className={`${frame} flex flex-col gap-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:py-12`}>
        <div>
          <h2 id="contact-support" className="text-[18px] font-semibold text-[#1a1a2e]">
            Still need help?
          </h2>
          <p className="mt-1 max-w-[56ch] text-[14px] leading-relaxed text-[#6b7280]">
            Selling on Storelib? Open a request from your dashboard and we&apos;ll reply there. Or email us with your username, and for an order the buyer&apos;s email address, so we can look it up.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <a
            href="/app/support"
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-[#1a1a2e] px-5 text-[14px] font-medium text-white transition-colors hover:bg-[#2a2a44]"
          >
            Open a request
          </a>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-[#e5e7eb] bg-white px-5 text-[14px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f8f9fa]"
          >
            {SUPPORT_EMAIL}
          </a>
        </div>
      </div>
    </section>
  )
}
