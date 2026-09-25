"use client"

import { POLICY_PAGES } from "@/lib/website-builder/policy-pages"
import { COOKIE_ACCEPT_TEXT, COOKIE_DECLINE_TEXT, SITE_COOKIE_TEXT } from "@/lib/consent/copy"
import { Card, GOES_LIVE, Lead, PageTitle, Row, Toggle, buttonClass, inputClass, textAreaClass } from "./parts"
import type { SettingsContext } from "./types"

/** A stored colour the colour input can show, or its default. */
const colourOr = (v: unknown, fallback: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback)

export function PolicySettings({ ctx }: { ctx: SettingsContext }) {
  /* Shown unless switched off; a site saved before the switch existed shows it. */
  const showBanner = ctx.settings.cookie_banner_show !== false
  const ownColours = ctx.settings.cookie_banner_enabled === true

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
          <Row key={page.key} label={page.title} hint={`/${page.key}`} inline>
            <button type="button" onClick={() => ctx.onEditPage(page.key)} className={buttonClass}>
              Edit
            </button>
          </Row>
        ))}
      </Card>

      {/*
        THE BANNER, ON OR OFF, IN THE SITE'S OWN WORDS. The switch here used
        to be "use my own words", labelled as if it showed the banner, so
        turning it off changed the wording and the banner stayed. It shows
        and hides the banner now. The words are there to edit from the start,
        with the site's default sentence already in them, and the colours are
        a choice of their own. The same settings are in the builder's theme
        settings, under Cookie & privacy.
      */}
      <Card title="Cookie banner" footer={GOES_LIVE}>
        <Row label="Show the cookie banner" hint="Off: no banner, and nothing optional is stored for your visitors." inline>
          <Toggle checked={showBanner} onChange={(on) => ctx.onSettingChange("cookie_banner_show", on)} label="Show the cookie banner" />
        </Row>
        {showBanner && (
          <>
            <Row label="Message" stack htmlFor="wb-cookie-text">
              <textarea
                id="wb-cookie-text"
                rows={3}
                value={typeof ctx.settings.cookie_banner_text === "string" ? ctx.settings.cookie_banner_text : SITE_COOKIE_TEXT}
                onChange={(e) => ctx.onSettingChange("cookie_banner_text", e.target.value)}
                className={textAreaClass}
              />
            </Row>
            <Row label="Accept button" htmlFor="wb-cookie-accept">
              <input
                id="wb-cookie-accept"
                value={typeof ctx.settings.cookie_accept_text === "string" ? ctx.settings.cookie_accept_text : COOKIE_ACCEPT_TEXT}
                onChange={(e) => ctx.onSettingChange("cookie_accept_text", e.target.value)}
                className={inputClass}
              />
            </Row>
            <Row label="Reject button" htmlFor="wb-cookie-decline">
              <input
                id="wb-cookie-decline"
                value={typeof ctx.settings.cookie_decline_text === "string" ? ctx.settings.cookie_decline_text : COOKIE_DECLINE_TEXT}
                onChange={(e) => ctx.onSettingChange("cookie_decline_text", e.target.value)}
                className={inputClass}
              />
            </Row>
            <Row label="Use my own colours" hint="Off: the banner is white with dark text." inline>
              <Toggle checked={ownColours} onChange={(on) => ctx.onSettingChange("cookie_banner_enabled", on)} label="Use my own colours" />
            </Row>
            {ownColours && (
              <Row label="Colours" hint="Background, then text." inline>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Banner background"
                    value={colourOr(ctx.settings.cookie_bg, "#0f172a")}
                    onChange={(e) => ctx.onSettingChange("cookie_bg", e.target.value)}
                    className="h-11 w-12 cursor-pointer rounded-lg border border-white/12 bg-transparent p-1 md:h-10"
                  />
                  <input
                    type="color"
                    aria-label="Banner text"
                    value={colourOr(ctx.settings.cookie_text_color, "#ffffff")}
                    onChange={(e) => ctx.onSettingChange("cookie_text_color", e.target.value)}
                    className="h-11 w-12 cursor-pointer rounded-lg border border-white/12 bg-transparent p-1 md:h-10"
                  />
                </div>
              </Row>
            )}
          </>
        )}
      </Card>
    </>
  )
}
