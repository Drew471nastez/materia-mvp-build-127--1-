export async function adminPaymentsRead<T>(url: string): Promise<T | { error: string }> {
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (res.status === 401) {
      window.location.reload()
      return { error: "Signed out." }
    }
    const body = await res.json().catch(() => null)
    if (!res.ok) return { error: (body && typeof body.error === "string" && body.error) || "Could not read." }
    return body as T
  } catch {
    return { error: "Could not reach Storelib." }
  }
}
