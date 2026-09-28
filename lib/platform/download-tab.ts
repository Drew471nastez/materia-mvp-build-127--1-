/**
 * ===========================================================================
 *  A FILE OPENS BESIDE THE PAGE, NEVER ON TOP OF IT
 * ===========================================================================
 * Every download on Storelib ends the same way: the server hands back a
 * short lived signed address on STORAGE'S origin, and the page has to turn
 * that into a saved file.
 *
 * The shape that did not work, and that was in four places:
 *
 *     const a = document.createElement("a")
 *     a.href = signedUrl
 *     a.download = fileName
 *     a.click()
 *
 * `download` is ignored on a cross-origin address. The click is then an
 * ordinary navigation, and the browser draws whatever came back over the
 * page that asked for it. A buyer pressing Download on their receipt got a
 * PDF where the receipt had been, with no way back to their files. The
 * owner reported exactly that.
 *
 * The server does ask storage for `Content-Disposition: attachment` on every
 * address it signs (lib/storage/download.ts), and while that header arrives
 * the browser saves rather than draws. That is a guard, not a guarantee: an
 * asset with no stored name, an older public link, a storage error page, all
 * come back drawable. The page must not lose itself when one of them does.
 *
 * So the file goes to a tab of its own.
 *
 *   openDownloadTab()   an EMPTY tab, opened inside the press, before the
 *                       request for the address. A window opened after an
 *                       await is a pop-up and blockers eat it.
 *   tab.point(url)      a holding line, then the address once it arrives.
 *                       The tab shuts itself once the file has gone to the
 *                       download manager, so a saved file leaves nothing
 *                       behind; a file the browser DRAWS keeps its tab,
 *                       because that tab is the file (closeOnceSaved).
 *   tab.close()         when the request failed and there is nothing to show.
 *
 * Where the address really is savable in place, an ordinary anchor is still
 * better: no tab, no flash (anchorCanSave). And a browser that refuses the
 * tab outright reads showBlockedDownload, which puts the file one press
 * away instead of failing silently.
 *
 * In the iOS and Android apps none of this applies: no tab is opened, and
 * the address goes to the system browser (lib/platform/save-file.ts).
 */

/** What the buyer reads when the browser refused the tab. */
export const TAB_REFUSED = "This browser stopped the new tab from opening."

/** The one line a row or a toast shows, pointing at the notice. */
export const SAVE_FROM_NOTICE = "Your file is ready below. Press Save to keep it."

/** A tab of this page's own, opened for one press. */
export interface DownloadTab {
  /** Point it at the file. False when it is gone or would not take the address. */
  point: (url: string) => boolean
  close: () => void
}

/** On the tab's own body while it is still ours and nothing has been drawn in it. */
const HOLDING = "data-storelib-download"

/** What the tab says while the file is on its way. Never a blank white page. */
const HOLDING_PAGE =
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Download</title></head>` +
  `<body ${HOLDING}="" style="margin:0;display:grid;place-items:center;height:100vh;font:15px/1.5 Inter,system-ui,sans-serif;color:#6b7280;background:#f5f6f8">Your download is starting.</body></html>`

/**
 * Close the tab again once the file has gone to the download manager.
 *
 * MEASURED, NOT GUESSED. Point a tab at an address storage answers as an
 * attachment and the navigation becomes a download, which means the tab
 * keeps the holding page above: left alone it is one empty tab for every
 * file saved. Closing it does not stop anything, a 4MB file finished after
 * its tab was shut halfway through the transfer. When the answer is DRAWN
 * instead, that tab belongs to storage's origin and reading it throws,
 * which is how these two are told apart here, and that tab is left where it
 * is because it IS the file.
 *
 * Ten seconds: the signed address was already fetched before the tab was
 * pointed anywhere, so all that is left is storage answering, and a tab
 * that is still holding after ten seconds says what it is rather than
 * sitting there blank.
 */
function closeOnceSaved(tab: Window): void {
  window.setTimeout(() => {
    try {
      if (tab.closed) return
      if (tab.document.body?.hasAttribute(HOLDING)) tab.close()
    } catch {
      /* Another origin now: the file is being shown in there. */
    }
  }, 10000)
}

/**
 * A tab of its own for this press, opened before anything is awaited.
 *
 * Not `window.open(url, "_blank", "noopener")`: with that feature set the
 * answer is null in every browser, and there would be no tab left to point
 * anywhere. The way back is cut on the tab itself instead, which is the
 * same protection.
 */
export function openDownloadTab(): DownloadTab | null {
  let tab: Window | null = null
  try {
    tab = window.open("", "_blank")
  } catch {
    return null
  }
  if (!tab) return null
  try {
    tab.opener = null
  } catch {
    /* Some browsers cut it themselves and refuse the write. */
  }
  return {
    point: (url: string) => {
      try {
        if (!tab || tab.closed) return false
        try {
          tab.document.open()
          tab.document.write(HOLDING_PAGE)
          tab.document.close()
        } catch {
          /* A browser that refuses the write leaves it blank; still usable. */
        }
        /* replace, so the holding page is not left in that tab's history. */
        tab.location.replace(url)
        closeOnceSaved(tab)
        return true
      } catch {
        return false
      }
    },
    close: () => {
      try {
        tab?.close()
      } catch {
        /* Already gone. */
      }
    },
  }
}

/**
 * An address an `<a download>` really obeys: our own origin, or bytes the
 * page already holds. Everything else is another origin, where the
 * attribute does nothing and the click is a navigation.
 */
export function anchorCanSave(url: string): boolean {
  if (/^(blob|data):/i.test(url)) return true
  try {
    return new URL(url, window.location.href).origin === window.location.origin
  } catch {
    return false
  }
}

/** The ordinary anchor click, for an address anchorCanSave allows. */
export function clickDownloadLink(url: string, filename: string): void {
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.style.display = "none"
  link.rel = "noopener noreferrer"
  document.body.appendChild(link)
  link.click()
  setTimeout(() => link.remove(), 300)
}

/**
 * The tab was refused, so the file is put where it can be pressed.
 *
 * It is plain DOM because every surface that downloads shares it, from the
 * receipt to the library grid to a creator's public page, and none of them
 * may lose the page the visitor is on. Nothing here navigates that page.
 */
export function showBlockedDownload(url: string, filename: string): void {
  document.querySelector("[data-download-blocked]")?.remove()

  const holder = document.createElement("div")
  holder.setAttribute("data-download-blocked", "")
  holder.className = "fixed inset-x-0 bottom-0 z-[120] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] print:hidden"

  const card = document.createElement("div")
  card.className =
    "mx-auto flex max-w-[420px] flex-col gap-2 rounded-2xl border border-[#e4e7ec] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_-8px_rgba(16,24,40,0.24)]"
  holder.appendChild(card)

  const title = document.createElement("p")
  title.className = "text-[14px] font-semibold text-[#1a1a2e]"
  title.textContent = TAB_REFUSED
  card.appendChild(title)

  const note = document.createElement("p")
  note.className = "text-[13px] leading-snug text-[#6b7280]"
  note.textContent = "Your file is ready. Press Save to keep it. This page stays where it is."
  card.appendChild(note)

  const row = document.createElement("div")
  row.className = "mt-1 flex items-center gap-2"
  card.appendChild(row)

  const link = document.createElement("a")
  link.setAttribute("data-download-blocked-link", "")
  link.href = url
  link.download = filename
  link.target = "_blank"
  link.rel = "noopener noreferrer"
  link.className =
    "inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-[#0f0f1c] bg-[#1a1a2e] px-3 text-[13px] font-semibold text-white"
  const label = document.createElement("span")
  label.className = "truncate"
  label.textContent = `Save ${filename}`
  link.appendChild(label)
  row.appendChild(link)

  const close = document.createElement("button")
  close.type = "button"
  close.className =
    "inline-flex h-9 shrink-0 items-center justify-center rounded-[10px] border border-[#d5d9e0] bg-[#f3f4f6] px-3 text-[13px] font-semibold text-[#1a1a2e]"
  close.textContent = "Close"
  row.appendChild(close)

  const remove = () => holder.remove()
  close.addEventListener("click", remove)
  link.addEventListener("click", () => setTimeout(remove, 400))
  /* The signed address lives five minutes; the notice goes when it does. */
  setTimeout(remove, 5 * 60 * 1000)

  document.body.appendChild(holder)
}
