/**
 * ===========================================================================
 *  ASK STORELIB: THE COMPUTER'S PILL, THE PHONE'S SHEET, AND CONVERSATIONS
 * ===========================================================================
 * On a computer Ask Storelib is a frosted pill at the bottom centre of the
 * canvas that opens into the conversation, not a column beside the sidebar.
 * Both shapes have a history of conversations, a new chat, maximize and
 * close, a model menu, pictures and a microphone.
 *
 * Geometry, motion and what a press does are measured on the real component
 * by scripts/check-ask-ai.mjs. This pins the source those measurements rest
 * on, holds the dock's geometry to its numbers, and pins the part no probe
 * can see: that a creator only ever lists and opens their own conversations,
 * on their own websites.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { dockGeometry, DOCK_GAP, DOCK_PAD, PILL_WIDTH } from "../lib/website-builder/ask-dock"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const section = (name: string) => console.log(`\n${name}`)

const editor = read("app/website-builder/editor/[installId]/page.tsx")
const chat = read("components/website-builder/theme-chat.tsx")
const voice = read("components/website-builder/ask-voice.ts")
const history = read("components/website-builder/ask-history.tsx")
const sheet = read("components/website-builder/mobile-editor-sheet.tsx")
const lib = read("lib/website-builder/agent/chat.ts")
const chatRoute = read("app/api/website-builder/themes/[installId]/chat/route.ts")
const listRoute = read("app/api/website-builder/themes/[installId]/chat/conversations/route.ts")
const agentRoute = read("app/api/website-builder/themes/[installId]/agent/route.ts")
const transcribe = read("app/api/website-builder/transcribe/route.ts")
const css = read("app/globals.css")

// ---------------------------------------------------------------------------
section("Where the dock sits")
// ---------------------------------------------------------------------------
{
  const g = dockGeometry(1122, 846, false, 900)
  check("a pill 660 wide on a wide canvas, 20px above its bottom", g.pillW === PILL_WIDTH && g.pillBottom === DOCK_GAP, JSON.stringify(g))
  check("the conversation is the pill's width and 10px more each side, from just under it", g.cardW === g.pillW + 2 * DOCK_PAD && g.cardBottom === DOCK_GAP - DOCK_PAD && g.cardH === 620, JSON.stringify(g))
  const narrow = dockGeometry(600, 500, false, 700)
  check("on a narrow canvas the pill keeps 24px either side, and the conversation fits under the top", narrow.pillW === 552 && narrow.cardH + narrow.cardBottom <= 500 - 24, JSON.stringify(narrow))
  const max = dockGeometry(1122, 846, true, 900)
  check("maximized: min(960, canvas - 48) wide and 85% of the window tall, centred", max.cardW === 960 && max.cardH === 765 && Math.abs(max.cardBottom - (846 - 765) / 2) <= 0.5, JSON.stringify(max))
  check("and the pill moves up with it, staying its input row", max.pillBottom === max.cardBottom + DOCK_PAD)
  const short = dockGeometry(900, 500, true, 560)
  check("maximized in a short window it still fits the canvas", short.cardH <= 500 - 48 && short.cardBottom >= 0, JSON.stringify(short))
}

// ---------------------------------------------------------------------------
section("The computer's pill")
// ---------------------------------------------------------------------------
{
  check(
    "it is drawn inside the canvas's <main>, not beside the sidebar",
    (() => {
      const main = editor.indexOf("ref={canvasMainRef}")
      const dock = editor.indexOf('variant="dock"')
      const end = editor.indexOf("</main>", main)
      return main > 0 && dock > main && dock < end
    })(),
  )
  check("the old 340px column is gone", !/style=\{\{ width: 340 \}\} aria-hidden=\{!aiOpen\} data-ai-panel/.test(editor))
  check(
    "it is there by default on a computer, and one closed with its X stays closed until the bar brings it back",
    /if \(mobile !== wasMobile\) setAiOpen\(!mobile && !askDockClosed\(\)\)/.test(editor) &&
      /rememberAskDockClosed\(true\)/.test(editor) &&
      /else rememberAskDockClosed\(aiOpen\)/.test(editor),
  )
  check(
    "a section's Ask AI opens the conversation, not only the pill",
    /rememberAskDockClosed\(false\)\s*\n\s*setAiAsk\(\(n\) => n \+ 1\)/.test(editor) && /openRequest=\{aiAsk\}/.test(editor),
  )
  check(
    "the chat is memoised and given stable callbacks, so typing and streaming never render the editor",
    /export const ThemeChat = React\.memo\(ThemeChatPanel\)/.test(chat) &&
      /onClose=\{closeAiDock\}/.test(editor) && /onOpenCodeEditor=\{openAiCodeFromDock\}/.test(editor) &&
      !/onClose=\{\(\) => setAiOpen\(false\)\}/.test(editor),
  )
  /*
    "Around the pill-shaped Ask Storelib bar, make sure it is blur glass: a
    smooth, clean fade around it, not a white fade." "It has a white, faded,
    light glow around it, which is bad." The halo (a light shadow the pill's
    shape, rgba(248, 249, 250, 0.5)) is gone.

    Then: "The blur around the pill is not fading, disappearing smoothly.
    It's very cut around" and "it has too much see-through glassmorphism. It
    needs to be more solid white". The masked blur band round the pill is
    gone (Safari draws a backdrop blur but not the mask that feathers it, so
    it ended in a hard edge), and the pill is 95% white over a light blur,
    readable over a dark page and a white one.
  */
  check(
    "the pill is near solid white: 95% over a light 7px blur, with a hairline and layered shadows of ink",
    /data-ask-glass=""[\s\S]{0,120}className="[^"]*border-\[#1a1a2e\]\/\[0\.08\][^"]*bg-white\/\[0\.95\][^"]*0_22px_44px_-20px_rgba\(15,23,42,0\.24\)[^"]*backdrop-blur-\[7px\]/.test(chat) &&
      !/bg-white\/\[0\.64\]/.test(chat),
  )
  check(
    "and nothing around it glows: the halo is gone, and no shadow anywhere in the dock is white or near white",
    !/data-ask-halo/.test(chat) && !/248, 249, 250/.test(chat) &&
      !/(?:shadow-\[|boxShadow: ")[^"\]]*rgba\((?:2[0-5]\d, ?){2}2[0-5]\d, ?0?\.\d+\)(?![^"\]]*inset)/.test(chat),
  )
  /*
    Third time round: "around the pill shape there, there needs to be some
    smooth clean blur applied around it, very smooth." Not the white glow
    (rejected), not the one masked band (WebKit draws a backdrop filter and
    drops the mask that feathers it, so it came out cut). Five rings, no
    fill on any of them, each blurring less than the one inside it, each
    feathered by its own eased mask — so where masks reach backdrop filters
    it is one smooth ramp, and where they do not it is a staircase of five
    radii rather than a cut. Measured in scripts/check-ask-dock.mjs (SOFTEN)
    and scripts/check-ask-ai.mjs (THE RAMP), the second of which takes the
    masks off and measures it again.
  */
  {
    const dock = read("lib/website-builder/ask-dock.ts")
    const rings = [...dock.matchAll(/\{ reach: (\d+), blur: ([\d.]+), saturate: ([\d.]+), fade: (\d+) \}/g)].map((m) => m.slice(1).map(Number))
    check(
      "round the pill the page softens into it: five rings of backdrop blur, widest first, none blurring less than the one outside it and the innermost blurring several times as hard",
      rings.length === 5 &&
        rings.every(([reach], i) => i === 0 || reach < rings[i - 1][0]) &&
        rings.every(([, blur], i) => i === 0 || blur >= rings[i - 1][1]) &&
        rings[4][1] >= rings[0][1] * 3 &&
        rings[0][0] <= 26 &&
        !/data-ask-fade/.test(chat) &&
        /SOFTEN_RINGS\.map\(\(ring\) =>/.test(chat),
    )
    check(
      "and not one of them holds a colour: no background, no shadow, nothing but the page's own pixels blurred and a touch less saturated",
      rings.every(([, , saturate]) => saturate > 0.9 && saturate < 1) &&
        /backdropFilter: `blur\(\$\{ring\.blur\}px\) saturate\(\$\{ring\.saturate\}\)`/.test(chat) &&
        !/data-ask-soften[\s\S]{0,600}(?:backgroundColor|boxShadow|bg-white|shadow-\[)/.test(chat),
    )
    check(
      "each feathers its own edge, with the -webkit- spelling beside every one, on an eased ramp so the softening has no end you can point at",
      /maskImage: softenMask\(ring\.fade\)/.test(chat) &&
        /WebkitMaskImage: softenMask\(ring\.fade\)/.test(chat) &&
        /maskComposite: "intersect"/.test(chat) &&
        /WebkitMaskComposite: "source-in"/.test(chat) &&
        /const RAMP = \[0, 0\.043, 0\.156, 0\.32, 0\.5, 0\.68, 0\.844, 0\.957, 1\]/.test(dock),
    )
    check(
      "the rings fade on their own opacity with the glass, never an ancestor's: a backdrop filter under a fading parent is switched off for the whole fade",
      /data-ask-soften=\{ring\.reach\}[\s\S]{0,600}\.\.\.appear\(!expanded && !pillAway, 280, 200\),/.test(chat),
    )
    const css = read("app/globals.css")
    check(
      "a browser with no backdrop filter is given no rings to composite, and prefers-reduced-transparency takes them away and makes the pill's face plain white",
      /@supports not \(\(backdrop-filter: blur\(2px\)\) or \(-webkit-backdrop-filter: blur\(2px\)\)\) \{\s*\[data-ask-soften\] \{\s*display: none;/.test(css) &&
        /@media \(prefers-reduced-transparency: reduce\) \{[\s\S]{0,400}\[data-ask-soften\] \{\s*display: none;[\s\S]{0,200}\[data-ask-glass\] \{\s*background-color: #fff;\s*backdrop-filter: none;/.test(css),
    )
  }
  check(
    "the open conversation is solid white with no backdrop filter, so opening it moves one flat layer",
    /data-ask-surface=""\s*\n\s*className="[^"]*bg-white shadow-[^"]*"/.test(chat) &&
      !/data-ask-surface=""\s*\n\s*className="[^"]*backdrop-/.test(chat),
  )
  check(
    "the pill's glass fades on its own opacity and is moved by a transform; the conversation moves and fades as one element",
    /style=\{appear\(!expanded && !pillAway, 280, 200\)\}/.test(chat) &&
      /\.\.\.cardMotion\(cardOpen\)/.test(chat) &&
      /data-ask-pill-state=\{pillAway \? "away" : "shown"\} style=\{lift\(!pillAway/.test(chat),
  )
  check(
    "opening and closing move on transform and opacity only: the iOS curve in, a quicker ease in out",
    /transform: shown \? "none" : away/.test(chat) &&
      /`transform \$\{openMs\}ms \$\{EASE\}, visibility 0s`/.test(chat) &&
      /`transform \$\{OPEN_MS\}ms \$\{EASE\}, opacity \$\{Math\.round\(OPEN_MS \* 0\.6\)\}ms ease-out, visibility 0s`/.test(chat) &&
      /`transform \$\{CLOSE_MS\}ms \$\{CLOSE_EASE\}, opacity \$\{CLOSE_MS\}ms \$\{CLOSE_EASE\}, visibility 0s linear \$\{CLOSE_MS\}ms`/.test(chat) &&
      !/transition: `(?:width|height|top|left|bottom)/.test(chat) &&
      /EASE = "cubic-bezier\(0\.32, 0\.72, 0, 1\)"/.test(read("lib/website-builder/ask-dock.ts")) &&
      /CLOSE_EASE = "cubic-bezier\(0\.4, 0, 1, 1\)"/.test(read("lib/website-builder/ask-dock.ts")) &&
      /OPEN_MS = 2[2-8]\d\b/.test(read("lib/website-builder/ask-dock.ts")) && /CLOSE_MS = (?:1[89]\d|2[0-4]\d)\b/.test(read("lib/website-builder/ask-dock.ts")),
  )
  check(
    "it stays in the page until the close has finished, and keeps its layer (will-change) only while open or closing",
    /visibility 0s linear \$\{CLOSE_MS\}ms/.test(chat) &&
      /willChange: shown \|\| cardLeaving \? "transform, opacity" : "auto"/.test(chat) &&
      /window\.setTimeout\(\(\) => setCardLeaving\(false\), CLOSE_MS \+ 80\)/.test(chat),
  )
  check("and not at all under reduced motion", /transition: reducedMotion\s*\n?\s*\? "none"/.test(chat))
  check(
    "maximize is measured and played as a transform (FLIP), the words fading back in at the new size",
    /surface\.style\.transform = `translate\(\$\{from\.surface\.left - to\.left\}px/.test(chat) &&
      /content\.style\.opacity = "0"/.test(chat),
  )
  check(
    "Escape and a press outside fold it back to the pill; the picture viewer, the menu, a recording and the history go first",
    /if \(event\.key !== "Escape" \|\| event\.defaultPrevented \|\| viewingRef\.current\) return/.test(chat) &&
      /else if \(view === "history"\) setView\("thread"\)\s*\n\s*else collapseDock\(\)/.test(chat) &&
      /document\.addEventListener\("pointerdown", onDown, true\)/.test(chat),
  )
  check(
    "the picture viewer is drawn in the body, because the dock's transform and blur would trap a fixed layer",
    /createPortal\(\s*\n\s*<div data-ask-keep="">/.test(chat),
  )
  check(
    "the section toolbar outranks the pill: the pill steps away while they overlap, measured from its unmoving slot",
    /document\.querySelector<HTMLElement>\("\.wb-section-toolbar"\)/.test(chat) && /const slot = pillSlotRef\.current/.test(chat),
  )
  check("while open it is above the toolbar (z-30)", /cardOpen \? "z-40" : "z-20"/.test(chat))
  check(
    "writing a section folds it out of the canvas's way, and a failure or an answer opens it again",
    /if \(dock\) setExpanded\(false\)\s*\n\s*let outcome: WriteOutcome \| null = null/.test(chat) && /if \(!kept && dock\) setExpanded\(true\)/.test(chat),
  )
}

// ---------------------------------------------------------------------------
section("The header, on both")
// ---------------------------------------------------------------------------
{
  for (const label of ["Conversation history", "New chat", "Close chat", "Back to the conversation"]) {
    check(`it has ${label}`, chat.includes(`aria-label="${label}"`))
  }
  check("and maximize, which says what it will do", /aria-label=\{isMax \? "Restore size" : "Maximize"\}/.test(chat))
  /*
    "Instead of only the maximize button, have a thing like Connect AI, with
    the icons of Claude and OpenAI." Maximize stays on a computer, where the
    conversation can grow to most of the canvas; a phone's sheet is resized
    by its own handle, so its top row gives that room to Connect AI.
  */
  check(
    "maximize is the computer's; a phone's sheet is resized by its handle",
    /\{dock && \(\s*<button\s*type="button"\s*data-ask-maximize=""/.test(chat) && /export function useSheetStop\(\)/.test(sheet),
  )
  check(
    "Connect AI is in the top row, with Claude's and OpenAI's own marks, and opens Connections",
    /<ConnectAiButton phone=\{phone\} onClick=\{onConnectAi\} \/>/.test(chat) &&
      /<ClaudeMark className="h-3 w-3 text-\[#D97757\]" \/>/.test(read("components/website-builder/ask-parts.tsx")) &&
      /<OpenAIMark className="h-3 w-3 text-black" \/>/.test(read("components/website-builder/ask-parts.tsx")) &&
      (editor.match(/onConnectAi=\{connectAiFromChat\}/g) ?? []).length === 2 &&
      /const connectAiFromChat = useCallback\(\(\) => actionCalls\.current\.openConnections\(\), \[\]\)/.test(editor),
  )
  check(
    "a new chat cannot start in the middle of a change, and the one on screen stays in the history",
    /const newChat = React\.useCallback\(\(\) => \{\s*\n\s*if \(busy \|\| writing\) return/.test(chat) &&
      /setConversation\(\{ id: null, title: "", earlier: false \}\)/.test(chat),
  )
  check(
    "the history slides in and back on transform, and is only in the page while it is used",
    /slide\(view === "history" \? "none" : "translateX\(100%\)"/.test(chat) &&
      /const historyPane = historyMounted && \(/.test(chat) &&
      /setHistoryMounted\(false\), reducedMotion \? 0 : SLIDE_MS \+ 60/.test(chat),
  )
  check(
    "it is read fresh each time it opens, newest first",
    /\}, \[installId, refreshKey\]\)/.test(history) && /items\.sort\(\(a, b\) => new Date\(b\.when\)\.getTime\(\) - new Date\(a\.when\)\.getTime\(\)\)/.test(history),
  )
}

// ---------------------------------------------------------------------------
section("Pictures")
// ---------------------------------------------------------------------------
{
  check(
    "a picture is a thumbnail the moment it is chosen, drawn from the file, with a ring while it is made ready",
    /\{ id, name: file\.name, state: "preparing", progress: 0, mediaType: "image\/jpeg", data: "", url, source: file \}/.test(chat) &&
      /url = URL\.createObjectURL\(file\)/.test(chat) &&
      /data-ask-preparing=""/.test(read("components/website-builder/ask-attachments.tsx")),
  )
  check(
    "a sent picture says it is sending until the route has read the request",
    /patch\(\(e\) => \(\{ \.\.\.e, sent: true \}\)\)/.test(chat) && /exchange\.running && !exchange\.sent && \(/.test(chat),
  )
  check("dragging a file over the pill opens the conversation to drop it in", /setDragging\(true\)\s*\n\s*if \(dock\) openDock\(\)/.test(chat))
  check("its errors are said where it happened, and can be put away", /data-ask-attach-error=""/.test(chat) && /onClick=\{\(\) => setAttachError\(null\)\}/.test(chat))
}

// ---------------------------------------------------------------------------
section("Voice")
// ---------------------------------------------------------------------------
{
  check(
    "the words go into the box, typing themselves in a few characters a frame, and are never sent by themselves",
    /* At the caret now, and only the spoken part types (lib/website-builder/ask-dictation.ts). */
    /voiceTarget\.current = spokenSince\(placedRef\.current, text\)/.test(chat) &&
      /const next = typeToward\(spokenShown\.current, target\)/.test(chat) &&
      /const composed = composeDictation\(anchor\.current, next\)/.test(chat) &&
      /if \(next !== target\) typingFrame\.current = requestAnimationFrame\(typeFrame\)/.test(chat) &&
      !/submit\(/.test(voice),
  )
  check(
    "when the recording ends the box holds exactly what was heard",
    /const composed = composeDictation\(anchor\.current, target\)\s*\n\s*spokenShown\.current = target\s*\n\s*pendingCaret\.current = composed\.caret\s*\n\s*setDraft\(composed\.text\)/.test(chat),
  )
  check(
    "on a computer, the browser's own recogniser, with the words appearing while they are said",
    /rec\.interimResults = true/.test(voice) && /w\.SpeechRecognition \?\? w\.webkitSpeechRecognition/.test(voice)
      && /if \(hasRecogniser && !touchScreen\(\)\) setEngine\("speech"\)/.test(voice),
  )
  /*
    Changed on purpose: "voice input stopped, try again or type — I get the
    error when on phone". Every browser on iOS is WebKit, whose recogniser
    answers start() and then ends without a word, so a phone was left with
    that message every time. A touch screen records instead, which is what
    the apps have always done. Asked of the pointer, never of the user agent.
  */
  check(
    "on a touch screen, and in the iOS and Android apps, a clip is recorded and turned into text instead",
    /window\.matchMedia\("\(pointer: coarse\)"\)\.matches/.test(voice) && /bridge\(\)\?\.isNativePlatform\?\.\(\) === true/.test(voice) && !/userAgent/.test(voice),
  )
  check(
    "recording is offered only where the server says it can turn it into text",
    /setEngine\(\(chosen\) => chosen \?\? "record"\)/.test(voice) && /available: !!creatorId && !!process\.env\.OPENAI_API_KEY/.test(transcribe),
  )
  check(
    "  and a phone with nothing to record to keeps its recogniser rather than losing its microphone",
    /else if \(hasRecogniser\) setEngine\(\(chosen\) => chosen \?\? "speech"\)/.test(voice),
  )
  check(
    "a recogniser that fails before a word is heard hands the press to the recorder, which carries on",
    /const fallBackToRecording = React\.useCallback/.test(voice)
      && /if \(!heard && !failed && fallBackToRecording\(\)\) \{/.test(voice)
      && /if \(!refusal && !heard && fallBackToRecording\(\)\) \{/.test(voice)
      && /if \(fallBackToRecording\(\)\) return\n\s*setState\("idle"\)/.test(voice),
  )
  check(
    "  but a microphone that is off is not handed over: recording would ask the same question again",
    /const refusal = isPermissionError\(event\.error\)/.test(voice) && /if \(!recordReady \|\| fellBack\.current \|\| cancelled\.current\) return false/.test(voice),
  )
  check("with neither, no microphone is drawn at all", /const micButton = voice\.supported && \(/.test(chat))
  {
    const manifest = read("android/app/src/main/AndroidManifest.xml")
    const activity = read("android/app/src/main/java/com/storelib/app/MainActivity.java")
    const plist = read("ios/App/App/Info.plist")
    check(
      "the Android app declares the microphone, and says so to the page, which draws it only for an install that does",
      /android\.permission\.RECORD_AUDIO"/.test(manifest) &&
        /android\.permission\.MODIFY_AUDIO_SETTINGS"/.test(manifest) &&
        /android\.hardware\.microphone" android:required="false"/.test(manifest) &&
        /public boolean microphoneDeclared\(\) \{\s*\n\s*return true;/.test(activity) &&
        /if \(nativeWithoutMicrophone\(\)\) return/.test(voice) &&
        /return androidBridge\(\)\?\.microphoneDeclared\?\.\(\) !== true/.test(voice),
    )
    check(
      "iOS says what the microphone is for, and Storelib AI is named in it",
      /<key>NSMicrophoneUsageDescription<\/key>\s*\n\s*<string>[^<]*Storelib AI[^<]*<\/string>/.test(plist),
    )
    check(
      "the microphone is asked for on every press, never remembered, so the platform prompts whenever it is not allowed",
      /Asked on every press[^\n]*\n\s*const media = await navigator\.mediaDevices\.getUserMedia\(\{ audio: true \}\)/.test(voice),
    )
    check(
      "a refusal in the app offers its Settings page: app-settings: on iOS, App info on Android",
      /window\.location\.href = "app-settings:"/.test(voice) &&
        /ACTION_APPLICATION_DETAILS_SETTINGS/.test(activity) &&
        /canOpenSettings: refused && canOpenMicrophoneSettings\(\)/.test(voice) &&
        /\{voice\.canOpenSettings && \(/.test(chat) && /voice\.openSettings\(\)/.test(chat),
    )
  }
  check(
    "a permission refused is said in plain words, for the browser and for each app",
    /Microphone access is off for Storelib/.test(voice) && /Turn on Microphone for Storelib in Settings/.test(voice) && /Allow Microphone in Storelib's app permissions/.test(voice),
  )
  check("a microphone left on stops by itself after a minute", /VOICE_LIMIT_SECONDS = 60/.test(voice) && /if \(elapsed >= VOICE_LIMIT_SECONDS\) stop\(\)/.test(voice))
  check("and is let go when the chat goes", /React\.useEffect\(\(\) => \(\) => cancel\(\), \[cancel\]\)/.test(voice))
  check(
    "transcription is for a signed in creator, rate limited, capped in size, and keeps nothing",
    /if \(!creatorId\) return NextResponse\.json\(\{ error: "Sign in to use voice input\." \}, \{ status: 401 \}\)/.test(transcribe) &&
      /bucket: "ask-transcribe"/.test(transcribe) &&
      /audio\.size > MAX_AUDIO_BYTES/.test(transcribe) &&
      !/storage|\.insert\(/.test(transcribe),
  )
  check("the listening ring is transform and opacity, and still under reduced motion", /@keyframes ask-listen \{\s*\n\s*0% \{ transform: scale\(1\); opacity: 0\.45; \}/.test(css) && /\.ask-listen-ring \{ animation: none; opacity: 0; \}/.test(css))
}

// ---------------------------------------------------------------------------
section("On a phone")
// ---------------------------------------------------------------------------
{
  const attachments = read("components/website-builder/ask-attachments.tsx")
  check(
    "the AI sheet opens and closes in 320ms and is a composer sheet: it does not resize for a keyboard",
    /<MobileEditorSheet open=\{aiOpen\}[^\n]*moveMs=\{320\} keyboard="composer">/.test(editor) &&
      /const height = composerKeys \? detentHeight : sheetHeightWithKeyboard/.test(sheet),
  )
  check(
    "a sheet mounted open draws its first frame closed, backdrop clear, and moves on the next frame",
    /sheet\.style\.transform = `translateY\(\$\{closedY\}px\)`/.test(sheet) &&
      /overlay\.style\.opacity = "0"/.test(sheet) &&
      /enterFrame\.current = requestAnimationFrame\(/.test(sheet),
  )
  check(
    "only the composer's row rides the keyboard, on a transform, and the thread gets the same room at its end",
    /"--sheet-keys": `\$\{composerLift\}px`/.test(sheet) &&
      /transform: "translate3d\(0, calc\(-1 \* var\(--sheet-keys, 0px\)\), 0\)"/.test(chat) &&
      /data-ask-keys-room="" className="shrink-0" style=\{\{ height: "var\(--sheet-keys, 0px\)" \}\}/.test(chat) &&
      !/transition:[^\n]*height/.test(chat.slice(chat.indexOf("data-ask-footer"), chat.indexOf("data-ask-footer") + 1200)),
  )
  check(
    "a tap on the box focuses it without a scroll",
    /el\.focus\(\{ preventScroll: true \}\)/.test(chat) && /onTouchEnd=\{\s*\n\s*phone/.test(chat),
  )
  check("the composer's row has a soft shadow up onto the thread", /data-ask-footer=""\s*\n\s*className="relative z-\[1\][^"]*shadow-\[0_-1px_0/.test(chat))
  check("the thread reads a size up on a phone, a touch heavier", /const words = phone \? "text-\[15px\] font-\[450\]" : "text-\[13\.5px\]"/.test(chat))
  check(
    "a message sent and its answer rise into place; a thread read back does not",
    /const fresh = exchange\.startedAt !== undefined/.test(chat) && /@keyframes ask-in \{/.test(css) && /\.ask-in, \.ask-fade \{ animation: none; \}/.test(css),
  )
  check(
    "a picture holds its size with a shimmer and fades in once decoded",
    /export function FadeImage\(/.test(attachments) && /img\.decode\(\)/.test(attachments) && /<FadeImage/.test(chat) && /\.ask-shimmer::before \{/.test(css),
  )
  check(
    "a tap that began on a sheet cannot click the canvas: its made-up mouse events are held to the sheet",
    /window\.addEventListener\("click", onGhost, true\)/.test(sheet) && /if \(target && sheet\.contains\(target\)\)/.test(sheet),
  )
}

// ---------------------------------------------------------------------------
section("A creator only ever sees their own conversations")
// ---------------------------------------------------------------------------
{
  check(
    "both read routes prove the signed in creator owns the install before anything is read",
    [chatRoute, listRoute].every((r) => {
      const own = r.indexOf("await ownThemeInstall(installId)")
      const refuse = r.indexOf("if (!owned.ok)")
      const firstRead = Math.min(...["listThemeConversations(", "readThemeChat("].map((f) => r.indexOf(f)).filter((i) => i > 0))
      return own > 0 && refuse > own && firstRead > refuse
    }),
  )
  check(
    "ownership is the user's own client: their user, their creator, and an install with their creator id",
    (() => {
      const body = lib.slice(lib.indexOf("export async function ownThemeInstall"), lib.indexOf("export async function listThemeConversations"))
      return /await createClient\(\)/.test(body) && !/createAdminClient/.test(body) &&
        /\.eq\("creator_id", creatorId\)/.test(body) && /if \(!user\) return \{ ok: false, status: 401 \}/.test(body)
    })(),
  )
  check(
    "the list is read through the user's client, so the policy decides, and filtered to this install",
    (() => {
      const body = lib.slice(lib.indexOf("export async function listThemeConversations"), lib.indexOf("export function titleFrom"))
      return /await createClient\(\)/.test(body) && !/createAdminClient/.test(body) && /\.eq\("install_id", installId\)/.test(body)
    })(),
  )
  check(
    "a conversation id is opened only when it is in this install's own list",
    /const found = listed\.conversations\.find\(\(c\) => c\.id === asked\)/.test(chatRoute) && /if \(!found\) return NextResponse\.json\(\{ error: "That conversation is not on this website\." \}, \{ status: 404 \}\)/.test(chatRoute),
  )
  check(
    "one conversation's messages at a time",
    /if \(scope\.kind === "one"\) query = query\.eq\("conversation_id", scope\.id\)/.test(lib) && /else if \(scope\.kind === "earlier"\) query = query\.is\("conversation_id", null\)/.test(lib),
  )
  check(
    "a run writes into a conversation only when it is on the same install, and starts a new one otherwise",
    (() => {
      const body = lib.slice(lib.indexOf("export async function openThemeConversation"), lib.indexOf("async function touchConversation"))
      return /\.eq\("id", input\.requested\)\s*\n\s*\.eq\("install_id", input\.installId\)/.test(body) && /\.insert\(\{ install_id: input\.installId, title \}\)/.test(body)
    })(),
  )
  check(
    "the agent route opens it after proving ownership, and records both halves of the exchange in it",
    agentRoute.indexOf("const { data: install }") < agentRoute.indexOf("await openThemeConversation(") &&
      /startThemeExchange\(\{ installId, pageKey: body\.page, prompt: noted, conversationId \}\)/.test(agentRoute) &&
      /error: result\.status === "failed" \? result\.error : null,\s*\n\s*conversationId,/.test(agentRoute) &&
      /conversationId: z\.string\(\)\.uuid\(\)\.nullable\(\)\.optional\(\)/.test(agentRoute),
  )
  check(
    "and tells the panel which conversation it is in, first",
    /if \(conversation\) send\(\{ type: "conversation", id: conversation\.id, title: conversation\.title \}\)/.test(agentRoute) &&
      /event\.type === "conversation" && event\.id/.test(chat),
  )
  check(
    "a database without the conversations part still has its one thread, and says so",
    /const all = await readThemeChat\(installId\)[\s\S]{0,160}history: "not_set_up",\s*\n\s*messages: all\.messages,/.test(chatRoute) &&
      /\.\.\.\(input\.conversationId \? \{ conversation_id: input\.conversationId \} : \{\}\)/.test(lib),
  )
  check("the panel never posts to the transcript", !/method: "POST"[\s\S]{0,200}\/chat/.test(chat))
}

// ---------------------------------------------------------------------------
section("The database")
// ---------------------------------------------------------------------------
{
  const part = read("supabase/sql/run-now/24_theme_chat_conversations.sql")
  const lines = part.trim().split("\n")
  const migration = read("supabase/migrations/20260930_theme_chat_conversations.sql")
  const run = read("supabase/sql/RUN_THEME_CHAT_CONVERSATIONS.sql")
  const after = read("supabase/sql/run-now/99_check_after.sql")
  const readme = read("supabase/sql/run-now/README.md")
  check("the part opens with a one line note and then one whole statement per line", /^\/\* .* \*\/$/.test(lines[0]) && lines.slice(1).every((l) => /;\s*$/.test(l)))
  check(
    "every statement can run twice",
    lines.slice(1).every((l) => /IF NOT EXISTS|IF EXISTS|ENABLE ROW LEVEL SECURITY|^ALTER TABLE .* ADD CONSTRAINT|^CREATE POLICY|^DO \$\$ BEGIN IF NOT EXISTS/.test(l)) &&
      /DROP CONSTRAINT IF EXISTS theme_chat_messages_conversation_fk;\nALTER TABLE public\.theme_chat_messages ADD CONSTRAINT theme_chat_messages_conversation_fk/.test(part) &&
      /DROP POLICY IF EXISTS tcc_own_read ON public\.theme_chat_conversations;\nCREATE POLICY tcc_own_read/.test(part),
  )
  for (const [name, sql] of [["the part", part], ["the migration", migration], ["the RUN file", run]] as const) {
    const s = sql.toLowerCase()
    check(
      `${name}: a message's conversation must be on the message's own install`,
      /foreign key \(conversation_id, install_id\) references public\.theme_chat_conversations \(id, install_id\)/.test(s) &&
        /unique index if not exists theme_chat_conversations_id_install on public\.theme_chat_conversations \(id, install_id\)/.test(s),
    )
    check(
      `${name}: conversations are readable only through the ownership chain, and writable by no client`,
      /create policy tcc_own_read on public\.theme_chat_conversations for select using \(install_id in \(select i\.id from public\.store_theme_installs i join public\.creators c on c\.id = i\.creator_id where c\.user_id = auth\.uid\(\)\)\)/.test(s) &&
        /alter table public\.theme_chat_conversations enable row level security/.test(s) &&
        !/on public\.theme_chat_conversations for (insert|update|delete|all)/.test(s),
    )
  }
  check("99 has a column for it", /as p24_theme_chat_conversations/.test(after) && /theme_chat_conversations/.test(after))
  /* "Parts 01 to N" grows as later parts join (25, Analytics speed); 24 must be inside it. */
  check("and the README lists it", /\| `24_theme_chat_conversations\.sql` \|/.test(readme) && /Parts `01` to `(2[4-9]|[3-9]\d)`/.test(readme))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
