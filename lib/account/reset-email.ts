import { platformEmail } from "@/lib/emails/layout"
/**
 * ===========================================================================
 *  THE PASSWORD RESET EMAIL, FOR A STORELIB ACCOUNT
 * ===========================================================================
 * Sent by /api/auth/request-password-reset (signed out, "Forgot password")
 * and /api/auth/reset-password (Settings, signed in). Both used to write
 * their own copy inline: a blue button reading "Reset Password", not the
 * Storelib layout every other account email uses (./code-email.ts), and sent
 * as an ordinary email, which put the link through click tracking and let a
 * stale bounce on the address drop it silently. It is a link somebody just
 * asked for, so the routes send it transactional.
 *
 * The link is the bridge code page (https://storelib.com/reset-password
 * ?code=…): a query string survives every mail client, and the app claims
 * that address as a universal link.
 *
 * Pure: tests/physical-w7.test.ts reads exactly what is sent.
 */

export function resetPasswordEmail(input: { resetUrl: string; minutes?: number }): { subject: string; html: string; text: string } {
  const minutes = input.minutes ?? 60
  const when = minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? "" : "s"}` : `${minutes} minutes`
  return platformEmail({
    subject: "Reset your Storelib password",
    heading: "Reset your password",
    paragraphs: ["Someone asked to reset the password for your Storelib account. Press the button to choose a new one."],
    action: { label: "Choose a new password", url: input.resetUrl },
    note: `The link works once, for ${when}. If you didn't ask for this, ignore this email. Your password stays the same.`,
  })
}

/**
 * A reset asked for an account that signs in with Google and has no
 * password. The page answers every address the same way (so it never says
 * which ones have an account), and this email is how the owner learns what
 * to do instead.
 */
export function googleSignInEmail(input: { loginUrl: string; provider?: "Google" | "Apple" }): { subject: string; html: string; text: string } {
  const provider = input.provider ?? "Google"
  return platformEmail({
    subject: `You sign in to Storelib with ${provider}`,
    heading: `Sign in with ${provider}`,
    paragraphs: [`Someone asked to reset the password for your Storelib account. Your account has no password: you sign in with ${provider}. Press the button and choose Continue with ${provider}.`],
    action: { label: "Go to sign in", url: input.loginUrl },
    fallback: false,
    note: "Want a password as well? Sign in, then add one in Settings. If you didn't ask for this, ignore this email.",
  })
}
