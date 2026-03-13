import { cookies } from "next/headers"

// Session token value — update this string to invalidate all existing sessions
const SESSION_TOKEN = "slblog_4f8e2a1b9c3d7e6f0a5b2c8d4e1f9a3b_v1"

export async function isAdminAuthenticated(): Promise<boolean> {
  try {
    const cookieStore = await cookies()
    return cookieStore.get("blog_admin")?.value === SESSION_TOKEN
  } catch {
    return false
  }
}

export function getSessionToken(): string {
  return SESSION_TOKEN
}
