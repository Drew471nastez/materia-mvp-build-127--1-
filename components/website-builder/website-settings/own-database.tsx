"use client"

import { Badge, Card, Row } from "./parts"
import type { SettingsContext } from "./types"
import { tt } from "@/lib/i18n/text"

/**
 * ===========================================================================
 *  YOUR OWN SUPABASE: COMING SOON
 * ===========================================================================
 * Round 51, the owner: a "Coming soon" badge, and nothing to press. The row
 * says what it will be and offers no button, no form and no sign in, and it
 * asks the server nothing.
 *
 * What is already saved is left exactly as it is: a website connected
 * before keeps its project (the settings under lib/website-builder/
 * own-database.ts are not touched here), and sections that use it go on
 * working. The connect and pick routes (app/api/website-builder/supabase)
 * stay, unreached, for when it opens.
 */
export function OwnDatabaseSettings({ ctx: _ctx }: { ctx: SettingsContext }) {
  return (
    <Card title={tt("Your own database")}>
      <div data-own-db="" data-own-db-soon="" aria-disabled="true">
        <Row
          inline
          label={
            <span className="inline-flex items-center gap-2.5 text-white/70">
              <SupabaseMark className="h-[18px] w-[18px] opacity-60" />
              Supabase
            </span>
          }
          hint={tt("For sections that save your own data, like a waitlist.")}
        >
          <Badge tone="neutral">{tt("Coming soon")}</Badge>
        </Row>
      </div>
    </Card>
  )
}

/** Supabase's mark, in its own two greens. */
function SupabaseMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 109 113" className={className} aria-hidden="true">
      <path d="M63.7 110.3c-2.9 3.6-8.7 1.6-8.7-3l-1-67.2h45.2c8.2 0 12.8 9.5 7.7 15.9L63.7 110.3Z" fill="#249361" />
      <path d="M45.3 2.1c2.9-3.6 8.7-1.6 8.7 3l.5 67.2H9.8C1.6 72.3-2.9 62.8 2.2 56.4L45.3 2.1Z" fill="#3ECF8E" />
    </svg>
  )
}
