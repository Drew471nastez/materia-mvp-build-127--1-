import { SettingsPlaceholder } from "@/components/app/settings/settings-placeholder"

/*
  While the server answers: the sheet is already up (./layout.tsx). It used
  to stay empty and white until the form dropped in whole. Now the form's
  shape holds the space, only on a slow answer (it waits 200ms before it
  shows), and the settings fade in over it when they come.
*/
export default function SettingsSheetLoading() {
  return <SettingsPlaceholder />
}
