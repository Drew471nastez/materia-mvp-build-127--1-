export class PaymentsProblem extends Error {
  readonly userMessage: string
  readonly status: number
  /**
   * What kind of problem, for the page's next step (lib/payments/stripe/setup-errors
   * SetupProblemCode): "country_unsupported" offers another country, "retry"
   * offers Try again, anything that a retry cannot change offers support.
   */
  readonly code: string | null
  constructor(userMessage: string, status = 400, code: string | null = null) {
    super(userMessage)
    this.userMessage = userMessage
    this.status = status
    this.code = code
  }
}
