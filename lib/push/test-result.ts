/**
 * ===========================================================================
 *  SETTINGS, SEND A TEST NOTIFICATION: WHAT HAPPENED, IN ONE LINE
 * ===========================================================================
 * The owner taps the button on their phone and reads exactly why a sale
 * would or would not reach it: nothing registered, the server has no
 * Firebase key, sent to N, or Firebase's own error. Free of server
 * dependencies so tests/push-test-notification.test.ts holds it.
 */
import type { PushResult } from "./sender"

export type TestOutcome = "sent" | "partly" | "no_devices" | "not_configured" | "failed"

export interface TestAnswer {
  outcome: TestOutcome
  message: string
  result: PushResult
}

function devices(n: number): string {
  return n === 1 ? "1 device" : `${n} devices`
}

export function testAnswer(result: PushResult): TestAnswer {
  if (result.error) return { outcome: "failed", message: `Could not read your devices: ${result.error}`, result }
  if (result.devices === 0) return { outcome: "no_devices", message: "No devices are registered for notifications on this account yet.", result }
  const firstError = result.failures[0]?.error
  if (result.sent === 0 && result.phonesSkipped > 0 && result.failures.length === 0) {
    return { outcome: "not_configured", message: "Phone notifications are not set up on the server: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY are missing or refused.", result }
  }
  if (result.sent === 0) {
    const removed = result.removed ? ` ${result.removed === 1 ? "That token was" : `${result.removed} tokens were`} out of date and removed; open the app again to register.` : ""
    return { outcome: "failed", message: `Not sent. ${firstError ?? "The provider refused it."}${removed}`, result }
  }
  const missed = result.failures.length + result.phonesSkipped
  if (missed > 0) {
    const why = firstError ?? "phone notifications are not set up on the server"
    return { outcome: "partly", message: `Sent to ${devices(result.sent)}. ${devices(missed)} missed it: ${why}`, result }
  }
  return { outcome: "sent", message: `Sent to ${devices(result.sent)}. It should arrive in a few seconds.`, result }
}
