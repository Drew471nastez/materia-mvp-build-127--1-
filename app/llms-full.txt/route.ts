/**
 * storelib.com/llms-full.txt: the whole Storelib Developer Hub as one
 * markdown file, for an agent that wants the framework in context rather than
 * a page at a time. The same tree as the pages, with every generated table
 * expanded, so it cannot say anything the site does not.
 */
import { hubText } from "@/lib/developers/render-text"
import { FRAMEWORK_NAME, HUB_NAME, SITE_ORIGIN } from "@/lib/developers/pages"

export const dynamic = "force-static"

export function GET() {
  const head = [
    `# ${HUB_NAME}: ${FRAMEWORK_NAME}, complete reference`,
    "",
    `> Source: ${SITE_ORIGIN}/developers. Map of pages: ${SITE_ORIGIN}/llms.txt.`,
    "",
    "---",
    "",
  ].join("\n")
  return new Response(head + hubText() + "\n", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  })
}
