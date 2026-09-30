export class PaymentsProblem extends Error {
  readonly userMessage: string
  readonly status: number
  constructor(userMessage: string, status = 400) {
    super(userMessage)
    this.userMessage = userMessage
    this.status = status
  }
}
