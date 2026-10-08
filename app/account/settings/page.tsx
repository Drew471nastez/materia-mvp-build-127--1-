import type { Metadata } from "next"
import { pageUser } from "@/lib/auth/page-user"
import { accountLoginPath } from "@/lib/account/account-tabs"
import { AccountSettings } from "@/components/account/account-settings"
import { RouterPullToRefresh } from "@/components/ui/pull-to-refresh"
import { loadAccountSettingsForUser, type SettingsSectionKey } from "@/lib/account/load-account-settings"

const ACCOUNT_SETTINGS_REFRESH_SCOPE = "account-settings"

const SECTION_KEYS = ["profile", "account", "privacy", "notifications", "preferences"] as const
type SectionKey = (typeof SECTION_KEYS)[number]
function sectionFrom(value: unknown): SectionKey {
  return SECTION_KEYS.includes(value as SectionKey) ? (value as SectionKey) : "profile"
}

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Settings" }

export default async function AccountSettingsRoute({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const user = await pageUser(accountLoginPath("/account/settings"))
  if (!user) return null

  const { section } = await searchParams
  const props = await loadAccountSettingsForUser(user, sectionFrom(section) as SettingsSectionKey)

  return (
    <RouterPullToRefresh scope={ACCOUNT_SETTINGS_REFRESH_SCOPE}>
      <AccountSettings {...props} />
    </RouterPullToRefresh>
  )
}
