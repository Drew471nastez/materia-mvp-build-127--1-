/**
 * The Help Center at help.storelib.com asks storelib.com who is signed in
 * (the session cookie is storelib.com's own). Only that one origin may read
 * the answer, with credentials.
 */
export function helpOrigin(): string | null {
  const main = (process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com").trim().toLowerCase().replace(/^www\./, "")
  if (!main || main.startsWith("localhost") || main.includes(":")) return null
  return `https://help.${main}`
}

export function helpCors(request: Request): Record<string, string> {
  const origin = request.headers.get("origin")
  const allowed = helpOrigin()
  if (!origin || !allowed || origin !== allowed) return { Vary: "Origin" }
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  }
}
