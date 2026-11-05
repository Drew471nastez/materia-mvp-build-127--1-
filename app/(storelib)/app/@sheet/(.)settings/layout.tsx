import { SettingsSheet } from "@/components/app/settings-sheet"

/*
  The sheet itself, above the page's loading boundary: a press rises it at
  once, over the page it was pressed on, and the settings fill it when the
  server has answered (./page.tsx, ./loading.tsx).
*/
export default function SettingsSheetOverPage({ children }: { children: React.ReactNode }) {
  return <SettingsSheet overlay>{children}</SettingsSheet>
}
