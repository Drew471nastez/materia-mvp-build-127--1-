/**
 * The /sell pages' screenshots of the real product editor, and their sizes in
 * CSS pixels (the files are 2x). Written by scripts/marketing-sell-shots.mjs;
 * run it again when the editor changes. The product in them is the demo preset
 * pack scripts/render-product-editor.tsx holds: made up, not a real store.
 */
export const SELL_SHOTS = {
  "editor-files": [764, 282],
  "editor-pricing": [764, 208],
  "editor-media": [764, 515]
} as const satisfies Record<string, readonly [number, number]>
