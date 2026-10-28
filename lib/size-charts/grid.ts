/**
 * ===========================================================================
 *  A SIZE CHART'S TABLE, AS IT IS TYPED
 * ===========================================================================
 * The pure parts of the table editor (components/physical/size-chart-form):
 * a block pasted from a spreadsheet, and which cell a key moves to. No React,
 * so tests/size-charts-subpage.test.ts runs them as they are.
 */
import { SIZE_CHART_LIMITS } from "./model"

/**
 * Cells copied from a spreadsheet, Numbers or a web page's table: rows on
 * lines, cells split by tabs. A single value with no tab and no line break
 * is not a block, so it is typed into the cell as usual (null).
 */
export function readPastedBlock(text: string): string[][] | null {
  const clean = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "")
  if (!clean.includes("\t") && !clean.includes("\n")) return null
  return clean.split("\n").map((line) => line.split("\t").map((cell) => cell.trim().slice(0, SIZE_CHART_LIMITS.cell)))
}

/**
 * The rows with a pasted block laid in from (row, col): cells past the last
 * column are left out (columns are named, so a paste never invents one),
 * rows past the last are added up to the chart's limit. Returns the new rows
 * and how many cells did not fit, so the editor can say so.
 */
export function pasteIntoRows(rows: string[][], columnCount: number, at: { row: number; col: number }, block: string[][]): { rows: string[][]; dropped: number } {
  const out = rows.map((r) => Array.from({ length: columnCount }, (_, i) => r[i] ?? ""))
  let dropped = 0
  block.forEach((line, i) => {
    const r = at.row + i
    if (r >= SIZE_CHART_LIMITS.rows) {
      dropped += line.length
      return
    }
    while (out.length <= r) out.push(Array.from({ length: columnCount }, () => ""))
    line.forEach((cell, j) => {
      const c = at.col + j
      if (c >= columnCount) dropped++
      else out[r][c] = cell
    })
  })
  return { rows: out, dropped }
}

export type GridKey = "Enter" | "ShiftEnter" | "ArrowUp" | "ArrowDown"

/**
 * Where a key in a cell goes: Enter and the down arrow to the same column
 * one row down (Enter on the last row asks for a new one), Shift and Enter
 * and the up arrow one row up. The left and right arrows stay inside the
 * text, as they do in any field.
 */
export function nextCell(at: { row: number; col: number }, key: GridKey, rowCount: number): { row: number; col: number; addRow?: boolean } | null {
  if (key === "ArrowUp" || key === "ShiftEnter") return at.row > 0 ? { row: at.row - 1, col: at.col } : null
  if (at.row < rowCount - 1) return { row: at.row + 1, col: at.col }
  if (key === "Enter" && rowCount < SIZE_CHART_LIMITS.rows) return { row: at.row + 1, col: at.col, addRow: true }
  return null
}

/** A row moved one place up or down; the same rows when it cannot move. */
export function moveRow<T>(rows: T[], index: number, by: -1 | 1): T[] {
  const to = index + by
  if (index < 0 || index >= rows.length || to < 0 || to >= rows.length) return rows
  const next = [...rows]
  const [row] = next.splice(index, 1)
  next.splice(to, 0, row)
  return next
}
