/**
 * ===========================================================================
 *  THE ONE NATIVE CHANGE GOOGLE'S OWN SHEET NEEDS
 * ===========================================================================
 * Everything else about Continue with Google is already in the repository:
 * the plugin is a dependency, the web layer finds it at runtime
 * (lib/auth/native-sign-in.ts), and both pages ask for it. What is left is
 * one line of iOS configuration that cannot be guessed, because it is made
 * of the iOS client id from YOUR Google Cloud project:
 *
 *   Google answers an iOS app by opening the client id BACKWARDS as a URL
 *   scheme. com.googleusercontent.apps.123-abc has to be listed in
 *   Info.plist, or Google's sheet opens, the person picks their account, and
 *   nothing comes back.
 *
 * So rather than hand-editing XML:
 *
 *   node scripts/native-google-setup.mjs 123-abc.apps.googleusercontent.com
 *
 * It adds the scheme if it is missing, says so if it is already there, and
 * prints the two environment values the web layer needs. Then:
 *
 *   npx cap sync      → the plugin's pods and gradle entries
 *   open ios/App/App.xcworkspace  (and Android Studio) → build and release
 *
 * Android needs nothing here: the plugin is handed the web client id at
 * runtime, from the environment.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const PLIST = join(process.cwd(), "ios/App/App/Info.plist")
const say = (s) => console.log(s)

const iosClientId = (process.argv[2] || "").trim()
if (!/^[0-9a-z-]+\.apps\.googleusercontent\.com$/i.test(iosClientId)) {
  say("\nUsage: node scripts/native-google-setup.mjs <iOS client id>\n")
  say("The iOS client id is in Google Cloud → APIs & Services → Credentials,")
  say("made for the bundle com.storelib.app, and reads like")
  say("  123456-abcdef.apps.googleusercontent.com\n")
  process.exit(1)
}

/** com.googleusercontent.apps.123456-abcdef — the client id, backwards. */
const scheme = iosClientId.split(".").reverse().join(".")

let plist = readFileSync(PLIST, "utf8")
if (plist.includes(scheme)) {
  say(`\nInfo.plist already lists ${scheme} — nothing to add.\n`)
} else {
  const anchor = `\t<key>CFBundleURLTypes</key>\n\t<array>\n`
  if (!plist.includes(anchor)) {
    say("\nCould not find CFBundleURLTypes in Info.plist. Add this inside it by hand:\n")
    say(`\t\t<dict>\n\t\t\t<key>CFBundleURLName</key>\n\t\t\t<string>google</string>\n\t\t\t<key>CFBundleURLSchemes</key>\n\t\t\t<array>\n\t\t\t\t<string>${scheme}</string>\n\t\t\t</array>\n\t\t</dict>\n`)
    process.exit(1)
  }
  const entry =
    `\t\t<!-- Google's sheet answers here: the iOS client id, backwards (scripts/native-google-setup.mjs). -->\n` +
    `\t\t<dict>\n\t\t\t<key>CFBundleURLName</key>\n\t\t\t<string>google</string>\n` +
    `\t\t\t<key>CFBundleURLSchemes</key>\n\t\t\t<array>\n\t\t\t\t<string>${scheme}</string>\n\t\t\t</array>\n\t\t</dict>\n`
  plist = plist.replace(anchor, anchor + entry)
  writeFileSync(PLIST, plist)
  say(`\nAdded ${scheme} to Info.plist.\n`)
}

say("Set these in Vercel (Production and Preview), then redeploy:\n")
say(`  NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID=${iosClientId}`)
say(`  NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID=<the WEB client id from the same project>\n`)
say("In Supabase → Authentication → Providers → Google, the Authorized Client IDs")
say("box must list the web, iOS and Android client ids, or the token is refused.\n")
say("Then:  npx cap sync  →  build in Xcode / Android Studio  →  release.\n")
