/**
 * ===========================================================================
 *  A SIZE TABLE TYPED AS TEXT: A ROW PER LINE, CELLS SPLIT BY |
 * ===========================================================================
 * The Size guide section's own table (`table_data`), for a page about no
 * product or a product without a chart (round 13: before it, the section's
 * rows were written into its code). The first line names the columns; each
 * line after it is a size:
 *
 *   Size | Chest | Waist
 *   S    | 86-91 | 71-76
 *   M    | 91-97 | 76-81
 *
 * A column after the first is a measurement (converted between cm and in)
 * when every filled cell in it is numbers ("86", "86-91", "86,5"); a column
 * of words ("EU", "Fits") is a label. The same SizeChart shape as a chart
 * from Products › Size charts, so it draws and converts the same way.
 *
 * Pure and safe in the browser.
 */
import { readSizeChart, type SizeChart, type SizeUnit } from "./model"

/** The section's table before a creator changes it: the five sizes it always showed, in cm. */
export const SIZE_GUIDE_TABLE = ["Size | Chest | Waist | Hips", "XS | 81-86 | 61-66 | 86-91", "S | 86-91 | 66-71 | 91-96", "M | 91-97 | 71-76 | 96-102", "L | 97-104 | 76-84 | 102-109", "XL | 104-112 | 84-94 | 109-119"].join("\n")

const NUMBERS = /^[\s\d.,\-–—/x×~+]*\d[\s\d.,\-–—/x×~+]*$/

/** The table as a chart, or null when it has no column names or no size. */
export function sizeChartFromTable(text: string, unit: SizeUnit = "cm", name = "Size guide"): SizeChart | null {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length < 2) return null
  const cells = (l: string) => l.split("|").map((c) => c.trim())
  const head = cells(lines[0])
  const body = lines.slice(1).map((l) => {
    const row = cells(l)
    return head.map((_, i) => row[i] ?? "")
  })
  const columns = head.map((h, i) => ({
    name: h || (i === 0 ? "Size" : `Column ${i + 1}`),
    measure: i > 0 && body.some((r) => r[i]) && body.every((r) => !r[i] || NUMBERS.test(r[i])),
  }))
  return readSizeChart({ name, unit, columns, rows: body, notes: "", imageUrl: null })
}
