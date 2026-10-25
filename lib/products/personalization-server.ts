/**
 * PERSONALIZATION ON THE SERVER: every checkout's start and an imported
 * theme's /cart/add hold each line to its product's fields
 * (lib/products/personalization.ts). The fields are read with the service
 * role (./personalization-read); the answers are checked here. A photo's
 * answer is a cart upload's value, and whose it is (this browser's, this
 * store's) is checked by lib/cart-uploads/store checkLineFiles before this.
 */
import "server-only"

import { checkAnswers, type AnswerProblem, type PersonalizationField } from "./personalization"

export { personalizationOf } from "./personalization-read"

export interface LineToCheck {
  productId: string
  title: string
  properties?: Record<string, string> | null
}

/**
 * Each line held to its product's fields, as a checkout's start holds them:
 * the cleaned properties for every line (in the order given), or the first
 * problem in words naming the item ("Mug: Fill in Name to engrave").
 */
export function checkLines(
  lines: LineToCheck[],
  fieldsOf: Map<string, PersonalizationField[]>,
): { ok: true; properties: (Record<string, string> | undefined)[] } | { ok: false; error: string; problem: AnswerProblem; productId: string } {
  const out: (Record<string, string> | undefined)[] = []
  for (const l of lines) {
    const fields = fieldsOf.get(l.productId) ?? []
    if (!fields.length) {
      out.push(l.properties && Object.keys(l.properties).length ? l.properties : undefined)
      continue
    }
    const checked = checkAnswers(fields, l.properties)
    if (checked.ok === false) return { ok: false, error: `${l.title}: ${checked.problem.message}`, problem: checked.problem, productId: l.productId }
    out.push(Object.keys(checked.properties).length ? checked.properties : undefined)
  }
  return { ok: true, properties: out }
}
