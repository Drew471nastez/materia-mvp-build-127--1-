"use client"

import { POLICY_PAGES } from "@/lib/website-builder/policy-pages"
import { Card, GOES_LIVE, Lead, PageTitle, Row, Toggle, buttonClass, inputClass } from "./parts"
import type { SettingsContext } from "./types"

const str = (v: unknown) => (typeof v === "string" ? v : "")

export function PolicySettings({ ctx }: { ctx: SettingsContext }) {
  const cookies = ctx.settings.cookie_banner_enabled === true

  return (
    <>
      <PageTitle>Policies</PageTitle>
      <Lead>
        Every website has these pages and links to them from its footer. They start as templates: replace anything in
        square brackets with your own terms before you publish.
      </Lead>

      {/* Edited in the builder, not here. They are ordinary pages made of
          ordinary sections, and a second editor for the same rows is how a
          draft gets lost. */}
      <Card title="Policy pages">
        {POLICY_PAGES.map((page) => (
          <Row key={page.key} label={page.title} hint={`/${page.key}`}>
            <button type="button" onClick={() => ctx.onEditPage(page.key)} className={buttonClass}>
              Edit
            </button>
          </Row>
        ))}
      </Card>

      <Card title="Cookie banner" footer={GOES_LIVE}>
        <Row label="Show a cookie banner" hint="Asks visitors to accept or decline cookies on their first visit.">
          <Toggle checked={cookies} onChange={(on) => ctx.onSettingChange("cookie_banner_enabled", on)} label="Show a cookie banner" />
        </Row>
        {cookies && (
          <>
            <Row label="Message" stack htmlFor="wb-cookie-text">
              <textarea
                id="wb-cookie-text"
                rows={2}
                value={str(ctx.settings.cookie_banner_text)}
                placeholder="We use cookies to improve your experience."
                onChange={(e) => ctx.onSettingChange("cookie_banner_text", e.target.value)}
                className="w-full resize-none rounded-lg border border-white/12 bg-[#171717] px-3.5 py-2.5 text-[14.5px] leading-relaxed text-white outline-none transition-colors duration-150 placeholder:text-white/30 focus:border-white/35"
              />
            </Row>
            <Row label="Accept button" htmlFor="wb-cookie-accept">
              <input
                id="wb-cookie-accept"
                value={str(ctx.settings.cookie_accept_text)}
                placeholder="Accept all"
                onChange={(e) => ctx.onSettingChange("cookie_accept_text", e.target.value)}
                className={inputClass}
              />
            </Row>
            <Row label="Decline button" htmlFor="wb-cookie-decline">
              <input
                id="wb-cookie-decline"
                value={str(ctx.settings.cookie_decline_text)}
                placeholder="Decline"
                onChange={(e) => ctx.onSettingChange("cookie_decline_text", e.target.value)}
                className={inputClass}
              />
            </Row>
          </>
        )}
      </Card>
    </>
  )
}
