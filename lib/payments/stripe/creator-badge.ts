import type { PaymentUxState } from "./facts"

/** Creator-facing badge (four states only). */
export type StorelibPaymentsBadge = "setup" | "review" | "action" | "active"

export function badgeFromUxState(state: PaymentUxState): StorelibPaymentsBadge {
  switch (state) {
    case "PAYMENTS_ACTIVE":
      return "active"
    case "ACTION_REQUIRED":
    case "PAYMENTS_RESTRICTED":
    case "PAYOUTS_RESTRICTED":
      return "action"
    case "VERIFICATION_IN_PROGRESS":
      return "review"
    default:
      return "setup"
  }
}

export const BADGE_COPY: Record<
  StorelibPaymentsBadge,
  { label: string; tone: "gray" | "yellow" | "orange" | "green"; line: string; cta: string | null }
> = {
  setup: {
    label: "Setup required",
    tone: "gray",
    line: "Accept payments and receive payouts directly to your bank.",
    cta: "Set up payments",
  },
  review: {
    label: "Under review",
    tone: "yellow",
    line: "We are checking your details. We will email you when payments are ready.",
    cta: null,
  },
  action: {
    label: "Action required",
    tone: "orange",
    line: "We need some information to keep your payments and payouts active.",
    cta: "Resolve",
  },
  active: {
    label: "Active",
    tone: "green",
    line: "Your account is ready to accept payments.",
    cta: "Manage",
  },
}
