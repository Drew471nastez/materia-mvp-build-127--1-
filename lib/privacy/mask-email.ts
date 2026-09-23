/**
 * An address as a log line may carry it: "ja***@gmail.com".
 *
 * Every send used to log the full recipient. Server logs are read by more
 * people, kept longer and copied to more places than the subscriber table,
 * and a list of who a creator emails is that creator's customer list. The
 * first two letters and the domain are enough to follow a delivery problem.
 */
export function maskEmail(email: unknown): string {
  if (typeof email !== "string") return "(none)"
  const at = email.lastIndexOf("@")
  if (at < 1) return "(invalid)"
  const local = email.slice(0, at)
  return `${local.slice(0, Math.min(2, local.length))}***${email.slice(at)}`
}
