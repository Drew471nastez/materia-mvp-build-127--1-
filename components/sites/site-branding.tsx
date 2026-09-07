/**
 * "Built with Storelib", at the foot of a free site.
 *
 * Subtle on purpose, per the brief: it sits under the creator's own footer in
 * muted text at the site's own colours, not a banner across their page. A
 * badge that fights the design is a badge people pay to remove for the wrong
 * reason — because it is ugly, rather than because they have outgrown the free
 * plan.
 *
 * WHETHER it renders is decided on the server, from the plan, and never from
 * `settings.hideBranding` alone: that flag is creator-writable, so honouring it
 * on its own would make the paid feature a checkbox anyone can tick.
 */

import { SmartLink } from "@/components/smart-link"

export function SiteBranding({ textColor }: { textColor?: string }) {
  return (
    <div className="w-full border-t border-black/5 py-4 text-center">
      <SmartLink
        href="https://storelib.com"
        className="text-xs opacity-60 transition-opacity hover:opacity-100"
        style={{ color: textColor || undefined }}
      >
        Built with Storelib
      </SmartLink>
    </div>
  )
}
