/**
 * ===========================================================================
 *  ONE FIELD LOOK FOR THE FORMS SURFACES (round AN)
 * ===========================================================================
 * The action editor, the form picker and the form builder are drawn inside
 * a OnePage block, inside the builder dialog and on /app/emails/forms. They
 * share the OnePage editor's field (components/onepage/block-fields.css and
 * editor-kit fieldInput): 44px, 12px corners, a hairline that turns ink when
 * in use, 16px type on a phone so iOS does not zoom, 14px from 640px. The
 * ChoicePicker field (components/ui/choice-list) is the same box, so a text
 * field and a list sit together without a seam.
 *
 * A label is 13px ink with 8px under it; help and problems are 13px under
 * their field. Nothing here is a colour of its own: /app's ink and greys.
 */

export const FIELD =
  "h-11 w-full min-w-0 rounded-xl border border-[#e3e4e8] bg-white px-3.5 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#1a1a2e] focus:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] disabled:cursor-not-allowed disabled:bg-[#f9fafb] sm:text-[14px]"

/** A text area in the same box; it grows with what is typed where the browser can (field-sizing), between three and ten lines. */
export const AREA =
  "block min-h-[104px] max-h-[240px] w-full min-w-0 resize-none rounded-xl border border-[#e3e4e8] bg-white px-3.5 py-2.5 text-[16px] leading-[1.45] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 [field-sizing:content] placeholder:text-[#9ca3af] focus:border-[#1a1a2e] focus:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] sm:text-[14px]"

export const LABEL = "block text-[13px] font-medium leading-[18px] text-[#1a1a2e]"

/** A label over its field, 8px apart. */
export const FIELD_STACK = "block space-y-2"

export const HINT = "text-[13px] leading-[18px] text-[#6b7280]"
export const PROBLEM = "text-[13px] font-medium leading-[18px] text-[#b54708]"
export const ERROR = "text-[13px] leading-[18px] text-[#b42318]"

/** A ChoicePicker field the size of FIELD (the picker's own is the same box; this only keeps the type the same). */
export const PICKER_FIELD = "text-[14px]"

/** A quiet small button: New form, Edit questions. */
export const SMALL_BUTTON =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e3e4e8] bg-white px-3 text-[13px] font-medium text-[#1a1a2e] outline-none transition-colors duration-100 hover:bg-[#f7f7f8] active:bg-[#f1f2f4] focus-visible:border-[#1a1a2e] focus-visible:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] disabled:cursor-not-allowed disabled:opacity-50"

/** Thin, quiet scrollbars for a scroller of our own (the builder): a hairline thumb, no track. */
export const THIN_SCROLL = "[scrollbar-width:thin] [scrollbar-color:rgba(26,26,46,0.18)_transparent]"
