import { SettingsFixture } from "../../../../fix/settings-fixture"
import { serverDelay } from "../../../../fix/delay"
export const dynamic = "force-dynamic"
export default async function S() { await serverDelay("settings", 400); return <SettingsFixture /> }
