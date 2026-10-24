/**
 * ===========================================================================
 *  A SOCIAL LINK, TYPED ANY WAY, SAVED AS THE ONE RIGHT ADDRESS
 * ===========================================================================
 * "I can just add the username, with the @ separate, or paste the whole URL.
 * For each social media it matches the format so OnePage knows which."
 *
 * lib/onepage/social-input.ts reads what was typed or pasted per platform.
 * This is a table of real inputs, the messy ones included (www., m., a
 * trailing slash, ?igsh= and ?si= junk, a YouTube /c/ or /channel/ link, a
 * LinkedIn company, a phone number with spaces), and what each must become.
 * Then: what the field shows back for a saved link, old formats included,
 * and that the Social links sheet uses it with a fixed prefix.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { parseSocialInput, socialFieldValue, socialFormat, socialFieldIsLink } from "@/lib/onepage/social-input"
import { normalizeSocialUrl } from "@/lib/onepage/social-url"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}

/** [platform, typed, the saved address, or "!error"] */
const TABLE: [string, string, string][] = [
  // Instagram
  ["instagram", "mara.studio", "https://instagram.com/mara.studio"],
  ["instagram", "@mara.studio", "https://instagram.com/mara.studio"],
  ["instagram", "  @mara_studio  ", "https://instagram.com/mara_studio"],
  ["instagram", "https://www.instagram.com/mara.studio/", "https://instagram.com/mara.studio"],
  ["instagram", "https://www.instagram.com/mara.studio/?igsh=MWQ1ZGUxMzBkMA%3D%3D", "https://instagram.com/mara.studio"],
  ["instagram", "instagram.com/mara.studio?utm_source=qr", "https://instagram.com/mara.studio"],
  ["instagram", "http://m.instagram.com/mara.studio", "https://instagram.com/mara.studio"],
  ["instagram", "https://instagr.am/mara", "https://instagram.com/mara"],
  ["instagram", "https://www.instagram.com/stories/mara.studio/3141592653/", "https://instagram.com/mara.studio"],
  ["instagram", "https://www.instagram.com/p/C1abcDEF/?igsh=xyz", "https://www.instagram.com/p/C1abcDEF"],
  ["instagram", "https://www.instagram.com/@mara", "https://instagram.com/mara"],
  ["instagram", "https://tiktok.com/@mara", "!wrong_site"],
  ["instagram", "mara studio", "!handle"],
  // TikTok
  ["tiktok", "mara", "https://tiktok.com/@mara"],
  ["tiktok", "@mara.makes", "https://tiktok.com/@mara.makes"],
  ["tiktok", "https://www.tiktok.com/@mara.makes?_t=8kL9&_r=1", "https://tiktok.com/@mara.makes"],
  ["tiktok", "https://www.tiktok.com/@mara.makes?is_from_webapp=1&sender_device=pc", "https://tiktok.com/@mara.makes"],
  ["tiktok", "tiktok.com/@mara.makes/", "https://tiktok.com/@mara.makes"],
  ["tiktok", "https://m.tiktok.com/@mara", "https://tiktok.com/@mara"],
  ["tiktok", "https://www.tiktok.com/@mara/video/7234567890123456789?lang=en", "https://tiktok.com/@mara/video/7234567890123456789"],
  ["tiktok", "https://vm.tiktok.com/ZMabc123/", "https://vm.tiktok.com/ZMabc123"],
  ["tiktok", "x", "!handle"],
  // X / Twitter
  ["twitter", "jack", "https://x.com/jack"],
  ["twitter", "@jack", "https://x.com/jack"],
  ["twitter", "https://twitter.com/jack", "https://x.com/jack"],
  ["twitter", "https://mobile.twitter.com/jack?s=21&t=abc", "https://x.com/jack"],
  ["twitter", "https://x.com/jack/status/20?s=20", "https://x.com/jack"],
  ["twitter", "x.com/jack/", "https://x.com/jack"],
  ["twitter", "@this_name_is_far_too_long", "!handle"],
  ["x", "@jack", "https://x.com/jack"],
  // Threads
  ["threads", "mara", "https://threads.net/@mara"],
  ["threads", "@mara.studio", "https://threads.net/@mara.studio"],
  ["threads", "https://www.threads.net/@mara.studio?xmt=AQGz", "https://threads.net/@mara.studio"],
  ["threads", "https://www.threads.com/@mara", "https://threads.net/@mara"],
  // YouTube
  ["youtube", "maracooks", "https://youtube.com/@maracooks"],
  ["youtube", "@maracooks", "https://youtube.com/@maracooks"],
  ["youtube", "https://www.youtube.com/@maracooks", "https://youtube.com/@maracooks"],
  ["youtube", "https://youtube.com/@maracooks?si=AbCdEf123", "https://youtube.com/@maracooks"],
  ["youtube", "https://m.youtube.com/@maracooks/videos", "https://youtube.com/@maracooks"],
  ["youtube", "https://www.youtube.com/c/MaraCooks", "https://youtube.com/c/MaraCooks"],
  ["youtube", "https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw", "https://youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw"],
  ["youtube", "youtube.com/user/maracooks?feature=share", "https://youtube.com/user/maracooks"],
  ["youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=youtu.be&t=4", "https://youtube.com/watch?v=dQw4w9WgXcQ"],
  ["youtube", "https://youtu.be/dQw4w9WgXcQ?si=xyz", "https://youtu.be/dQw4w9WgXcQ"],
  ["youtube", "https://youtube.com/shorts/abc123DEF?feature=share", "https://youtube.com/shorts/abc123DEF"],
  ["youtube", "https://www.youtube.com/maracooks", "https://youtube.com/maracooks"],
  ["youtube", "https://vimeo.com/123", "!wrong_site"],
  // Facebook
  ["facebook", "maracooks", "https://facebook.com/maracooks"],
  ["facebook", "https://www.facebook.com/maracooks/", "https://facebook.com/maracooks"],
  ["facebook", "https://m.facebook.com/maracooks?mibextid=ZbWKwL", "https://facebook.com/maracooks"],
  ["facebook", "https://web.facebook.com/maracooks", "https://facebook.com/maracooks"],
  ["facebook", "https://www.facebook.com/profile.php?id=100064&mibextid=abc", "https://facebook.com/profile.php?id=100064"],
  ["facebook", "https://www.facebook.com/people/Mara-Cooks/100064/", "https://facebook.com/people/Mara-Cooks/100064"],
  ["facebook", "fb.com/maracooks", "https://facebook.com/maracooks"],
  // LinkedIn
  ["linkedin", "mara-lee", "https://linkedin.com/in/mara-lee"],
  ["linkedin", "https://www.linkedin.com/in/mara-lee/", "https://linkedin.com/in/mara-lee"],
  ["linkedin", "https://www.linkedin.com/in/mara-lee?utm_source=share&utm_campaign=share_via", "https://linkedin.com/in/mara-lee"],
  ["linkedin", "https://uk.linkedin.com/in/mara-lee", "https://linkedin.com/in/mara-lee"],
  ["linkedin", "https://www.linkedin.com/company/acme-studio/", "https://linkedin.com/company/acme-studio"],
  ["linkedin", "company/acme-studio", "https://linkedin.com/company/acme-studio"],
  ["linkedin", "in/mara-lee", "https://linkedin.com/in/mara-lee"],
  ["linkedin", "https://lnkd.in/dXyZ123", "https://lnkd.in/dXyZ123"],
  // GitHub, Twitch, Kick, Patreon, SoundCloud
  ["github", "octocat", "https://github.com/octocat"],
  ["github", "@octocat", "https://github.com/octocat"],
  ["github", "https://github.com/octocat/", "https://github.com/octocat"],
  ["github", "https://github.com/octocat/hello-world?tab=readme", "https://github.com/octocat/hello-world"],
  ["twitch", "ninja", "https://twitch.tv/ninja"],
  ["twitch", "https://www.twitch.tv/ninja/videos", "https://twitch.tv/ninja"],
  ["twitch", "https://m.twitch.tv/ninja", "https://twitch.tv/ninja"],
  ["kick", "xqc", "https://kick.com/xqc"],
  ["kick", "https://kick.com/xqc/", "https://kick.com/xqc"],
  ["patreon", "maracooks", "https://patreon.com/maracooks"],
  ["patreon", "https://www.patreon.com/c/maracooks/posts", "https://patreon.com/c/maracooks"],
  ["patreon", "https://www.patreon.com/maracooks?utm_medium=clipboard_copy", "https://patreon.com/maracooks"],
  ["soundcloud", "maramusic", "https://soundcloud.com/maramusic"],
  ["soundcloud", "https://soundcloud.com/maramusic/tracks", "https://soundcloud.com/maramusic/tracks"],
  ["soundcloud", "https://m.soundcloud.com/maramusic?si=abc&utm_source=clipboard", "https://soundcloud.com/maramusic"],
  ["soundcloud", "https://on.soundcloud.com/AbC12", "https://on.soundcloud.com/AbC12"],
  // Snapchat, Pinterest, Telegram, Discord, Calendly
  ["snapchat", "mara", "https://snapchat.com/add/mara"],
  ["snapchat", "@mara.lee", "https://snapchat.com/add/mara.lee"],
  ["snapchat", "https://www.snapchat.com/add/mara.lee?share_id=abc&locale=en-GB", "https://snapchat.com/add/mara.lee"],
  ["snapchat", "https://snapchat.com/@mara.lee", "https://snapchat.com/add/mara.lee"],
  ["pinterest", "maracooks", "https://pinterest.com/maracooks"],
  ["pinterest", "https://www.pinterest.co.uk/maracooks/", "https://pinterest.com/maracooks"],
  ["pinterest", "https://pin.it/3abcDEF", "https://pin.it/3abcDEF"],
  ["telegram", "@maracooks", "https://t.me/maracooks"],
  ["telegram", "maracooks", "https://t.me/maracooks"],
  ["telegram", "https://telegram.me/maracooks", "https://t.me/maracooks"],
  ["telegram", "https://t.me/+AbCdEf123", "https://t.me/+AbCdEf123"],
  ["discord", "abcDEF", "https://discord.gg/abcDEF"],
  ["discord", "https://discord.gg/abcDEF", "https://discord.gg/abcDEF"],
  ["discord", "https://discord.com/invite/abcDEF?utm_source=x", "https://discord.gg/abcDEF"],
  ["calendly", "mara", "https://calendly.com/mara"],
  ["calendly", "mara/30min", "https://calendly.com/mara/30min"],
  ["calendly", "https://calendly.com/mara/30min?month=2026-10", "https://calendly.com/mara/30min"],
  // Spotify and Apple Music: links only
  ["spotify", "https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb?si=abc123", "https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb"],
  ["spotify", "open.spotify.com/intl-de/artist/4Z8W4fKeB5YxbusRsdQVPb", "https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb"],
  ["spotify", "spotify:artist:4Z8W4fKeB5YxbusRsdQVPb", "https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb"],
  ["spotify", "https://spotify.link/AbC123", "https://spotify.link/AbC123"],
  ["spotify", "@radiohead", "!url"],
  ["spotify", "radiohead", "!url"],
  ["applemusic", "https://music.apple.com/gb/artist/radiohead/657515?l=en", "https://music.apple.com/gb/artist/radiohead/657515"],
  ["applemusic", "@radiohead", "!url"],
  // WhatsApp
  ["whatsapp", "+44 7700 900123", "https://wa.me/447700900123"],
  ["whatsapp", "447700900123", "https://wa.me/447700900123"],
  ["whatsapp", "0044 7700 900123", "https://wa.me/447700900123"],
  ["whatsapp", "+1 (555) 123-4567", "https://wa.me/15551234567"],
  ["whatsapp", "https://wa.me/447700900123?text=Hi", "https://wa.me/447700900123"],
  ["whatsapp", "https://api.whatsapp.com/send?phone=447700900123&text=hello", "https://wa.me/447700900123"],
  ["whatsapp", "https://chat.whatsapp.com/AbCdEf123", "https://chat.whatsapp.com/AbCdEf123"],
  ["whatsapp", "call me", "!phone"],
  ["whatsapp", "12", "!phone"],
  // Email
  ["email", "you@example.com", "mailto:you@example.com"],
  ["email", "  You@Example.COM ", "mailto:you@example.com"],
  ["email", "mailto:you@example.com", "mailto:you@example.com"],
  ["email", "mailto:you@example.com?subject=Hi", "mailto:you@example.com"],
  ["email", "you@example", "!email"],
  ["email", "you at example.com", "!email"],
  // Website
  ["website", "mara.studio", "https://mara.studio"],
  ["website", "https://mara.studio/", "https://mara.studio"],
  ["website", "http://www.mara.studio/shop?utm_source=ig&utm_medium=bio", "https://www.mara.studio/shop"],
  ["website", "https://mara.studio/shop?item=12", "https://mara.studio/shop?item=12"],
  ["website", "mara studio", "!url"],
  ["website", "localhost", "!url"],
  // Empty
  ["instagram", "   ", "!empty"],
]

console.log("\nEvery real-world input becomes the right address")
for (const [platform, typed, want] of TABLE) {
  const got = parseSocialInput(platform, typed)
  const shown = "url" in got ? got.url : `!${got.error}`
  check(`${platform}: ${JSON.stringify(typed)} → ${want}`, shown === want, `got ${shown}`)
}

console.log("\nA saved address becomes an address the page opens unchanged")
for (const [platform, typed, want] of TABLE) {
  if (want.startsWith("!")) continue
  const saved = (parseSocialInput(platform, typed) as { url: string }).url
  check(`${platform}: ${saved} is drawn as itself`, normalizeSocialUrl(platform, saved) === saved)
}

console.log("\nThe field shows the handle back, or the whole link when it is more than a profile")
const SHOWN: [string, string | null, string][] = [
  ["instagram", "https://instagram.com/mara.studio", "mara.studio"],
  ["instagram", "https://www.instagram.com/mara.studio/", "mara.studio"],
  ["instagram", "@mara", "mara"],
  ["instagram", "mara", "mara"],
  ["tiktok", "https://tiktok.com/@mara", "mara"],
  ["twitter", "https://twitter.com/jack", "jack"],
  ["threads", "https://threads.net/@mara", "mara"],
  ["youtube", "https://youtube.com/@maracooks", "maracooks"],
  ["youtube", "https://youtube.com/c/MaraCooks", "https://youtube.com/c/MaraCooks"],
  ["linkedin", "https://linkedin.com/in/mara-lee", "mara-lee"],
  ["linkedin", "https://linkedin.com/company/acme", "https://linkedin.com/company/acme"],
  ["github", "https://github.com/octocat", "octocat"],
  ["snapchat", "https://snapchat.com/add/mara", "mara"],
  ["whatsapp", "https://wa.me/447700900123", "447700900123"],
  ["whatsapp", "+44 7700 900123", "+44 7700 900123"],
  ["email", "mailto:you@example.com", "you@example.com"],
  ["email", "you@example.com", "you@example.com"],
  ["website", "https://mara.studio", "mara.studio"],
  ["spotify", "https://open.spotify.com/artist/4Z8W", "https://open.spotify.com/artist/4Z8W"],
  ["calendly", "https://calendly.com/mara/30min", "mara/30min"],
  ["discord", "https://discord.gg/abc", "abc"],
  ["instagram", null, ""],
]
for (const [platform, saved, want] of SHOWN) {
  const got = socialFieldValue(platform, saved)
  check(`${platform}: saved ${JSON.stringify(saved)} shows ${JSON.stringify(want)}`, got === want, `got ${JSON.stringify(got)}`)
}

console.log("\nA value shown back reads as the same address again")
for (const [platform, saved] of SHOWN) {
  if (!saved || !/^https?:|^mailto:/.test(saved)) continue
  const again = parseSocialInput(platform, socialFieldValue(platform, saved))
  const direct = parseSocialInput(platform, saved)
  check(`${platform}: ${saved} round-trips`, "url" in again && "url" in direct && again.url === direct.url, "url" in again ? again.url : again.error)
}

console.log("\nEach platform has the prefix its handles are typed after")
check("Instagram, TikTok, X, Threads, YouTube, Snapchat, Pinterest and Telegram show @", ["instagram", "tiktok", "twitter", "threads", "youtube", "snapchat", "pinterest", "telegram"].every((p) => socialFormat(p).prefix === "@"))
check("GitHub shows github.com/", socialFormat("github").prefix === "github.com/")
check("LinkedIn shows linkedin.com/in/", socialFormat("linkedin").prefix === "linkedin.com/in/")
check("Email shows Email and an email keyboard", socialFormat("email").prefix === "Email" && socialFormat("email").inputMode === "email")
check("WhatsApp shows + and a phone keyboard", socialFormat("whatsapp").prefix === "+" && socialFormat("whatsapp").inputMode === "tel")
check("Website shows https://", socialFormat("website").prefix === "https://")
check("Spotify asks for a link", socialFormat("spotify").kind === "url")
check("a pasted link steps the prefix aside", socialFieldIsLink("instagram", "https://instagram.com/x") && socialFieldIsLink("instagram", "www.instagram.com/x") && !socialFieldIsLink("instagram", "mara.studio"))
check("a phone number is not a link", !socialFieldIsLink("whatsapp", "+44 7700 900123"))

console.log("\nThe Social links sheet uses it")
const links = readFileSync("components/onepage/tabs/links-tab.tsx", "utf8")
check("the sheet reads input through parseSocialInput", /parseSocialInput\(/.test(links))
check("the sheet shows a saved link through socialFieldValue", /socialFieldValue\(/.test(links))
check("the sheet draws the platform's prefix", /socialFormat\(/.test(links) && /data-social-prefix/.test(links))

console.log("\nThe social row follows the links without becoming an edit")
{
  const tab = links
  const listSync = tab.slice(tab.indexOf("// Sync social_links to all social_row blocks"), tab.indexOf("// Auto-fetch thumbnail for social media links"))
  const editorSync = tab.slice(tab.indexOf("// Sync block platforms when socialLinks change"), tab.indexOf("const updateData = (updates"))
  check("the list's sync is silent and carries an edited address", /\{ silent: true \}\)/.test(listSync) && /hasChangedUrls/.test(listSync))
  check("the social row editor's own sync is silent too (no Unsaved, no Undo step on open)", /contextUpdateBlock\(block\.id, \{[\s\S]*?\}, \{ silent: true \}\)/.test(editorSync) && /hasChangedUrls/.test(editorSync))
  const comp = tab.slice(tab.indexOf("// Sync social_links to all social_row blocks") - 2000, tab.indexOf("// Handle thumbnail upload for modal"))
  const early = comp.indexOf("if (!onepage) return null")
  const lastHook = Math.max(comp.lastIndexOf("useEffect("), comp.lastIndexOf("useCallback("), comp.lastIndexOf("useRef("))
  check("every hook runs before the early return (rules of hooks)", early > lastHook && lastHook > 0)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log("\nFailures:\n  " + failures.join("\n  "))
  process.exit(1)
}
