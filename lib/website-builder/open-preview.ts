"use client"

/**
 * OPEN A WEBSITE THAT IS NOT PUBLISHED YET. "Open the live page" on an
 * unpublished site opened an address with nothing live at it. This opens the
 * install's preview instead (app/api/website-builder/themes/[installId]/
 * preview: the same link the publish panel shares, made once and reused), in
 * a new tab, with its drafts.
 *
 * The tab is opened at the press and pointed at the preview once the server
 * answers: a window opened after an await is no longer the press's, and the
 * browser blocks it. If the link cannot be made, the tab closes and the
 * answer says why.
 */
export async function openInstallPreview(installId: string, websiteUrl: string): Promise<string | null> {
  const tab = window.open("", "_blank")
  try {
    const r = await fetch(`/api/website-builder/themes/${encodeURIComponent(installId)}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ base: websiteUrl }),
    })
    const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string }
    if (!r.ok || !j.url) {
      tab?.close()
      return j.error ?? "Could not open the preview."
    }
    if (tab) tab.location.href = j.url
    else window.open(j.url, "_blank", "noopener")
    return null
  } catch {
    tab?.close()
    return "Could not open the preview."
  }
}
