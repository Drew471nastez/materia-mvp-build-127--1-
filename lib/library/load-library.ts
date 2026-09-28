import "server-only"

import { getLibraryDownloads } from "./get-library-downloads"
import { getLibraryExtras } from "./library-extras"
import { assembleLibrary, type LibraryData } from "./library-view"

/**
 * The whole library for one buyer, for the screens that need all of it
 * (Reviews, Receipts). The two reads run side by side, as on /library.
 */
export async function loadLibrary(userId: string): Promise<LibraryData> {
  const [downloads, extras] = await Promise.all([getLibraryDownloads(userId), getLibraryExtras(userId)])
  return assembleLibrary(downloads, extras)
}
