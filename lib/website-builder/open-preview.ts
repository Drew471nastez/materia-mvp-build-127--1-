"use client"

import { openOpeningTab } from "./opening-tab"

/**
 * OPEN A WEBSITE THAT IS NOT PUBLISHED YET. "Open the live page" on an
 * unpublished site opened an address with nothing live at it. This opens the
 * install's preview instead (app/api/website-builder/themes/[installId]/
 * preview: the same link the publish panel shares, made once and reused), in
 * a new tab, with its drafts.
 *
 * The tab is opened at the press and pointed at the preview once the server
 * answers: a window opened after an await is no longer the press's, and the
 * browser blocks it. Until then it says "Opening your website", never
 * about:blank, and when the link cannot be made it says why in that tab as
 * well as here (./opening-tab.ts).
 */
export async function openInstallPreview(installId: string, websiteUrl: string): Promise<string | null> {
  const tab = openOpeningTab("Getting the preview of your drafts.")
  try {
    const r = await fetch(`/api/website-builder/themes/${encodeURIComponent(installId)}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ base: websiteUrl }),
    })
    const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string }
    if (!r.ok || !j.url) {
      const reason = j.error ?? "Could not open the preview."
      tab?.fail(reason)
      return reason
    }
    if (!tab?.go(j.url)) window.open(j.url, "_blank", "noopener")
    return null
  } catch {
    tab?.fail("Could not open the preview. Check your connection and try again.")
    return "Could not open the preview."
  }
}
