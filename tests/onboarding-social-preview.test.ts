/**
 * The seller onboarding's socials step shows the picture of the account typed
 * into each field (app/api/onboarding/social-preview). What a typed value
 * means on each network, which public page is read, and which pictures are
 * not a person's (lib/onboarding/social-preview).
 */
import { readFileSync } from "node:fs"
import { isSocialNetwork, profileUrl, socialHandle, usablePicture } from "../lib/onboarding/social-preview"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) } else { failed++; console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`) }
}

console.log("\nWhat a typed value names")
check("a bare name and an @name are the same", socialHandle("instagram", "andrewrulz") === "andrewrulz" && socialHandle("instagram", "@andrewrulz") === "andrewrulz")
check("a profile address on the network", socialHandle("instagram", "https://www.instagram.com/andrewrulz/") === "andrewrulz" && socialHandle("instagram", "instagram.com/andrewrulz") === "andrewrulz")
check("TikTok's @ in the path", socialHandle("tiktok", "https://www.tiktok.com/@andrew.rulz") === "andrew.rulz")
check("YouTube's @channel", socialHandle("youtube", "youtube.com/@AndrewRulz") === "AndrewRulz")
check("x.com and twitter.com", socialHandle("twitter", "x.com/andrew") === "andrew" && socialHandle("twitter", "https://twitter.com/andrew?s=20") === "andrew")
check("another site's address is not an account", socialHandle("instagram", "evil.example/andrew") === null && socialHandle("twitter", "https://instagram.com/andrew") === null)
check("nothing, spaces and odd characters are not accounts", socialHandle("tiktok", "") === null && socialHandle("tiktok", "a b") === null && socialHandle("tiktok", "<script>") === null && socialHandle("tiktok", 7) === null)
check("a name may not start or end with a dot", socialHandle("instagram", ".andrew") === null && socialHandle("instagram", "andrew.") === null)

console.log("\nThe page that is read")
check("each network's own public profile", profileUrl("instagram", "a") === "https://www.instagram.com/a/" && profileUrl("tiktok", "a") === "https://www.tiktok.com/@a" && profileUrl("youtube", "a") === "https://www.youtube.com/@a" && profileUrl("twitter", "a") === "https://x.com/a")
check("only the four networks", isSocialNetwork("instagram") && isSocialNetwork("twitter") && !isSocialNetwork("facebook") && !isSocialNetwork(null))

console.log("\nA picture that is the person's")
check("an https picture is kept", usablePicture("https://scontent.cdninstagram.com/v/t51/p.jpg") === "https://scontent.cdninstagram.com/v/t51/p.jpg")
check("http, nothing and the network's own logo are not", usablePicture("http://x/p.jpg") === null && usablePicture(null) === null && usablePicture("https://static.cdninstagram.com/rsrc.php/v3/logo.png") === null && usablePicture("https://abs.twimg.com/responsive-web/client-web/icon.png") === null)

console.log("\nThe route")
const route = readFileSync("app/api/onboarding/social-preview/route.ts", "utf8")
check("signed in only, limited, read through fetchPublic over https, nothing stored", /routeUser\(\)/.test(route) && /rateLimit\(/.test(route) && /fetchPublic\(profileUrl\(network, handle\), \{[^}]*httpsOnly: true/.test(route) && !/\.from\(|\.upload\(/.test(route))
const modal = readFileSync("components/app/creator-onboarding-modal.tsx", "utf8")
check("the socials step asks it once per value, after typing stops, and drops a stale answer", /\/api\/onboarding\/social-preview\?network=/.test(modal) && /}, 600\)\)/.test(modal) && /if \(previewAsked\.current\[id\] !== value\) return/.test(modal))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
