/**
 * The hub as plain markdown, for /llms-full.txt and anything else that reads
 * text rather than a web page. Same tree as the page, with every generated
 * table filled in, so an agent reading this and a person reading the site
 * are reading the same document.
 *
 * Relative links become absolute: an agent reading a file has no page to
 * resolve `/developers/schema` against.
 */
import { DEVELOPER_DOCS } from "./content.generated"
import { expandAll } from "./directives"
import { parseMarkdown, type DocNode } from "./markdown"
import { DEV_PAGES, SITE_ORIGIN, devPath } from "./pages"

function absolute(text: string): string {
  return text.replace(/\]\((\/[^)]*)\)/g, (_m, href: string) => `](${SITE_ORIGIN}${href})`)
}

function row(cells: string[]): string {
  return `| ${cells.map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`
}

export function nodesToText(nodes: DocNode[]): string {
  const out: string[] = []
  for (const n of nodes) {
    switch (n.kind) {
      case "heading": out.push(`${"#".repeat(n.level)} ${absolute(n.text)}`); break
      case "paragraph": out.push(absolute(n.text)); break
      case "quote": out.push(`> ${absolute(n.text)}`); break
      case "rule": out.push("---"); break
      case "list":
        out.push(n.items.map((it, i) => `${n.ordered ? `${i + 1}.` : "-"} ${absolute(it)}`).join("\n"))
        break
      case "table":
        out.push([row(n.head), row(n.head.map(() => "---")), ...n.rows.map((r) => row(r.map(absolute)))].join("\n"))
        break
      case "code":
        out.push(`${n.title ? `${n.title}\n\n` : ""}\`\`\`${n.lang === "storelib" ? "html" : n.lang}\n${n.code}\n\`\`\``)
        break
      case "details":
        out.push(`${n.summary}:\n\n${nodesToText(n.children)}`)
        break
      case "specimens":
        out.push([
          row(["Setting", "Control", "Default", "What it does"]),
          row(["---", "---", "---", "---"]),
          ...n.items.map((it) => row([
            `${it.label} (\`${it.id}\`)`,
            it.control + (it.min !== undefined || it.max !== undefined ? ` ${it.min ?? ""} to ${it.max ?? ""}${it.unit ?? ""}` : "") + (it.options?.length ? `: ${it.options.join(", ")}` : ""),
            it.value === null || it.value === undefined || it.value === "" ? "" : String(it.value),
            absolute(it.does),
          ])),
        ].join("\n"))
        break
      case "schemes":
        out.push([
          row(["Colour", ...n.schemes.map((sc) => `${sc.name} (\`${sc.key}\`)`)]),
          row(["---", ...n.schemes.map(() => "---")]),
          ...n.schemes[0].colors.map((c, i) => row([`${c.group}: ${c.label}`, ...n.schemes.map((sc) => sc.colors[i].value)])),
        ].join("\n"))
        break
      case "directive":
        break
    }
  }
  return out.join("\n\n")
}

/** One page, expanded, as markdown. */
export function pageText(slug: string): string {
  const src = DEVELOPER_DOCS[slug]
  if (src === undefined) return ""
  return nodesToText(expandAll(parseMarkdown(src)))
}

/** The whole hub, in reading order, each page headed with its address. */
export function hubText(): string {
  return DEV_PAGES.map((p) => `<!-- ${SITE_ORIGIN}${devPath(p.slug)} -->\n\n${pageText(p.slug)}`).join("\n\n---\n\n")
}

/**
 * What an agent reads before it writes anything: the rules first, then the
 * rest of the hub. The rules are short and are what gets code refused or a
 * site broken, so they are not left to be found halfway through.
 */
export function agentGuideText(): string {
  const rest = DEV_PAGES.filter((p) => p.slug !== "rules")
  return [
    `<!-- ${SITE_ORIGIN}${devPath("rules")} -->\n\n${pageText("rules")}`,
    ...rest.map((p) => `<!-- ${SITE_ORIGIN}${devPath(p.slug)} -->\n\n${pageText(p.slug)}`),
  ].join("\n\n---\n\n")
}
