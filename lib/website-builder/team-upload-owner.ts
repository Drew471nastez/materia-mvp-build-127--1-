"use client"

/**
 * ===========================================================================
 *  WHOSE FOLDER THE BUILDER'S PICTURES GO IN (round 42)
 * ===========================================================================
 * A picture picked in the website builder goes into the signed in account's
 * folder of a public bucket. A team member with Website edits the store's
 * site, so their pictures go into the store owner's folder instead: the
 * install's read (/api/website-builder/themes/[installId]) names the owner
 * for a member (`storeOwner`, null for the owner), the editor sets it here,
 * and the image picker writes there through lib/team/upload-fallback, which
 * the server checks against the member's permissions (lib/team/uploads).
 */
let owner: string | null = null

export function setWebsiteUploadOwner(next: string | null): void {
  owner = typeof next === "string" && /^[0-9a-f-]{36}$/i.test(next) ? next : null
}

export function websiteUploadOwner(): string | null {
  return owner
}
