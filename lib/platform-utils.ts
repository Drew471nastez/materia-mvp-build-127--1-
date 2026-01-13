/**
 * Helper to determine if platform header should be shown based on searchParams
 * Only checks the query parameter, no sessionStorage or referrer logic
 */
export function getShowPlatformHeader(searchParams: Record<string, string | string[] | undefined>): boolean {
  const src = searchParams.src
  return src === "platform"
}
