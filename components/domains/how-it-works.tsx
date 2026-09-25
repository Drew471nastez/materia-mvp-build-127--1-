/**
 * HOW A CONNECTED DOMAIN BEHAVES, IN FOUR LINES
 *
 * Replaces three boxes that promised "Your Store", "Your OnePage" and
 * "Product Pages" at /p/, written before the website builder and before a
 * domain had a purpose. Each line is what the code does today:
 *
 *   Website        proxy.ts: the published website at the same paths, the
 *                  creator page while there is none
 *   Creator page   proxy.ts: / the page, /<product> a product, /links the
 *                  OnePage
 *   www            hostname.ts and proxy.ts: a bare apex goes to its www
 *                  (a subdomain is served as typed; the connect hint says so)
 *   HTTPS          app/api/domains/verify: issued once DNS points here
 */
import { apexOf, servingHost } from "@/lib/custom-domains/hostname"

export function HowItWorks({ example }: { example?: string | null }) {
  const apex = example ? apexOf(example) : "yourname.com"
  const rows: [string, string][] = [
    ["Website", "Your website, or creator page until you publish."],
    ["Creator page", "Your creator page, products and OnePage."],
    ["www", `${apex} goes to ${servingHost(apex)}.`],
    ["HTTPS", "Set up for you. DNS takes minutes, up to 48 hours."],
  ]
  return (
    <dl data-how-it-works="" className="divide-y divide-[#f0f1f3]">
      {rows.map(([term, text]) => (
        <div key={term} data-how-line="" className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:gap-4">
          <dt className="shrink-0 text-[13px] font-medium text-[#1a1a2e] sm:w-[112px]">{term}</dt>
          <dd className="min-w-0 text-[13px] leading-snug text-[#6b7280] [overflow-wrap:anywhere]">{text}</dd>
        </div>
      ))}
    </dl>
  )
}
