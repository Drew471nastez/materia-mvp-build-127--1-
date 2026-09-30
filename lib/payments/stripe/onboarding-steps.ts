/**
 * What the creator sees while setting up payments.
 * Country changes which Stripe step comes next. It does not add a company
 * form for an individual, and it does not pick a payout currency.
 */

export type SetupKind = "individual" | "business"
export type OnboardingBeat = "personal" | "verification" | "bank" | "review" | "done"

export function personalFields(kind: SetupKind): Array<"businessName" | "firstName" | "lastName"> {
  if (kind === "business") return ["businessName", "firstName", "lastName"]
  return ["firstName", "lastName"]
}

const NAME = /^[\p{L}][\p{L}\s'.-]{0,79}$/u

export function personalIssues(input: {
  kind: string
  country: string
  firstName: string
  lastName: string
  businessName?: string
}): Partial<Record<"country" | "firstName" | "lastName" | "businessName", string>> {
  const issues: Partial<Record<"country" | "firstName" | "lastName" | "businessName", string>> = {}
  const country = input.country.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(country)) issues.country = "Choose your country."
  if (!NAME.test(input.firstName.trim())) issues.firstName = "Enter your first name."
  if (!NAME.test(input.lastName.trim())) issues.lastName = "Enter your last name."
  if (input.kind === "business" && (input.businessName ?? "").trim().length < 2) issues.businessName = "Enter the business name."
  return issues
}

export function parsePersonal(input: {
  kind: string
  country: string
  firstName: string
  lastName: string
  businessName?: string
}): { ok: true; value: { kind: SetupKind; country: string; firstName: string; lastName: string; businessName: string | null } } | { ok: false; error: string } {
  const issues = personalIssues(input)
  const error = issues.country || issues.firstName || issues.lastName || issues.businessName
  if (error) return { ok: false, error }
  const kind: SetupKind = input.kind === "business" ? "business" : "individual"
  return {
    ok: true,
    value: {
      kind,
      country: input.country.trim().toUpperCase(),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      businessName: kind === "business" ? (input.businessName ?? "").trim() : null,
    },
  }
}
