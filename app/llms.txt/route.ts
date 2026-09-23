/**
 * ===========================================================================
 *  storelib.com/llms.txt
 * ===========================================================================
 * The map of the Storelib Developer Hub in the llms.txt format
 * (llmstxt.org): a title, a one-paragraph summary, then sections of links,
 * each with one line saying what is behind it. It is what an agent reads
 * first to decide which page it needs.
 *
 * Built from lib/developers/pages.ts, the same list the hub's sidebar and
 * the sitemap read, so a page cannot be in one and missing from another.
 */
import { llmsTxt } from "@/lib/developers/llms"

export const dynamic = "force-static"

export function GET() {
  return new Response(llmsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  })
}
