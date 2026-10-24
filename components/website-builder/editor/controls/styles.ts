/**
 * The sidebar's own classes, copied from the controls already in it
 * (FieldEditor in the editor page, field-popover.tsx), so a new control is
 * indistinguishable from its neighbours. On a phone the editor's sheet
 * raises every field to 44px and 16px type (app/globals.css); the buttons
 * here carry their own phone size because the sheet's rule is for fields.
 */

/** A one-line field, as the text and number settings draw one. */
export const INPUT =
  "w-full h-8 px-2.5 text-[13px] border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-colors"

/** A select, drawn the way the sidebar's other selects are. */
export const SELECT =
  "w-full h-8 px-2.5 pr-8 text-[13px] border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 appearance-none cursor-pointer transition-colors"

/* A segmented choice is its own control now, with a pill that slides: choice-control.tsx. */

/** A small square action beside a row: up, down, remove. 44px under a thumb. */
export const ICON_BUTTON =
  "inline-flex h-6 w-6 max-sm:h-11 max-sm:w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"

/** The dashed "Add …" button the block lists use. */
export const ADD_BUTTON =
  "w-full flex items-center justify-center gap-1.5 py-2 max-sm:min-h-11 text-[13px] text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-neutral-400 rounded-lg transition-colors"

/** A quiet text action under a field. */
export const TEXT_BUTTON =
  "inline-flex h-7 max-sm:h-10 items-center rounded-md px-1.5 text-[12px] max-sm:text-[14px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/60"

/** The line of help under a field. */
export const NOTE = "text-[11px] max-sm:text-[13px] leading-relaxed text-muted-foreground"

/** A line that says something is wrong. The sidebar's red, not an alarm. */
export const PROBLEM = "text-[11px] max-sm:text-[13px] leading-relaxed text-[#b91c1c]"
