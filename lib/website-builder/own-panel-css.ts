/**
 * What the page's stylesheet gives a cart, search window or menu drawer of
 * the site's own (components/website-builder/sections/own-panel-layer.ts
 * tells the whole story; this half is CSS so it is right in the first paint,
 * before any script). Pure, server safe.
 */

/** On a panel from the moment it opens until its closing motion has ended. Without it the panel is not drawn. */
export const PANEL_SHOWN = "data-storelib-shown"
/** On an ancestor that would hold a fixed panel, while that panel is open. */
export const PANEL_UNTRAP = "data-storelib-untrap"

/**
 * The part of the page's stylesheet a panel needs (theme-css.ts adds it to
 * every site). `panels` is the selector list of the three panel hooks.
 */
export function ownPanelCss(root: string, panels: readonly string[]): string {
  /* Each selector written out under the root (no :is() list): every rule of the page's stylesheet starts at the page root, and the tests that hold it to that read a selector comma by comma. */
  const each = (suffix: string) => panels.map((p) => `${root} ${p}${suffix}`).join(",")
  return [
    `${each(`:not([${PANEL_SHOWN}])`)}{display:none!important;}`,
    /* In the top layer the browser's own popover look is taken off again, so the panel is drawn by its section's CSS alone. */
    `:where(${each("[popover]")}){inset:auto;margin:0;border:0;padding:0;width:auto;height:auto;overflow:visible;color:inherit;background-color:transparent;}`,
    `:where(${each("")}){overscroll-behavior:contain;}`,
    `${each("[popover]::backdrop")}{display:none;}`,
    `${root}[${PANEL_UNTRAP}],${root} [${PANEL_UNTRAP}]{transform:none!important;translate:none!important;rotate:none!important;scale:none!important;perspective:none!important;filter:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;contain:none!important;content-visibility:visible!important;will-change:auto!important;transition:none!important;}`,
  ].join("\n")
}
