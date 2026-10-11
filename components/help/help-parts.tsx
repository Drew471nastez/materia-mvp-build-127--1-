/**
 * The parts every Help Center page is drawn with: the container, the
 * breadcrumbs, an article's body and the way to reach a person.
 *
 * Server components. Nothing here needs the browser except the search box,
 * which lives in ./help-search.
 */
import Link from "next/link"
import type { ReactNode } from "react"
import { SUPPORT_EMAIL, type HelpBlock } from "@/lib/help/articles"
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
  return (
    <div className="max-w-[36rem] text-[16px] leading-[1.7] text-[#374151]">
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
              <h2 key={i} className="mt-10 text-[20px] font-semibold leading-snug tracking-tight text-[#1a1a2e]">
                {b.text}
              </h2>
            )
          case "steps":
            return (
              <ol key={i} className={`${gap} list-decimal space-y-2 pl-6 marker:font-medium marker:text-[#6b7280]`}>
                {b.items.map((item, j) => (
                  <li key={j} className="pl-1">
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
              <figure key={i} className={`${gap} -mx-1 sm:mx-0`} data-help-image="">
                {/* A screenshot of the real screen (public/help/), at its own size, never wider than the column. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={b.src}
                  alt={b.alt}
                  width={b.width}
                  height={b.height}
                  loading="lazy"
                  decoding="async"
                  className="block h-auto w-full max-w-full rounded-xl border border-[#e5e7eb] bg-[#f8f9fa]"
                  style={{ maxWidth: b.width }}
                />
                {b.caption ? <figcaption className="mt-2 text-[14px] leading-snug text-[#6b7280]">{b.caption}</figcaption> : null}
              </figure>
            )
          case "note":
            return (
              <p key={i} className={`${gap} rounded-xl border border-[#e5e7eb] bg-[#f8f9fa] px-4 py-3 text-[15px] leading-relaxed`}>
                <RichText text={b.text} />
              </p>
            )
          case "table":
            return (
              <div key={i} className={`${gap} -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0`}>
                {/* A wide table scrolls sideways on a phone rather than squeezing
                    every cell into two lines; a narrow one simply fits. */}
                <table
                  className={`w-full border-separate border-spacing-0 overflow-hidden rounded-xl border border-[#e5e7eb] text-left text-[14px] leading-normal ${b.head.length >= 4 ? "min-w-[540px] whitespace-nowrap" : "min-w-[420px]"}`}
                >
                  <thead>
                    <tr>
                      {b.head.map((h, j) => (
                        <th key={j} scope="col" className="border-b border-[#e5e7eb] bg-[#f8f9fa] px-4 py-2.5 font-semibold text-[#1a1a2e]">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, j) => (
                      <tr key={j}>
                        {row.map((cell, k) => (
                          <td
                            key={k}
                            className={`px-4 py-2.5 align-top ${j < b.rows.length - 1 ? "border-b border-[#f0f0f2]" : ""} ${k === 0 ? "font-medium text-[#1a1a2e]" : ""}`}
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
      })}
    </div>
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
