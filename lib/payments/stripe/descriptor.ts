import "server-only"

import { stripe } from "@/lib/stripe"
import { statementDescriptorSuffix } from "@/lib/payments/platform-descriptor"

/**
 * THE NAME ON THE SELLER'S OWN STRIPE ACCOUNT. What a statement shows for a
 * charge made on the seller's behalf (lib/payments/platform-descriptor
 * SELLER_ONLY_STATEMENT) is their account's descriptor, so the name chosen
 * in Settings is written there too: the full descriptor (5 to 22, with a
 * letter, as Stripe asks) and the card prefix (2 to 10). Best effort: an
 * account Stripe will not let the platform change keeps what it has, and
 * the reason is logged, never shown.
 */
export async function pushStatementName(account: string | null | undefined, raw: string | null | undefined): Promise<boolean> {
  if (!account || !account.startsWith("acct_")) return false
  const name = statementDescriptorSuffix(raw)
  if (!/[A-Z]/.test(name)) return false
  const full = (name.length >= 5 ? name : `${name} STORE`).slice(0, 22).trim()
  const prefix = name.slice(0, 10).trim()
  try {
    await stripe.accounts.update(account, {
      settings: {
        payments: { statement_descriptor: full },
        ...(prefix.length >= 2 ? { card_payments: { statement_descriptor_prefix: prefix } } : {}),
      },
    })
    return true
  } catch (error) {
    console.error("[stripe descriptor] not changed", (error as { code?: string; param?: string })?.code ?? "", (error as { param?: string })?.param ?? "")
    return false
  }
}
