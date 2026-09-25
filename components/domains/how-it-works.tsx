"use client"

/**
 * HOW A CONNECTED DOMAIN BEHAVES, IN FOUR LINES
 *
 * It used to be three boxes promising "Your Store", "Your OnePage" and
 * "Product Pages" at /p/, which described the product before the website
 * builder existed. These four are what proxy.ts and the domains routes
 * actually do today, for the target this domain is set to:
 *
 *   Shows     what www.<domain> serves (lib/custom-domain/routing.ts)
 *   No www    the bare domain redirects to www (app/api/domains, proxy.ts)
 *   HTTPS     issued automatically once DNS points here (verify route)
 *   Timing    how long DNS takes, and that storelib.com keeps working
 */
import { cn } from "@/lib/utils"
import { TARGET_LABEL, wwwHost, type DomainTarget } from "@/lib/custom-domain/targets"
import type { DomainTone } from "./dns-setup"
import type { TargetSources } from "./target-choice"

export function showsLine(target: DomainTarget, s: TargetSources): string {
  if (target === "website") {
    return s.websiteLive
      ? `Your website: every page of ${s.websiteHost}, at the same paths.`
      : "Your creator page for now. Your website once it is published."
  }
  if (target === "creator_page") return `Your creator page, ${s.creatorPagePath}. Products open at /product-name, your OnePage at /links.`
  return `Your OnePage. Products open at /product-name.`
}

export function HowItWorks({
  domain,
  target,
  sources,
  tone,
}: {
  domain: string | null
  target: DomainTarget
  sources: TargetSources
  tone: DomainTone
}) {
  const bare = (domain || "yourdomain.com").replace(/^www\./, "")
  const www = wwwHost(bare)
  const rows: [string, string, boolean][] = [
    [www, showsLine(target, sources), true],
    [bare, `Sends visitors to ${www}.`, true],
    ["HTTPS", "Set up for you once DNS is right.", false],
    ["Timing", "DNS usually takes minutes, up to 48 hours. Your storelib.com addresses keep working.", false],
  ]
  const light = tone === "light"
  return (
    <dl data-how-it-works="" data-shows={TARGET_LABEL[target]} className={cn("divide-y", light ? "divide-[#f0f1f3]" : "divide-white/[0.07]")}>
      {rows.map(([term, text, host]) => (
        <div key={term} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:gap-4">
          <dt className={cn("shrink-0 truncate text-[13px] font-medium sm:w-[180px]", host && "font-mono", light ? "text-[#1a1a2e]" : "text-white")}>{term}</dt>
          <dd className={cn("min-w-0 text-[13px] leading-snug", light ? "text-[#6b7280]" : "text-white/60")}>{text}</dd>
        </div>
      ))}
    </dl>
  )
}
