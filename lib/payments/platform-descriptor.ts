export const PLATFORM_STATEMENT_DESCRIPTOR = "STORELIB" as const

export function getValidatedPlatformStatementDescriptor(): string {
  const descriptor = PLATFORM_STATEMENT_DESCRIPTOR.trim().toUpperCase()
  if (!descriptor) throw new Error("Platform statement descriptor is empty")
  if (descriptor.length > 11) {
    throw new Error(`Platform statement descriptor exceeds 11 chars: ${descriptor.length}`)
  }
  return descriptor
}

/*
 * ===========================================================================
 *  WHOSE NAME THE BANK APP SHOWS
 * ===========================================================================
 * A Storelib sale is a destination charge: Storelib's Stripe account takes
 * the card and moves the seller's share to them. For such a charge a card
 * statement reads "<the charging account's prefix>* <suffix>", so it said
 * "STORELIB* NAME", and no suffix can remove the STORELIB part.
 *
 * SELLER ONLY. With NEXT_PUBLIC_SELLER_STATEMENT_NAME=1 a sale is made
 * `on_behalf_of` the seller's account whenever that account can take cards
 * itself (charges_enabled): the seller is then the settlement merchant, and
 * the statement reads the seller's own descriptor, which Storelib keeps set
 * to the name chosen in Settings (lib/payments/stripe/descriptor.ts). An
 * account that only receives transfers (a seller in another country than
 * the platform) cannot be charged on behalf of, and keeps STORELIB* NAME.
 *
 * It is a switch and not the default because it changes who the card
 * networks see as the merchant: Stripe's fee for the charge is the seller's
 * country's, and a dispute is filed against the seller's account (Storelib
 * still covers it, the accounts are created with losses.payments set to the
 * application). Turn it on in Vercel once that is agreed.
 */
export const SELLER_ONLY_STATEMENT = process.env.NEXT_PUBLIC_SELLER_STATEMENT_NAME === "1"

/** Room left for the seller after "STORELIB* " so the whole line stays within 22. */
export const STATEMENT_SUFFIX_MAX = 22 - PLATFORM_STATEMENT_DESCRIPTOR.length - 2

/** How long the seller's part may be: the whole line when it is theirs alone, the room after STORELIB* otherwise. */
export const STATEMENT_NAME_MAX = SELLER_ONLY_STATEMENT ? 22 : STATEMENT_SUFFIX_MAX

/** The seller's part of the bank line. Empty when there is nothing usable. */
export function statementDescriptorSuffix(raw: string | null | undefined, max: number = STATEMENT_NAME_MAX): string {
  const clean = (raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  return fitWords(clean, max)
}

/** Cut to `max`, on a whole word when one fits ("OFFGRID SOUNDS" in 12 is "OFFGRID", not "OFFGRID SOUN"). */
function fitWords(s: string, max: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  if (s[max] === " ") return cut.trim()
  const space = cut.lastIndexOf(" ")
  return (space >= 2 ? cut.slice(0, space) : cut).trim()
}

/** What a bank app shows: NAME on its own when the seller is the merchant, STORELIB* NAME otherwise. */
export function bankStatementLine(raw: string | null | undefined): string {
  const suffix = statementDescriptorSuffix(raw)
  if (SELLER_ONLY_STATEMENT) return suffix || PLATFORM_STATEMENT_DESCRIPTOR
  return suffix ? `${PLATFORM_STATEMENT_DESCRIPTOR}* ${suffix}` : PLATFORM_STATEMENT_DESCRIPTOR
}

/**
 * What a charge for this seller carries for the statement: `on_behalf_of`
 * the seller when the line is theirs alone and their account can take
 * cards, the seller's suffix after STORELIB* otherwise. Card suffixes are
 * capped by Stripe at the room after the prefix, so the suffix is cut to it.
 */
export function statementParams(seller: {
  account: string
  descriptor: string | null | undefined
  chargesEnabled: boolean | null | undefined
  /**
   * The seller's account is outside Stripe's cross-border region (round 25,
   * lib/payments/stripe/payout-regions settlement): Stripe moves the money
   * there only when the sale is made on its behalf, so it always is.
   */
  settles?: boolean
}): { on_behalf_of?: string; statement_descriptor_suffix?: string } {
  if (seller.settles && seller.account.startsWith("acct_")) return { on_behalf_of: seller.account }
  if (SELLER_ONLY_STATEMENT && seller.chargesEnabled && seller.account.startsWith("acct_")) {
    return { on_behalf_of: seller.account }
  }
  const suffix = statementDescriptorSuffix(seller.descriptor, STATEMENT_SUFFIX_MAX)
  return suffix.length >= 2 ? { statement_descriptor_suffix: suffix } : {}
}
