/**
 * The hub's code face, named once.
 *
 * `font-mono` points at Geist Mono, which the site never loads, so code fell
 * back to whatever the browser's default monospace happened to be: Courier
 * on one machine, DejaVu on another, each with its own width. These are the
 * faces every system already has, the same stack GitHub and the browsers'
 * own devtools use, so a code sample is set the same way wherever it is read
 * and costs no download.
 */
export const MONO = "font-[family-name:ui-monospace,SFMono-Regular,Menlo,Consolas,Liberation_Mono,monospace]"
