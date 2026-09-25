/**
 * A page of the Developer Hub, drawn from its tree. Server-rendered in full,
 * so a crawler and an agent that does not run script read every word.
 *
 * Storelib's colours: #1a1a2e for what is read first, a softer ink for
 * running prose, #6b7280 for what is secondary, #e5e7eb for every line.
 * Tables and code keep to the column and scroll inside themselves, so a
 * phone never scrolls the whole page sideways to read one.
 */
import type { CSSProperties } from "react"
import Link from "next/link"

import { calloutOf, hubGroupId, plainInline, type DocNode, type HubMapGroup } from "@/lib/developers/markdown"
import { CodeBlock } from "./code-block"
import { Inline } from "./inline"
import { SchemeSwatches, Specimens } from "./specimens"

/*
  Below 1024px the hub's bar sits under the site header, so a heading reached
  from a link has to clear both: the header's measured height (--hub-top),
  the bar's 48px, and a little air. From 1024 the bar is gone and the header
  is all it clears.
*/
const SCROLL_CLEAR = "scroll-mt-[calc(var(--hub-top,65px)+3.75rem)] lg:scroll-mt-[92px]"

/*
  A table wider than the column scrolls inside its frame. The shadow at an
  edge says there is more that way; white covers that travel with the rows
  hide it once the edge is reached.
*/
const SCROLL_SHADOWS: CSSProperties = {
  background: [
    "linear-gradient(to right, #fff 30%, rgba(255,255,255,0)) left center / 40px 100% no-repeat local",
    "linear-gradient(to left, #fff 30%, rgba(255,255,255,0)) right center / 40px 100% no-repeat local",
    "radial-gradient(farthest-side at 0 50%, rgba(26,26,46,0.14), rgba(26,26,46,0)) left center / 12px 100% no-repeat scroll",
    "radial-gradient(farthest-side at 100% 50%, rgba(26,26,46,0.14), rgba(26,26,46,0)) right center / 12px 100% no-repeat scroll",
  ].join(", "),
}

function Heading({ level, id, text }: { level: 1 | 2 | 3; id: string; text: string }) {
  if (level === 1) {
    return (
      <h1 id={id} className={`${SCROLL_CLEAR} text-[30px] font-bold leading-[1.15] tracking-[-0.02em] text-[#1a1a2e] sm:text-[38px]`}>
        <Inline text={text} />
      </h1>
    )
  }
  const Tag = level === 2 ? "h2" : "h3"
  return (
    <Tag
      id={id}
      className={`group ${SCROLL_CLEAR} text-[#1a1a2e] ${
        level === 2
          ? "mt-14 text-[22px] font-semibold leading-[1.25] tracking-[-0.01em] sm:text-[24px]"
          : "mt-10 text-[17px] font-semibold leading-[1.35] sm:text-[18px]"
      }`}
    >
      <Inline text={text} />
      {/* The link to this heading, for sharing one answer rather than a page. */}
      <a href={`#${id}`} className="ml-2 text-[#c4c7cf] no-underline opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100" aria-label="Link to this heading">
        #
      </a>
    </Tag>
  )
}

/**
 * A quote that opens with **Note** or **Warning**. Named in a word rather
 * than an icon: the word is what gets read.
 */
function Callout({ tone, label, body }: { tone: "note" | "warning"; label: string; body: string }) {
  const frame = tone === "warning" ? "border-[#f0d58c] bg-[#fffbeb]" : "border-[#e5e7eb] bg-[#f8f9fa]"
  const word = tone === "warning" ? "text-[#8a5300]" : "text-[#1a1a2e]"
  return (
    <div role="note" className={`mt-6 rounded-xl border px-4 py-3.5 text-[15px] leading-[1.65] text-[#3d3f4e] sm:px-5 ${frame}`}>
      <p className={`text-[13px] font-semibold ${word}`}>{label}</p>
      <p className="mt-1"><Inline text={body} /></p>
    </div>
  )
}

/**
 * The front page's map of the hub: each category, what it is for, and its
 * pages with a line on each. A directory to scan, in the sidebar's order.
 */
function HubMap({ groups }: { groups: HubMapGroup[] }) {
  return (
    <div className="mt-10 border-t border-[#e5e7eb]">
      {groups.map((g) => (
        <section
          key={g.name}
          aria-labelledby={hubGroupId(g.name)}
          className="grid gap-x-8 gap-y-3 border-b border-[#e5e7eb] py-6 md:grid-cols-[176px_minmax(0,1fr)] md:py-7"
        >
          <div>
            <h2 id={hubGroupId(g.name)} className={`${SCROLL_CLEAR} text-[17px] font-semibold leading-[1.3] text-[#1a1a2e]`}>{g.name}</h2>
            <p className="mt-1.5 text-[14px] leading-[1.55] text-[#6b7280]">{g.info}</p>
          </div>
          <ul className="-mx-2.5 grid content-start gap-x-3 sm:grid-cols-2">
            {g.pages.map((p) => (
              <li key={p.href}>
                <Link href={p.href} className="block rounded-lg px-2.5 py-2 transition-colors hover:bg-[#f8f9fa]">
                  <span className="block text-[15px] font-medium leading-[1.4] text-[#1a1a2e]">{p.nav}</span>
                  <span className="mt-0.5 block text-[13.5px] leading-[1.5] text-[#6b7280]">{p.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/*
  How wide each column may be. A column whose every cell is short stays on
  one line and takes no more than it needs; a column of sentences gets room
  to be read in, and the table scrolls inside its frame before it squeezes
  one to a few words a line.
*/
function columnFit(head: string[], rows: string[][]): string[] {
  return head.map((_, j) => {
    const longest = Math.max(0, ...rows.map((r) => plainInline(r[j] ?? "").length))
    if (longest <= 18) return "whitespace-nowrap"
    return j === 0 ? "min-w-[8.5rem]" : "min-w-[12rem]"
  })
}

/*
  ON A PHONE a table of three or more columns is read a row at a time: each
  row a short record, its first cell the name, every other cell under its
  column's heading. Same markup, other CSS; the roles keep it a table for a
  screen reader in browsers that drop table semantics once display changes.
*/
const STACK_ROW = "max-sm:block max-sm:px-3.5 max-sm:py-3"
const STACK_CELL = "max-sm:block max-sm:min-w-0 max-sm:whitespace-normal max-sm:p-0 max-sm:empty:hidden"
const STACK_NAME = "max-sm:font-medium max-sm:text-[#1a1a2e]"
const STACK_LABELLED =
  "max-sm:mt-2 max-sm:before:mb-0.5 max-sm:before:block max-sm:before:text-[12px] max-sm:before:font-semibold max-sm:before:text-[#6b7280] max-sm:before:content-[attr(data-label)]"

function DocTable({ head, rows }: { head: string[]; rows: string[][] }) {
  const stack = head.length >= 3
  const fit = columnFit(head, rows)
  return (
    <div data-doc-table className="mt-6 overflow-x-auto rounded-xl border border-[#e5e7eb] [scrollbar-width:thin]" style={SCROLL_SHADOWS}>
      <table
        role={stack ? "table" : undefined}
        className={`w-full border-collapse text-left text-[13.5px] leading-[1.55] sm:text-[14px] ${stack ? "max-sm:block" : ""}`}
      >
        <thead role={stack ? "rowgroup" : undefined} className={stack ? "max-sm:hidden" : undefined}>
          <tr role={stack ? "row" : undefined}>
            {head.map((h, j) => (
              <th
                key={j}
                scope="col"
                role={stack ? "columnheader" : undefined}
                className="whitespace-nowrap border-b border-[#e5e7eb] bg-[#f8f9fa] px-3.5 py-2.5 text-[13px] font-semibold text-[#1a1a2e] sm:px-4"
              >
                <Inline text={h} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody role={stack ? "rowgroup" : undefined} className={stack ? "max-sm:block" : undefined}>
          {rows.map((r, j) => (
            <tr key={j} role={stack ? "row" : undefined} className={`border-b border-[#f1f2f4] last:border-0 ${stack ? STACK_ROW : ""}`}>
              {r.map((c, k) => (
                <td
                  key={k}
                  role={stack ? "cell" : undefined}
                  data-label={stack && k > 0 ? plainInline(head[k] ?? "") : undefined}
                  className={`px-3.5 py-2.5 align-top text-[#3d3f4e] sm:px-4 ${fit[k] ?? ""} ${
                    stack ? `${STACK_CELL} ${k === 0 ? STACK_NAME : STACK_LABELLED}` : ""
                  }`}
                >
                  <Inline text={c} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function DocContent({ nodes }: { nodes: DocNode[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.kind) {
          case "heading":
            return <Heading key={i} level={n.level} id={n.id} text={n.text} />
          case "paragraph":
            return (
              <p key={i} className="mt-5 text-[16px] leading-[1.75] text-[#3d3f4e]">
                <Inline text={n.text} />
              </p>
            )
          case "quote": {
            const callout = calloutOf(n.text)
            if (callout) return <Callout key={i} {...callout} />
            return (
              <blockquote key={i} className="mt-5 border-l-2 border-[#1a1a2e] pl-4 text-[16px] leading-[1.75] text-[#3d3f4e]">
                <Inline text={n.text} />
              </blockquote>
            )
          }
          case "rule":
            return <hr key={i} className="my-10 border-[#e5e7eb]" />
          case "list": {
            const List = n.ordered ? "ol" : "ul"
            return (
              <List
                key={i}
                start={n.ordered ? n.start : undefined}
                className={`mt-5 space-y-2.5 pl-6 text-[16px] leading-[1.7] text-[#3d3f4e] ${
                  n.ordered ? "list-decimal marker:text-[#9ca3af]" : "list-disc marker:text-[#c4c7cf]"
                }`}
              >
                {n.items.map((it, j) => (
                  <li key={j} className="pl-1"><Inline text={it} /></li>
                ))}
              </List>
            )
          }
          case "table":
            return <DocTable key={i} head={n.head} rows={n.rows} />
          case "code":
            return <CodeBlock key={i} code={n.code} lang={n.lang} title={n.title} />
          case "details":
            return (
              <details key={i} className="group/d mt-6 rounded-xl border border-[#e5e7eb] [&_figure]:my-0 [&_figure]:rounded-none [&_figure]:ring-0">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-4 py-2.5 text-[15px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f8f9fa] [&::-webkit-details-marker]:hidden">
                  <span className="first-letter:uppercase">{n.summary}</span>
                  <span aria-hidden className="text-[18px] leading-none text-[#9ca3af] transition-transform duration-200 group-open/d:rotate-45">+</span>
                </summary>
                <div className="overflow-hidden rounded-b-xl border-t border-[#e5e7eb]">
                  <DocContent nodes={n.children} />
                </div>
              </details>
            )
          case "specimens":
            return <Specimens key={i} items={n.items} />
          case "schemes":
            return <SchemeSwatches key={i} schemes={n.schemes} />
          case "hubmap":
            return <HubMap key={i} groups={n.groups} />
          default:
            return null
        }
      })}
    </>
  )
}
