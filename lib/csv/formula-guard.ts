/**
 * A CELL A SPREADSHEET WOULD RUN.
 *
 * Excel, Numbers and Google Sheets run a cell that starts with = + - or @ as
 * a formula, so a buyer named "=HYPERLINK(...)" could put a link or a
 * command into a creator's export. The exports checked the first character
 * only, and a spreadsheet looks past what comes before it: " =1+1", a tab, a
 * return or a line break first, a no-break or full width space, and the full
 * width = + - @ (U+FF1D, U+FF0B, U+FF0D, U+FF20) that some of them read the same way.
 *
 * Such a cell is written with a ' first, which makes it text.
 */
const FORMULA_START = /^[\s\u00a0\u2000-\u200b\u2028\u2029\u202f\u205f\u3000\ufeff]*[=+\-@\uff1d\uff0b\uff0d\uff20]|^[\t\r\n]/

/** Whether a spreadsheet would read this cell as a formula. */
export function startsLikeFormula(value: string): boolean {
  return FORMULA_START.test(value)
}

/** The cell made plain text when a spreadsheet would run it; anything else as it is. */
export function guardFormula(value: string): string {
  return startsLikeFormula(value) ? `'${value}` : value
}
