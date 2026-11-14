/**
 * ===========================================================================
 *  ROUND 25: EVERY PRESS IS FELT, ON EVERY PHONE THE APP RUNS ON
 * ===========================================================================
 * The owner: "you deactivated haptics across the app completely". An iPhone
 * build from before the Haptics pod (ios/App/Podfile, 24 October) has no
 * plugin, so every tap fell back to navigator.vibrate, which iOS does not
 * have. lib/native-bridge.ts now asks the binary (isPluginAvailable), uses
 * the plugin when it is there, and on an iPhone without it ticks through
 * WebKit's switch. scripts/check-haptics-r25.mjs runs the real code against
 * stand-in phones and records where each tap goes; this reads the source.
 *
 *   npm run test:push
 */
import { readCode } from "./_source"

let passed = 0
let failed = 0
function check(label: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}`)
  }
}

const bridge = readCode("lib/native-bridge.ts")
console.log("\nWhich way a tick goes (lib/native-bridge.ts)")
check("the plugin only when the installed app has it", /if \(typeof cap\.isPluginAvailable === "function" && !cap\.isPluginAvailable\("Haptics"\)\) return null/.test(bridge))
check("called on the bridge, or straight through nativePromise, never waiting on an import first", /const onBridge = cap\.Plugins\?\.Haptics/.test(bridge) && /cap\.nativePromise\("Haptics", method, options \?\? \{\}\)/.test(bridge))
check("soft starts its selection generator once, then ticks", /await startSelection\(\(\) => call\("selectionStart"\)\)\s*\n\s*await call\("selectionChanged"\)/.test(bridge))
check("an iPhone without the plugin ticks through WebKit's switch, in a frame of its own", /if \(appleTouchBrowser\(\)\) return void switchTick\(\)/.test(bridge) && /<input type="checkbox" switch>/.test(bridge) && /document\.createElement\("iframe"\)/.test(bridge))
check("and does so inside the press, not after a promise", /if \(!nativeHaptics\(\) && \(window as any\)\.Capacitor\?\.isPluginAvailable\) \{\s*\n\s*web\(\)\s*\n\s*return/.test(bridge))
check("Android without it vibrates, 6, 10 and 15ms", /navigator\.vibrate\(strength === "soft" \? 6 : strength === "light" \? 10 : 15\)/.test(bridge))
check("one tick a press: two inside 35ms are one", /if \(now - lastTap < 35\) return/.test(bridge))

console.log("\nThe controls an iPhone answers with a tick, tick")
check("a switch flips with a light knock", /hapticTap\('light'\)\s*\n\s*onCheckedChange\?\.\(checked\)/.test(readCode("components/ui/switch.tsx")))
check("a checkbox with the soft tick", /hapticTap\('soft'\)\s*\n\s*onCheckedChange\?\.\(checked\)/.test(readCode("components/ui/checkbox.tsx")))
for (const f of ["radio-group", "tabs", "select"]) check(`${f}: the soft tick as the choice moves`, /hapticTap\('soft'\)\s*\n\s*onValueChange\?\.\(value\)/.test(readCode(`components/ui/${f}.tsx`)))
const own = ["app/(storelib)/app/products/new/editor-controls.tsx", "components/app/settings/account-panels.tsx", "components/community/creator/parts.tsx", "components/community/member/heart.tsx", "components/website-builder/editor/design-panels.tsx", "components/website-builder/github-sync-panel.tsx", "components/website-builder/link-picker.tsx", "components/website-builder/ask-model-picker.tsx", "components/reviews/widgets/widget-customizer.tsx", "components/onepage/extra-blocks-editor.tsx"]
check("the app's own switches too", own.every((f) => /hapticTap\("light"\)/.test(readCode(f))))

check("this suite runs with the others", readCode("scripts/run-push-tests.mjs").includes('"tests/haptics25.test.ts"'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
