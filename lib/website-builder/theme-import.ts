/**
 * ===========================================================================
 *  A THEME PACKAGE ON ITS WAY IN
 * ===========================================================================
 * The rules an import is held to, written once for the page that sends the
 * file and the routes that take it.
 *
 * THE FILE DOES NOT GO THROUGH A FUNCTION. A serverless function refuses a
 * request body over 4.5 MB before any of our code runs, so an import posted
 * as a form failed for every package with real photographs in it, with a
 * platform error page rather than a reason, while the route said it took 50
 * MB. So the page asks for a place first (import/upload), puts the file
 * straight into storage with its own progress, and then asks the import
 * route to read it from there. The route checks the path is this person's
 * own, reads the size from storage before it downloads anything, and the
 * first bytes before it unzips anything, and removes the file when it is
 * done with it, whatever happened.
 *
 * Nothing here is server only, so the page can check a file's size before
 * it starts an upload that would be refused at the end.
 */

/** The biggest package an import takes. */
export const IMPORT_MAX_BYTES = 50 * 1024 * 1024

/** "50 MB", for the sentence that says so. */
export const IMPORT_MAX_LABEL = `${IMPORT_MAX_BYTES / (1024 * 1024)} MB`

export const IMPORT_TOO_LARGE = `That file is over ${IMPORT_MAX_LABEL}.`

export const IMPORT_NOT_A_PACKAGE = "That file is not a Storelib theme."

/** The private bucket a package waits in between the upload and the import. */
export const IMPORT_BUCKET = "digital-products"

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

/** Where one upload goes: under the person's own id, with a name nobody chose. */
export function importPathFor(userId: string, uploadId: string): string {
  return `${userId}/theme-imports/${uploadId}.zip`
}

/**
 * A path the import route may read and delete: one this person was handed,
 * and nothing else. Anything the page sends is checked against the signed in
 * user's own id, so no request can name another account's file, or a folder,
 * or climb out of this one.
 */
export function isOwnImportPath(path: unknown, userId: string): path is string {
  if (typeof path !== "string" || !new RegExp(`^${UUID}$`, "i").test(userId)) return false
  return new RegExp(`^${userId}/theme-imports/${UUID}\\.zip$`, "i").test(path)
}

/** Why a file cannot be imported, before a byte of it is sent, or null. */
export function importSizeProblem(size: unknown): string | null {
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return IMPORT_NOT_A_PACKAGE
  if (size > IMPORT_MAX_BYTES) return IMPORT_TOO_LARGE
  return null
}

/**
 * A zip begins with a local file header, "PK" 3 4. Read before the whole
 * file is handed to the unzipper, so a picture or a PDF renamed to .zip is
 * refused in one comparison rather than after a parse.
 */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}
