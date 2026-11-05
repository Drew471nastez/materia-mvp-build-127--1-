import type { Metadata } from "next"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { getServerTt } from "@/lib/i18n/server"
import { AppHelpFrame } from "@/components/help/app-help-frame"
import { AppHelpHome } from "@/components/help/app-help-views"

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Help") }
}

/**
 * The Help Center as a page in the dashboard, opened from the account menu
 * (components/app/sidebar.tsx, components/app/mobile-account-menu.tsx). The
 * same articles as the public /help, which stays as it is for everyone
 * else; components/help/app-help-views draws them in the app's frame.
 * Back returns to the page the menu was opened on.
 */
export default async function AppHelpPage() {
  const [{ tt }, physical] = await Promise.all([getServerTt(), isPhysicalCommerceEnabled()])
  return (
    <AppHelpFrame back={{ fallback: "/app", label: tt("Back") }} title={<h1 className="truncate text-[22px] font-bold leading-8 text-[#1a1a2e] sm:text-[24px]">{tt("Help")}</h1>}>
      <AppHelpHome physical={physical} />
    </AppHelpFrame>
  )
}
