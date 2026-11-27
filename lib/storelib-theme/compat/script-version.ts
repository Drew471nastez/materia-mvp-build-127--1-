/**
 * ===========================================================================
 *  A THEME SCRIPT'S VERSION WITHOUT ITS TEXT (round 68)
 * ===========================================================================
 * The editor's canvas loads an imported theme's scripts by address
 * (/api/site-theme/assets/...), and reads their text for one thing only: the
 * `?v=` its address carries, so a changed script is a changed address
 * (compat-canvas.tsx, THEME CODE THAT CHANGED). On Materia that was 3.9 MB of
 * the 6.8 MB the editor read before its canvas could draw.
 *
 * So the editor's read of the theme's files (files?compat=1&scripts=versions)
 * hands each plain .js file's version instead of its text, worked out here,
 * by the same function the canvas uses on a text it holds: the address is the
 * same either way, and the browser's copy of the script is still good.
 */

/** A plain script among an install's files: its text is not needed in the editor, only its version. */
export const PLAIN_SCRIPT = /^shopify\/assets\/([^/]+\.js)$/

/** The `?v=` of a theme file's address in the editor's canvas: a hash of its text and its length. */
export function textVersion(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return `${(h >>> 0).toString(36)}${text.length.toString(36)}`
}
