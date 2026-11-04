import { NextResponse } from "next/server"
import { loadAccountSettingsForUser, type SettingsSectionKey } from "@/lib/account/load-account-settings"
import { readUserForRoute } from "@/lib/auth/route-user"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const SECTIONS = new Set<SettingsSectionKey>(["profile", "account", "privacy", "notifications", "preferences"])

export async function GET(request: Request) {
  const { data: { user } } = await readUserForRoute()
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401, headers: { "Cache-Control": "no-store" } })

  const sectionParam = new URL(request.url).searchParams.get("section")
  const section: SettingsSectionKey = SECTIONS.has(sectionParam as SettingsSectionKey) ? (sectionParam as SettingsSectionKey) : "profile"

  const payload = await loadAccountSettingsForUser(user, section)
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } })
}
