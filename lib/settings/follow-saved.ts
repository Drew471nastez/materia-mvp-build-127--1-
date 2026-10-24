/**
 * A form drawn from a read that a newer read replaced. Settings draws a
 * section from the answer it fetched when Settings opened (components/
 * physical/ui peekGet), and the newer answer arrives after the form has
 * taken its first values. Each field still showing what was saved takes the
 * newer saved value; a field the person has typed in is left as they typed.
 */
export function followSaved<T extends Record<string, string>>(before: T, after: T, current: T): T {
  const out = { ...current }
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (current[key] === before[key]) out[key] = after[key]
  }
  return out
}
