/**
 * Round 41: the folder a team member's OnePage pictures and videos go into,
 * the page owner's account (onepage-assets/<owner>/...), so they are the
 * store's and not the member's. null for the owner: their own folder. Set by
 * the editor (lib/onepage/team-context useTeamProductsStore); kept here, with
 * no React in it, so the upload code (lib/onepage/media-upload) reads it
 * without loading a context.
 */
let currentOwner: string | null = null

export function teamPageOwner(): string | null {
  return currentOwner
}

export function setTeamPageOwner(owner: string | null): void {
  currentOwner = owner
}
