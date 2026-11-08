/**
 * Where a variable chip goes into a message (components/forms/action-editor,
 * round AN): at the caret, in place of what is selected, with a space before
 * it when it would touch the word before, and after it when a word follows.
 * Pure, so tests/forms-an2.test.ts reads it.
 */
export function insertAtCaret(before: string, token: string, at: number, end: number, max = 4000): { text: string; caret: number } {
  const a = Math.max(0, Math.min(at, before.length))
  const b = Math.max(a, Math.min(end, before.length))
  const lead = a > 0 && !/\s/.test(before[a - 1]) ? " " : ""
  const tail = b < before.length && !/[\s.,!?;:)]/.test(before[b]) ? " " : ""
  const text = (before.slice(0, a) + lead + token + tail + before.slice(b)).slice(0, max)
  return { text, caret: Math.min(text.length, a + lead.length + token.length) }
}
