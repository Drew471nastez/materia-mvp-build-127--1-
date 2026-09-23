/**
 * A page of the Developer Hub, drawn from its tree. Server-rendered in full,
 * so a crawler and an agent that does not run script read every word.
 */
import type { DocNode } from "@/lib/developers/markdown"
import { CodeBlock } from "./code-block"
import { Inline } from "./inline"
import { SchemeSwatches, Specimens } from "./specimens"

function Heading({ level, id, text }: { level: 1 | 2 | 3; id: string; text: string }) {
  if (level === 1) {
    return (
      <h1 id={id} className="scroll-mt-[92px] text-[32px] font-bold leading-[1.15] tracking-[-0.02em] text-neutral-900 sm:text-[40px]">
        <Inline text={text} />
      </h1>
    )
  }
  const Tag = level === 2 ? "h2" : "h3"
  return (
    <Tag
      id={id}
      className={
        level === 2
          ? "group mt-14 scroll-mt-[92px] text-[24px] font-semibold leading-[1.25] tracking-[-0.01em] text-neutral-900"
          : "group mt-10 scroll-mt-[92px] text-[18px] font-semibold leading-[1.35] text-neutral-900"
      }
    >
      <Inline text={text} />
      {/* The link to this heading, for sharing one answer rather than a page. */}
      <a href={`#${id}`} className="ml-2 text-neutral-300 no-underline opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100" aria-label="Link to this heading">
        #
      </a>
    </Tag>
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
              <p key={i} className="mt-5 text-[16px] leading-[1.75] text-neutral-700">
                <Inline text={n.text} />
              </p>
            )
          case "quote":
            return (
              <blockquote key={i} className="mt-5 border-l-2 border-neutral-900 pl-4 text-[16px] leading-[1.75] text-neutral-700">
                <Inline text={n.text} />
              </blockquote>
            )
          case "rule":
            return <hr key={i} className="my-10 border-neutral-200" />
          case "list": {
            const List = n.ordered ? "ol" : "ul"
            return (
              <List
                key={i}
                className={`mt-5 space-y-2 pl-6 text-[16px] leading-[1.7] text-neutral-700 ${n.ordered ? "list-decimal marker:text-neutral-400" : "list-disc marker:text-neutral-300"}`}
              >
                {n.items.map((it, j) => (
                  <li key={j} className="pl-1"><Inline text={it} /></li>
                ))}
              </List>
            )
          }
          case "table":
            return (
              <div key={i} className="mt-6 overflow-x-auto rounded-xl border border-neutral-200 [scrollbar-width:thin]">
                <table className="w-full border-collapse text-left text-[14px] leading-[1.55]">
                  <thead className="bg-neutral-50">
                    <tr>
                      {n.head.map((h, j) => (
                        <th key={j} scope="col" className="whitespace-nowrap border-b border-neutral-200 px-4 py-2.5 font-semibold text-neutral-900">
                          <Inline text={h} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {n.rows.map((r, j) => (
                      <tr key={j} className="border-b border-neutral-100 last:border-0">
                        {r.map((c, k) => (
                          <td key={k} className={`px-4 py-2.5 align-top text-neutral-700 ${k === 0 ? "whitespace-nowrap" : ""}`}>
                            <Inline text={c} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case "code":
            return <CodeBlock key={i} code={n.code} lang={n.lang} title={n.title} />
          case "details":
            return (
              <details key={i} className="group/d mt-6 rounded-xl border border-neutral-200 [&_figure]:my-0 [&_figure]:rounded-none [&_figure]:ring-0">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-[15px] font-medium text-neutral-900 [&::-webkit-details-marker]:hidden">
                  <span className="first-letter:uppercase">{n.summary}</span>
                  <span aria-hidden className="text-neutral-400 transition-transform duration-200 group-open/d:rotate-45">+</span>
                </summary>
                <div className="overflow-hidden rounded-b-xl border-t border-neutral-200">
                  <DocContent nodes={n.children} />
                </div>
              </details>
            )
          case "specimens":
            return <Specimens key={i} items={n.items} />
          case "schemes":
            return <SchemeSwatches key={i} schemes={n.schemes} />
          default:
            return null
        }
      })}
    </>
  )
}
