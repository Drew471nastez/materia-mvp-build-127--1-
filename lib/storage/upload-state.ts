"use client"

/**
 * ===========================================================================
 *  THE WORDS AN UPLOAD SHOWS, IN ONE PLACE
 * ===========================================================================
 * Two things used to differ between the product editor's file list and the
 * older uploader on the product edit page: what a row says while the server
 * is checking the file that just arrived, and whether anything is said at
 * all for a step that is over in a blink.
 *
 * The rule, the same everywhere now:
 *
 *   uploading        "Uploading…", with how much of how much has gone.
 *   completing       nothing for the first CHECKING_DELAY_MS. An ordinary
 *                    file is checked in well under that (a few small reads,
 *                    lib/security/uploads), so a word that appears for two
 *                    frames is noise. Past it, "Checking file…", because by
 *                    then a person is waiting and silence is worse.
 *   complete         "Ready".
 *   paused, error, aborted
 *                    "Paused", the plain sentence for what went wrong,
 *                    "Cancelled".
 *
 * Nothing here names a check, an engine, or anything a check found. A file
 * that is refused says one calm sentence and offers a way to remove it; what
 * was actually found is in the security log for the admin (/admin/security).
 *
 * Pure and dependency free apart from React's own useState and useEffect, so
 * every uploader can use it: the product editor's list
 * (app/app/products/new/file-uploads.tsx), the product edit page's uploader
 * (components/app/file-upload.tsx), and anything added later.
 */
import { useEffect, useState } from "react"

import type { UploadStatus } from "./chunked-upload"

/**
 * How long a step has to last before it is worth a word. Under this, an
 * upload that has finished sending simply becomes the file.
 */
export const CHECKING_DELAY_MS = 300

/** What a row says while the server has the file and is checking it. */
export const CHECKING_LABEL = "Checking file…"

/** The one sentence a file the checks refused says. */
export const REFUSED_FILE = "We couldn't accept this file. Try another file."

/**
 * True once `active` has been true for `delayMs` without a break. Used for
 * any state that is usually over in a blink: it shows nothing at all for a
 * quick one, and does not flicker on a slow one.
 */
export function useDelayed(active: boolean, delayMs = CHECKING_DELAY_MS): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!active) {
      setShown(false)
      return
    }
    const timer = setTimeout(() => setShown(true), delayMs)
    return () => clearTimeout(timer)
  }, [active, delayMs])
  return shown
}

/**
 * The delayed "Checking file…" state for one upload, from its status alone.
 * `useUploadChecking(status)` is true only while the server has the file AND
 * that has taken longer than a blink.
 */
export function useUploadChecking(status: UploadStatus | undefined): boolean {
  return useDelayed(status === "completing")
}

/**
 * The state a row is in, for a `data-state` attribute and for the tests and
 * probes that read one. "checking" only appears once the delay has passed,
 * which is what makes the two uploaders behave the same.
 */
export function uploadRowState(status: UploadStatus | undefined, checking: boolean): string {
  if (status === "completing") return checking ? "checking" : "uploading"
  return status ?? "idle"
}

/**
 * The plain line for a state, with no numbers. Callers that have byte counts
 * add them; callers that do not use this on its own.
 */
export function uploadStatusLabel(status: UploadStatus | undefined, checking: boolean): string {
  switch (status) {
    case "complete":
      return "Ready"
    case "paused":
      return "Paused"
    case "error":
      return "Not uploaded"
    case "aborted":
      return "Cancelled"
    case "completing":
      return checking ? CHECKING_LABEL : "Uploading…"
    default:
      return "Uploading…"
  }
}
