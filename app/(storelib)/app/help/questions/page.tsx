import type { Metadata } from "next"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { helpTopicsFor } from "@/lib/help/questions"
import { getServerTt } from "@/lib/i18n/server"
import { AppHelpFrame } from "@/components/help/app-help-frame"
import { AppHelpQuestions, APP_QUESTIONS_TITLE } from "@/components/help/app-help-views"
import { APP_HELP_BASE } from "@/lib/help/paths"

export async function generateMetadata(): Promise<Metadata> {
  return { title: APP_QUESTIONS_TITLE }
}

/** Order problems, answered, inside the dashboard: the same list as /help/questions, in the app's frame. */
export default async function AppHelpQuestionsPage() {
  const [{ tt }, physical] = await Promise.all([getServerTt(), isPhysicalCommerceEnabled()])
  return (
    <AppHelpFrame back={{ fallback: APP_HELP_BASE, label: tt("Back") }} title={<h1 className="truncate text-[20px] font-bold leading-7 text-[#1a1a2e] sm:text-[22px]">{APP_QUESTIONS_TITLE}</h1>} subtitle={tt("Help")}>
      <AppHelpQuestions topics={helpTopicsFor(physical)} />
    </AppHelpFrame>
  )
}
