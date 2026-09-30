/** IBAN check (ISO 13616). Spaces are ignored. The number is never logged by callers. */
export function normalizeIban(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase()
}

export function isValidIban(input: string): boolean {
  const iban = normalizeIban(input)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let rest = 0
  for (const ch of rearranged) {
    const chunk = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch
    for (const digit of chunk) rest = (rest * 10 + Number(digit)) % 97
  }
  return rest === 1
}
