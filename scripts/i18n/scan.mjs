/**
 * ===========================================================================
 *  WHICH STRINGS A CREATOR READS
 * ===========================================================================
 * Shared by the check (scripts/check-i18n.mjs), the wrapper
 * (scripts/i18n/wrap.mjs) and the catalog builder (scripts/i18n/catalog.mjs),
 * so all three agree on what "a user-facing string" is.
 *
 * It reads the TypeScript syntax tree, not the text, and finds:
 *
 *   text       words between JSX tags: <p>No orders yet</p>
 *   attr       words in a JSX attribute a person reads: placeholder, title,
 *              aria-label, alt, label, any *Label, *Text, *Title ...
 *   jsx-expr   a string a JSX child chooses: {busy ? "Saving" : "Save"}
 *   call       the words given to a toast or an error line: toast("Saved"),
 *              setError("Could not save")
 *   prop       a label kept in a list: { id: "general", label: "Profile" }
 *   code       any other string shaped like a sentence or a capitalised
 *              word, outside comparisons, keys, classes, paths and the like
 *
 * Each finding says whether it is already translated: inside tt("..."), or
 * the existing t("dot.key") of lib/i18n, or a line marked i18n-ignore.
 */
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const ts = require("typescript")

/* ------------------------------------------------------------------------ */
/*  Scope                                                                    */
/* ------------------------------------------------------------------------ */

/** The creator dashboard and app: every file a creator's screen is drawn from. */
export const SCOPE_INCLUDE = [
  /^app\/\(storelib\)\/app\/.*\.tsx?$/,
  /^components\/app\/.*\.tsx?$/,
  /* Storelib Reviews managed on its integration page (round K5). */
  /^components\/reviews\/manage\/.*\.tsx?$/,
  /^components\/website-builder\/.*\.tsx?$/,
  /* The community's admin, the email composer, the OnePage editor, shipping and the rest /app draws. */
  /^components\/community\/(creator|learn|library)\/.*\.tsx?$/,
  /^components\/community\/membership\/refund-dialog\.tsx$/,
  /^components\/email\/compose\/.*\.tsx?$/,
  /^components\/onepage\/(onepage-editor|seo-panel|onboarding-modal|date-time-field|extra-blocks|creator-blocks|add-block-picker|color-picker|link-stats-chart|editor-kit|settings-integrations|page-integrations)\.tsx$/,
  /^components\/onepage\/tabs\/.*\.tsx$/,
  /^components\/physical\/(analytics-card|buy-label|carrier-live|carrier-picker|coupon-options|integrations-marketplace|order-panel|partner-links|product-cards|readiness-banner|readiness-checklist|shipping-app-facts|shipping-settings|ui|variant-options|variant-table)\.tsx$/,
  /^components\/memberships\/(creator-list|creator-screen|post-view)\.tsx$/,
  /^components\/files\/files-library\.tsx$/,
  /^components\/sites\/(new-site-flow|sites-dashboard)\.tsx$/,
  /^components\/billing\/(compare-plans|plan-cards|plan-faq)\.tsx$/,
  /^components\/support\/(case-photos|order-messages-card)\.tsx$/,
  /^components\/ui\/(responsive-action-menu|choice-list|bottom-sheet|save-notification|dialog)\.tsx$/,
]

/**
 * Not the creator's chrome: what a website's visitors see (the sections, the
 * theme, the cart, a live site's document) belongs to the website's own
 * languages (Markets and languages), and another worker owns the builder's
 * image field and colour scheme selector this round.
 */
export const SCOPE_EXCLUDE = [
  /\.test\.tsx?$/,
  /\.d\.ts$/,
  /^components\/website-builder\/sections\//,
  /^components\/website-builder\/theme\//,
  /^components\/website-builder\/compat\/compat-(canvas|section-preview|files)\./,
  /^components\/website-builder\/(site-cart|site-document|cart-page-body|coming-soon-signup|header-search-modal|checkout-return-notice|checkout-link-origin|plain-site-not-found)\./,
  /^components\/website-builder\/.*image[^/]*\.tsx?$/,
  /^components\/website-builder\/.*color-scheme[^/]*\.tsx?$/,
  /^app\/\(storelib\)\/app\/.*\/opengraph-image\.tsx$/,
]

/**
 * Library modules whose words the dashboard shows: order timelines, the
 * Home cards, report names, setup steps, the date presets.
 */
export const LIB_SCOPE = [
  /^lib\/orders\/(order-view|timeline|metrics|order-source)\.ts$/,
  /^lib\/home\/(progress|physical-setup|announcements)\.ts$/,
  /^lib\/analytics\/(reports|summary)\.ts$/,
  /^lib\/payments\/stripe\/status\.ts$/,
  /^lib\/search\/(app-pages|app-search)\.ts$/,
  /^lib\/settings\/explainers\.ts$/,
  /^lib\/billing\/plans\.ts$/,
  /^lib\/physical\/(readiness|providers|inventory-server-labels|packing-slip)\.ts$/,
  /^lib\/automations\/(templates|flow-model|merge-fields)\.ts$/,
  /^lib\/notify\/preference-view\.ts$/,
  /^lib\/github-sync\/editor-status\.ts$/,
  /^lib\/date-range\/range\.ts$/,
  /^lib\/products\/delete-client\.ts$/,
  /^lib\/store\/(reasons|tracking)\.ts$/,
  /^lib\/website-builder\/(save-problem|section-categories)\.ts$/,
  /^lib\/communities\/permissions\.ts$/,
  /^lib\/reviews\/rules\.ts$/,
  /^lib\/markets\/model\.ts$/,
  /^lib\/offers\/offers\.ts$/,
  /^lib\/emails\/customer-catalog\.ts$/,
  /^lib\/notifications\/panel\.ts$/,
  /^lib\/custom-domains\/dns-help\.ts$/,
  /^lib\/support\/(cases|tickets)\.ts$/,
  /^lib\/contacts\/contact-source\.ts$/,
  /^lib\/team\/roles\.ts$/,
  /^lib\/rich-text\/policy\.ts$/,
  /^lib\/net\/request\.ts$/,
]

export function inLibScope(rel) {
  return LIB_SCOPE.some((r) => r.test(rel))
}

export function inScope(rel) {
  return SCOPE_INCLUDE.some((r) => r.test(rel)) && !SCOPE_EXCLUDE.some((r) => r.test(rel))
}

/* ------------------------------------------------------------------------ */
/*  What reads as words                                                      */
/* ------------------------------------------------------------------------ */

/** Names that stay as they are in every language. */
export const NEVER_TRANSLATED = new Set([
  "Storelib", "Stripe", "PayPal", "OnePage", "Google", "Google Analytics", "Apple", "Apple Pay", "Google Pay", "Shopify", "Klaviyo", "Omnisend",
  "Mailchimp", "Gelato", "Printful", "Printify", "Zapier", "GitHub", "Facebook", "Instagram", "TikTok", "YouTube", "X", "LinkedIn", "Pinterest",
  "Discord", "Slack", "WhatsApp", "Telegram", "Meta", "Vercel", "Supabase", "Resend", "Airwallex", "Wise", "Revolut", "Visa", "Mastercard",
  "CSV", "PDF", "PNG", "JPG", "JPEG", "GIF", "SVG", "WebP", "MP4", "URL", "HTML", "CSS", "JSON", "API", "SEO", "SKU", "VAT", "ID", "DNS", "SSL",
  "OK", "AI", "Pro", "Plus", "Free", "Claude", "Anthropic", "OpenAI", "ChatGPT", "Gmail", "Outlook", "iOS", "Android", "Chrome", "Safari",
  "Etsy", "Gumroad", "Amazon", "eBay", "Canva", "Figma", "Notion", "Calendly", "Zoom", "Vimeo", "Spotify", "Twitch", "Patreon", "Substack",
  "Cloudflare", "GoDaddy", "Namecheap", "Squarespace", "Wix", "WordPress", "Webflow", "Framer", "Kajabi", "Teachable", "Thinkific",
  "UTC", "GMT", "EUR", "USD", "RON", "GBP", "lei", "Inter", "Markdown", "Liquid", "CJ", "CJdropshipping", "Gemini", "Mistral", "Grok",
])

const ENTITY = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", middot: "·", times: "×", copy: "©", rarr: "→", larr: "←", bull: "•", trade: "™", reg: "®", euro: "€", deg: "°" , minus: "\u2212", check: "\u2713", thinsp: "\u2009", laquo: "\u00ab", raquo: "\u00bb", uarr: "\u2191", darr: "\u2193", plusmn: "\u00b1", pound: "\u00a3", sect: "\u00a7" }

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    return ENTITY[e] ?? ENTITY[e.toLowerCase()] ?? m
  })
}

/** JSX's own whitespace rule: lines trimmed, blank lines dropped, joined by a space. */
export function jsxTextValue(raw) {
  const lines = raw.split(/\r?\n/)
  if (lines.length === 1) return decodeEntities(raw)
  const out = []
  lines.forEach((line, i) => {
    let l = line.replace(/\t/g, " ")
    if (i > 0) l = l.replace(/^\s+/, "")
    if (i < lines.length - 1) l = l.replace(/\s+$/, "")
    if (l) out.push(l)
  })
  return decodeEntities(out.join(" "))
}

const hasLetter = (s) => /\p{L}/u.test(s)

/**
 * Values that hold letters but are never words, even with a capital:
 * font stacks, CSS filters and transitions, SVG keywords, cookie
 * attributes, inline scripts, query pairs and tag selectors.
 */
export function isNeverWords(raw) {
  const s = raw.trim()
  if (/,/.test(s) && /(^|,)\s*["']?(sans-serif|serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace)["']?\s*$/.test(s)) return true
  if (/^x(Min|Mid|Max)Y(Min|Mid|Max)( (slice|meet))?$/.test(s)) return true
  if (/^(brightness|contrast|saturate|grayscale|sepia|hue-rotate|invert|opacity|path)\(/.test(s)) return true
  /* A transition list: "background-color {ease}, box-shadow {ease}" (x where a value was). */
  if (/^[a-z]+(-[a-z]+)+ (\{\w+\}|x)(, [a-z]+(-[a-z]+)* (\{\w+\}|x))*$/.test(s)) return true
  if (/^(layout|paint|style|size|strict|content|inline-size)( (layout|paint|style|size|inline-size))*$/.test(s)) return true
  if (/^;\s*[A-Z][\w-]*(=|$)/.test(s)) return true
  if (/^\w+=[\w,-]*$/.test(s)) return true
  if (/^(table|thead|tbody|tfoot|tr|th|td|div|span|li|ul|ol|button|input|svg|img)( [a-z]+)+$/.test(s)) return true
  if (/\btry\s*\{|\bcatch\s*\(|\bdocument\.\w+/.test(s)) return true
  return false
}

/**
 * A string in code is words when it is shaped like a sentence or a label a
 * person reads, and not a class list, a path, a key, a format or a code.
 */
export function looksLikeWords(raw) {
  const s = raw.trim()
  if (!s || !hasLetter(s)) return false
  if (s.length > 600) return false
  if (isNeverWords(s)) return false
  /* Markup, SVG path data, data URLs, CSS selectors. */
  if (/^\s*</.test(s) && />\s*$/.test(s)) return false
  if (/^[MmLlHhVvCcSsQqTtAaZz][\d\s.,MmLlHhVvCcSsQqTtAaZz-]*$/.test(s) && /\d/.test(s)) return false
  if (/data:image|xmlns|%3C|%22/.test(s)) return false
  if (/^[\w\-#.:[\]=*"'>~+ ,()]+$/.test(s) && /\[[\w-]+(=[^\]]*)?\]|^\w+\[|:(hover|focus|not|has|is)\(/.test(s)) return false
  /* Code in a string: a shader, a script, a selector. */
  if (/;\s*\S/.test(s) && /\b(void|vec[234]|uniform|attribute|varying|function|return|const|var|let)\b|=>|\{\s*$/.test(s)) return false
  if (/^(Authorization|Content-Type|Accept|Cache-Control|Bearer|Basic)\b/.test(s)) return false
  if (NEVER_TRANSLATED.has(s)) return false
  if (/^(use client|use server|use strict)$/.test(s)) return false
  if (/^[a-z][\w-]*:\/\/|^mailto:|^tel:|^www\./i.test(s)) return false
  if (/^[./#?@~]/.test(s) || /^\w+\/[\w.+-]+$/.test(s)) return false
  if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(s)) return false
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return false
  if (/^(rgba?|hsla?|var|calc|url|linear-gradient|radial-gradient|cubic-bezier|translate\w*|scale\w*|rotate\w*|matrix\w*|perspective|skew\w*|env|min|max|clamp|inset|polygon|circle|ellipse|blur|drop-shadow|steps|attr)\(/i.test(s)) return false
  /* CSS with its numbers interpolated: "0 xpx", "color xms x", "brightness(x%) blur(xpx)". */
  if (!/[A-Z]/.test(s) && /(\d|\bx)(px|ms|deg|vh|vw|dvh|svh|rem|em|%)(?![a-z])/.test(s) && !/[.!?]$/.test(s)) return false
  if (/^[a-z]+:[a-z]+(, [a-z]+:[a-z]+)+$/.test(s)) return false
  /* CSS values and transitions: no capital, with a unit or a timing word. */
  if (!/[A-Z]/.test(s) && /(\d(px|ms|s|%|dvh|svh|vh|vw|rem|em|deg|fr)\b|\b(ease|ease-in|ease-out|linear|cubic-bezier|transform|opacity|visibility|inherit|transparent|currentColor|auto|none|solid|dashed|bold|italic|underline|uppercase|nowrap|pointer|block|flex|grid|absolute|relative|fixed|sticky|hidden|visible|scroll|contain|cover|center)\b)/.test(s) && !/[.!?]$/.test(s)) return false
  if (/^\d/.test(s) && !/\s\p{L}{3,}/u.test(s)) return false
  /* Tailwind and class lists: lowercase tokens with -, :, [ or / in them. */
  const tokens = s.split(/\s+/)
  if (!/[A-Z]/.test(s) || tokens.every((t) => /^[!\w-]*[-:[\]/][\S]*$/.test(t) || /^[a-z0-9!]+$/.test(t))) {
    if (tokens.some((t) => /[-:[\]/]/.test(t)) && tokens.every((t) => !/[.,;!?]$/.test(t) || /\]/.test(t))) return false
  }
  if (/\[[^\]]*\]|\b(px|rem|em|vh|vw|ms|deg)\b/.test(s) && /^[\w\s.:[\]#(),%/-]+$/.test(s) && !/[A-Z][a-z]+\s[a-z]+\s/.test(s)) return false
  /* An identifier, a constant, a dotted key, a snake or kebab name, camelCase. */
  if (/^[A-Za-z_$][\w$]*$/.test(s)) {
    if (/^[A-Z][a-z']+$/.test(s)) return true /* "Paid", "Draft" */
    if (/^[A-Z][a-z]+[A-Z]/.test(s)) return false /* PascalCase component names */
    if (/^[a-z]/.test(s)) return false
    if (/^[A-Z0-9_]+$/.test(s)) return false
    return false
  }
  if (/^[\w$]+([.:/][\w$-]+)+$/.test(s)) return false
  if (/^[a-z0-9]+([-_][a-z0-9]+)+$/.test(s)) return false
  /* SQL column lists and query strings: "id, title, status". */
  if (/^[a-z_*]+(\s*,\s*[a-z_*()!:]+)+$/.test(s)) return false
  /* PostgREST selects: "id, name, buyer:profiles!buyer_id(display_name, avatar_url)". */
  if (!/[A-Z]/.test(s) && /^[\w\s,*:!().]+$/.test(s) && /_/.test(s) && /,/.test(s) && !/[.?!]\s*$/.test(s)) return false
  if (/^[a-z_]+\s*(asc|desc)$/i.test(s)) return false
  /* Date and number format strings. */
  if (/^[yMdHhmsaEZ:\-/., ]+$/.test(s) && /(yy|MM|dd|HH|mm)/.test(s)) return false
  /* Lowercase without a space is a code ("draft", "paid") rather than words. */
  if (!/\s/.test(s) && !/[A-Z]/.test(s)) return false
  /* All lowercase words with no punctuation and no capital: often a value
     ("in stock" can be words, but "image/png" or "noopener noreferrer" not). */
  if (/^(noopener|noreferrer|nofollow|sans-serif|serif|monospace|anonymous|use-credentials|same-origin|no-store|no-cache)(\s|$)/.test(s)) return false
  if (/^[a-z]+( [a-z]+)*$/.test(s) && tokens.length <= 3 && !/^(no|not|and|or|the|a|an|in|on|of|to|for|with|by|at|from|this|that|your|my|all|any|some)\b/.test(s)) {
    /* lowercase two or three words: keep as words only when it reads as a phrase */
    if (tokens.length === 1) return false
  }
  if (/^[A-Z][A-Z0-9_]+( [A-Z0-9_]+)*$/.test(s) && s.length <= 5) return false
  /* Brand and code lists made of never-translated names only. */
  if (tokens.every((t) => NEVER_TRANSLATED.has(t.replace(/[,.]$/, "")))) return false
  return true
}

/* ------------------------------------------------------------------------ */
/*  The tree walk                                                            */
/* ------------------------------------------------------------------------ */

const USER_ATTR = /^(placeholder|title|alt|label|aria-label|aria-description|aria-valuetext|aria-roledescription|description|heading|subheading|subtitle|caption|hint|helper|helperText|tooltip|message|empty|emptyText|emptyTitle|emptyMessage|emptyLabel|confirm|confirmText|confirmLabel|cancelLabel|cancelText|actionLabel|buttonLabel|submitLabel|saveLabel|doneLabel|backLabel|nextLabel|prefix|suffix|unit|note|line|detail|summary|question|body|text|name|cta|ctaLabel|badge|tag|chip|status|statusLabel|error|success|warning|info|loadingLabel|loadingText|savingLabel|header|footer|legend|instructions|explanation|lead|kicker|eyebrow|sub|subtext|blurb|tip|more|less|done|why|what|[a-z]+(Label|Text|Title|Heading|Description|Placeholder|Hint|Message|Caption|Line|Note|Tooltip|Name|Copy|Words|Blurb|Detail|Error|Notice|Prompt|Question|Answer|Cta|Action))$/
const NOT_USER_ATTR = /^(className|class|id|key|href|src|srcSet|type|value|defaultValue|role|style|target|rel|as|method|action|htmlFor|name|autoComplete|inputMode|enterKeyHint|pattern|accept|form|variant|size|side|align|sideOffset|mode|tone|kind|icon|color|fill|stroke|d|viewBox|xmlns|points|transform|data-.*|loading|decoding|fetchPriority|sizes|media|lang|dir|tabIndex|download|crossOrigin|referrerPolicy|sandbox|allow|frameBorder|scrolling|preload|poster|capture|wrap|spellCheck|autoCapitalize|autoCorrect|step|min|max|minLength|maxLength|rows|cols|width|height|x|y|cx|cy|r|rx|ry|x1|x2|y1|y2|offset|stopColor|gradientUnits|clipPath|mask|filter|strokeWidth|strokeLinecap|strokeLinejoin|fillRule|clipRule|path|url|route|slug|field|column|section|tab|panel|group|area|zone|timeZone|locale|currency|format|placement|position|direction|orientation|layout|look|shape|state|eventName|event|track|analytics|testId|aria-controls|aria-labelledby|aria-describedby|aria-haspopup|aria-current|aria-live|aria-expanded|aria-selected|aria-checked|aria-pressed|aria-hidden|aria-modal|aria-orientation|aria-autocomplete|aria-activedescendant|aria-invalid|aria-busy|aria-disabled|aria-owns|aria-atomic|aria-relevant|aria-errormessage|aria-keyshortcuts)$/

const USER_PROP = /^(label|title|description|placeholder|hint|heading|subheading|subtitle|message|text|line|detail|details|empty|emptyText|emptyTitle|cta|ctaLabel|tooltip|help|helpText|caption|confirm|confirmLabel|error|success|summary|body|question|answer|note|actionLabel|buttonLabel|short|long|info|warning|blurb|lead|sub|subtext|tagline|explanation|why|what|when|how|reason|instruction|instructions|prompt|headline|kicker|eyebrow|badge|statusLabel|done|doneLabel|saving|saved|title2|aria|ariaLabel|alt|unitLabel|plural|singular|[a-z]+(Label|Text|Title|Heading|Description|Placeholder|Hint|Message|Caption|Line|Note|Tooltip|Copy|Words|Blurb|Detail|Error|Notice|Prompt|Question|Answer|Cta|Sub|Lead|Body|Summary))$/

const USER_CALL = /^(toast|toast\.(success|error|info|warning|message|loading|promise)|notify|notice|setError|setErrors|setNotice|setMessage|setToast|showToast|showError|showNotice|setStatusText|setStatusLine|setHint|setWarning|setInfo|setProblem|setFailure|setFeedback|setAnnouncement|announce|announceChange|say|alert|confirm|window\.confirm|window\.alert|setLabel|setTitle|setCaption|setDescription|setHelp|flash|report|fail|setErr|setErrorText|setErrorMessage|setSaveError|setFormError|setFieldError|setUploadError|setDeleteError|setNoticeText|setBanner|setDone)$/

/** Calls whose string arguments are never words a creator reads. */
const TECH_CALL = /^(cn|clsx|cx|twMerge|classNames|cva|console\.\w+|require|import|fetch|postJson|getJson|putJson|patchJson|del|querySelector|querySelectorAll|closest|matches|getAttribute|setAttribute|removeAttribute|hasAttribute|addEventListener|removeEventListener|dispatchEvent|CustomEvent|Event|getItem|setItem|removeItem|localStorage\.\w+|sessionStorage\.\w+|parseInt|parseFloat|Number|String|Boolean|Symbol|BigInt|Date|RegExp|URL|URLSearchParams|Headers|Request|Response|Blob|File|FormData|Intl\.\w+|encodeURIComponent|decodeURIComponent|encodeURI|decodeURI|escape|unescape|btoa|atob|setTimeout|setInterval|requestAnimationFrame|useState|useRef|useMemo|useCallback|useReducer|useContext|createContext|forwardRef|memo|lazy|dynamic|redirect|notFound|permanentRedirect|revalidatePath|revalidateTag|cookies|headers|useSearchParams|usePathname|useRouter|useParams|createClient|from|storage|tt|t|getT|getServerT|getTranslation|dict|translate|keyOf|track|trackEvent|sendEvent|logEvent|captureException|captureMessage|reportError|playSound|haptic|vibrate|announceAvatar|startNavigationLoading|prefetchAppPage|openExternal|open|assertNever|invariant|expect|describe|it|test|check|eq|ok|equal|deepEqual|strictEqual|throws|rejects|match|includes|has|is)$/
const TECH_METHOD = /^(get|set|has|delete|append|getAll|includes|startsWith|endsWith|indexOf|split|replace|replaceAll|match|test|search|padStart|padEnd|join|toLowerCase|toUpperCase|localeCompare|lastIndexOf|from|select|eq|neq|in|is|order|or|not|filter|match|ilike|like|gte|lte|gt|lt|contains|rpc|upload|download|remove|createSignedUrl|getPublicUrl|channel|on|subscribe|replace|prefetch|refresh|redirect|pushState|replaceState|postMessage|matchMedia|toLocaleString|toLocaleDateString|toLocaleTimeString|format|formatToParts|of|animate|scrollTo|scrollIntoView|focus|createElement|createTextNode|insertAdjacentHTML|setProperty|getPropertyValue|removeProperty|add|toggle|contains|item|key|call|apply|bind|emit|send|track|capture|identify|log|warn|debug|trace|mark|measure|getEntriesByName|observe|unobserve|disconnect|then|catch|finally|resolve|reject|stringify|parse|assign|keys|values|entries|freeze|defineProperty)$/

/**
 * Bindings that are themselves translations, so nothing inside is reported.
 * ct is the website checkout's translator (app/(storelib)/checkout/parts/words.tsx): its
 * sentences are the website's, listed by scripts/i18n/checkout-sentences.mjs.
 */
const TRANSLATED_CALL = /^(tt|ttx|msg|t|ct|getT|getServerT|getTranslation|translate|tn|tp)$/

function calleeName(expr) {
  if (ts.isIdentifier(expr)) return expr.text
  if (ts.isPropertyAccessExpression(expr)) {
    const left = calleeName(expr.expression)
    const right = expr.name.text
    if (!left) return `*.${right}`
    return `${left}.${right}`
  }
  if (ts.isCallExpression(expr)) return calleeName(expr.expression)
  if (ts.isElementAccessExpression(expr)) return calleeName(expr.expression)
  if (expr.kind === ts.SyntaxKind.ThisKeyword) return "this"
  return ""
}

function propName(name) {
  if (!name) return ""
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) || ts.isPrivateIdentifier?.(name)) return name.text
  return ""
}

function attrName(attr) {
  const n = attr.name
  if (ts.isIdentifier(n)) return n.text
  if (n.kind === ts.SyntaxKind.JsxNamespacedName) return `${n.namespace.text}:${n.name.text}`
  return n.getText()
}

function isTechCall(name) {
  if (!name) return false
  if (TECH_CALL.test(name)) return true
  if (!name.includes(".")) return false
  return TECH_METHOD.test(name.split(".").pop())
}

/**
 * Walk up from a string and decide whether it sits where a person reads it.
 * Returns the kind of position, or null for code.
 */
function positionOf(node, sf) {
  let child = node
  let parent = node.parent
  /* Climb through expressions that only choose between strings. */
  for (;;) {
    if (!parent) return null
    if (ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent) || ts.isNonNullExpression(parent) || ts.isSatisfiesExpression?.(parent) || ts.isTypeAssertionExpression?.(parent)) {
      child = parent; parent = parent.parent; continue
    }
    if (ts.isConditionalExpression(parent) && child !== parent.condition) { child = parent; parent = parent.parent; continue }
    if (ts.isBinaryExpression(parent)) {
      const op = parent.operatorToken.kind
      if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken || (op === ts.SyntaxKind.AmpersandAmpersandToken && child === parent.right)) { child = parent; parent = parent.parent; continue }
      if (op === ts.SyntaxKind.PlusToken) { child = parent; parent = parent.parent; continue }
      return null
    }
    if (ts.isTemplateSpan(parent)) { child = parent.parent; parent = parent.parent.parent; continue }
    break
  }
  if (ts.isJsxExpression(parent)) {
    const p = parent.parent
    if (p && ts.isJsxAttribute(p)) {
      const n = attrName(p)
      if (NOT_USER_ATTR.test(n) && !USER_ATTR.test(n)) return null
      return USER_ATTR.test(n) ? "attr" : looksLikeWordsNode(node) ? "attr?" : null
    }
    return "jsx-expr"
  }
  if (ts.isJsxAttribute(parent)) {
    const n = attrName(parent)
    if (NOT_USER_ATTR.test(n) && !USER_ATTR.test(n)) return null
    return USER_ATTR.test(n) ? "attr" : looksLikeWordsNode(node) ? "attr?" : null
  }
  if (ts.isPropertyAssignment(parent) && parent.initializer === child) {
    const n = propName(parent.name)
    if (USER_PROP.test(n)) return "prop"
    if (/^(id|key|value|href|src|type|kind|slug|path|url|icon|className|class|tone|variant|color|tab|section|code|event|name|field|column|status|state|mode|format|unit|currency|locale|timeZone|role|method|route|as|target|rel|ref|group)$/.test(n)) return null
    return "code"
  }
  if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) {
    const name = calleeName(parent.expression)
    if (parent.expression === child) return null
    if (TRANSLATED_CALL.test(name)) return null
    if (USER_CALL.test(name)) return "call"
    if (isTechCall(name)) return null
    if (ts.isNewExpression(parent) && /Error$/.test(name)) return "error"
    return "code"
  }
  if (ts.isReturnStatement(parent) || ts.isArrowFunction(parent)) return "code"
  if (ts.isVariableDeclaration(parent) && parent.initializer === child) return "code"
  if (ts.isArrayLiteralExpression(parent)) return "code"
  if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken && parent.right === child) return "code"
  if ((ts.isBindingElement(parent) || ts.isParameter(parent)) && parent.initializer === child) {
    const n = ts.isIdentifier(parent.name) ? parent.name.text : parent.propertyName && ts.isIdentifier(parent.propertyName) ? parent.propertyName.text : ""
    return USER_PROP.test(n) || USER_ATTR.test(n) ? "prop" : null
  }
  if (ts.isShorthandPropertyAssignment(parent)) return null
  if (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) return null
  if (ts.isCaseClause(parent) || ts.isSwitchStatement(parent)) return null
  if (ts.isThrowStatement(parent)) return "error"
  return null
}

function looksLikeWordsNode(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return looksLikeWords(node.text)
  if (ts.isTemplateExpression(node)) return looksLikeWords(templateMessage(node).message.replace(/\{\w+\}/g, "x"))
  return false
}

/** Is this node already inside a translation call? */
function insideTranslation(node) {
  let p = node.parent
  while (p) {
    if (ts.isCallExpression(p) && TRANSLATED_CALL.test(calleeName(p.expression))) return true
    if (ts.isTaggedTemplateExpression(p)) return true
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isImportTypeNode?.(p) || ts.isLiteralTypeNode(p) || ts.isTypeNode?.(p)) return true
    if (ts.isExternalModuleReference?.(p)) return true
    p = p.parent
  }
  return false
}

/**
 * Strings a file compares against (===, case, includes): wrapping one of
 * these where it is made would break the comparison, so the wrapper leaves
 * those for a person.
 */
export function comparedStrings(sf) {
  const out = new Set()
  const visit = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const p = n.parent
      if (p && ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(p.operatorToken.kind)) out.add(n.text)
      if (p && ts.isCaseClause(p)) out.add(n.text)
      if (p && ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && /^(includes|has|indexOf|startsWith|endsWith)$/.test(p.expression.name.text)) out.add(n.text)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

/** Names bound in the file that would shadow an imported tt. */
export function bindsTt(sf) {
  let found = false
  const visit = (n) => {
    if (found) return
    if ((ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n) || ts.isFunctionDeclaration(n)) && n.name && ts.isIdentifier(n.name) && n.name.text === "tt") {
      /* The server's own tt (const { tt } = await getServerTt()) is ours too. */
      let decl = n.parent
      while (decl && !ts.isVariableDeclaration(decl) && !ts.isSourceFile(decl)) decl = decl.parent
      const ours = decl && ts.isVariableDeclaration(decl) && decl.initializer && /getServerTt\(/.test(decl.initializer.getText())
      if (!ours) found = true
    }
    if (ts.isImportSpecifier(n) && n.name.text === "tt" && !(ts.isStringLiteral(n.parent.parent.parent.moduleSpecifier) && n.parent.parent.parent.moduleSpecifier.text === "@/lib/i18n/text")) found = true
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return found
}

/** A name for an interpolated value, the way a translator reads it. */
export function placeholderName(expr, used) {
  let base = ""
  let e = expr
  while (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression(e)) e = e.expression
  if (ts.isIdentifier(e)) base = e.text
  else if (ts.isPropertyAccessExpression(e)) base = e.name.text
  else if (ts.isCallExpression(e)) {
    const n = calleeName(e.expression).split(".").pop() || ""
    if (/date|day|when|time/i.test(n)) base = /time/i.test(n) && !/date/i.test(n) ? "time" : "date"
    else if (/money|price|amount|currency|cents/i.test(n)) base = "amount"
    else if (/count|number|num|plural/i.test(n)) base = "count"
    else if (/name|label|title/i.test(n)) base = "name"
    else if (e.arguments.length === 1 && (ts.isIdentifier(e.arguments[0]) || ts.isPropertyAccessExpression(e.arguments[0]))) base = placeholderName(e.arguments[0], new Set())
  } else if (ts.isElementAccessExpression(e)) base = ts.isIdentifier(e.expression) ? e.expression.text : ""
  else if (ts.isTemplateExpression(e)) base = "text"
  else if (ts.isConditionalExpression(e)) base = "value"
  if (/^[A-Z0-9_]+$/.test(base)) base = base.toLowerCase().replace(/_(label|labels|name|names|text)$/, "").replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
  base = base.replace(/^(get|format|to)(?=[A-Z])/, "").replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/[^\w]/g, "")
  if (!base || !/^[A-Za-z_]\w*$/.test(base) || base.length > 24) base = "value"
  let name = base
  let i = 2
  while (used.has(name)) name = `${base}${i++}`
  used.add(name)
  return name
}

/** A message with each {placeholder} (plurals too, braces balanced) said as "x". */
export function flattenMessage(message) {
  let out = ""
  let depth = 0
  for (const c of message) {
    if (c === "{") {
      if (depth === 0) out += "x"
      depth++
    } else if (c === "}") depth = Math.max(0, depth - 1)
    else if (depth === 0) out += c
  }
  return out
}

function unwrapExpr(e) {
  while (e && (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression(e))) e = e.expression
  return e
}

/** `n === 1 ? "order" : "orders"`: the number and its two words, or null. */
export function pluralParts(expr) {
  const e = unwrapExpr(expr)
  if (!e || !ts.isConditionalExpression(e)) return null
  const c = unwrapExpr(e.condition)
  if (!ts.isBinaryExpression(c)) return null
  const K = ts.SyntaxKind
  const op = c.operatorToken.kind
  const isOne = (n) => ts.isNumericLiteral(unwrapExpr(n)) && unwrapExpr(n).text === "1"
  let subject = null
  let oneFirst = true
  if ((op === K.EqualsEqualsEqualsToken || op === K.EqualsEqualsToken) && isOne(c.right)) subject = c.left
  else if ((op === K.EqualsEqualsEqualsToken || op === K.EqualsEqualsToken) && isOne(c.left)) subject = c.right
  else if ((op === K.ExclamationEqualsEqualsToken || op === K.ExclamationEqualsToken || op === K.GreaterThanToken) && isOne(c.right)) {
    subject = c.left
    oneFirst = false
  } else return null
  const str = (n) => {
    const u = unwrapExpr(n)
    return ts.isStringLiteral(u) || ts.isNoSubstitutionTemplateLiteral(u) ? u.text : null
  }
  const a = str(e.whenTrue)
  const b = str(e.whenFalse)
  if (a === null || b === null) return null
  if (/[{}#]/.test(a + b)) return null
  return { subject, one: oneFirst ? a : b, other: oneFirst ? b : a }
}

/** Does this value show `subject` (itself, or formatted by a one-argument call)? */
function showsSubject(expr, subject) {
  const e = unwrapExpr(expr)
  const want = unwrapExpr(subject).getText()
  if (e.getText() === want) return true
  if (ts.isCallExpression(e)) {
    if (e.arguments.length >= 1 && unwrapExpr(e.arguments[0]).getText() === want && e.arguments.length === 1) return true
    if (ts.isPropertyAccessExpression(e.expression) && /^(toLocaleString|toString|toFixed)$/.test(e.expression.name.text) && unwrapExpr(e.expression.expression).getText() === want) return true
  }
  return false
}

/**
 * Add one interpolated value to a message being built, folding an English
 * plural into ICU: "{count} {count === 1 ? "order" : "orders"}" becomes
 * "{count, plural, one {# order} other {# orders}}", and "chat{n === 1 ? "" : "s"}"
 * "{n, plural, one {chat} other {chats}}".
 */
export function appendValue(state, expr) {
  const p = pluralParts(expr)
  if (!p) {
    const name = placeholderName(expr, state.used)
    state.message += `{${name}}`
    state.values.push([name, expr])
    return
  }
  /* The number already in the sentence, just before. */
  let name = null
  let idx = -1
  for (let i = state.values.length - 1; i >= 0; i--) {
    if (showsSubject(state.values[i][1], p.subject)) {
      name = state.values[i][0]
      idx = i
      break
    }
  }
  if (!name) {
    name = placeholderName(p.subject, state.used)
    state.values.push([name, p.subject])
  } else {
    /* The plural counts the raw number; # writes it in the language's own digits. */
    state.values[idx] = [name, p.subject]
  }
  if (p.one === "" && /^(s|es)$/.test(p.other)) {
    const m = state.message.match(/(\{\w+\} )?(\p{L}[\p{L}'-]*)$/u)
    if (m) {
      const lead = m[1] === `{${name}} ` ? "# " : m[1] ?? ""
      state.message = state.message.slice(0, state.message.length - m[0].length) + `{${name}, plural, one {${lead}${m[2]}} other {${lead}${m[2]}${p.other}}}`
      return
    }
  }
  const tail = `{${name}} `
  if (state.message.endsWith(tail)) {
    state.message = state.message.slice(0, -tail.length) + `{${name}, plural, one {# ${p.one}} other {# ${p.other}}}`
    return
  }
  state.message += `{${name}, plural, one {${p.one}} other {${p.other}}}`
}

/** `Receipt emailed ${date}` → { message: "Receipt emailed {date}", values: [[date, expr]] } */
export function templateMessage(node) {
  const state = { used: new Set(), message: node.head.text, values: [] }
  for (const span of node.templateSpans) {
    appendValue(state, span.expression)
    state.message += span.literal.text
  }
  return { message: state.message, values: state.values }
}

/** A JSX child expression that can be an interpolated value inside a sentence. */
export function isInlineValue(expr) {
  if (!expr) return false
  if (pluralParts(expr)) return true
  let e = expr
  while (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression(e)) e = e.expression
  if (ts.isIdentifier(e)) return !/^[A-Z]/.test(e.text) && !/(icon|Icon|node|Node|element|Element|children|content|Content|slot|Slot|jsx|badge|Badge|chip|button|Button|menu|Menu|link|Link|mark|Mark)$/.test(e.text)
  if (ts.isPropertyAccessExpression(e)) return !/(icon|Icon|node|Node|element|Element|children|content|Content|jsx|Badge|badge|chip|button|link|Link|mark)$/.test(e.name.text)
  if (ts.isNumericLiteral(e)) return true
  /* index + 1, total - done */
  if (ts.isBinaryExpression(e) && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken].includes(e.operatorToken.kind)) {
    const side = (x) => {
      const u = unwrapExpr(x)
      return ts.isNumericLiteral(u) || ts.isIdentifier(u) || ts.isPropertyAccessExpression(u)
    }
    return side(e.left) && side(e.right) && (ts.isNumericLiteral(unwrapExpr(e.left)) || ts.isNumericLiteral(unwrapExpr(e.right)) || e.operatorToken.kind !== ts.SyntaxKind.PlusToken)
  }
  if (ts.isCallExpression(e)) {
    const n = calleeName(e.expression).split(".").pop() || ""
    return /^(format\w*|\w*Date\w*|\w*Time\w*|\w*Money\w*|\w*Price\w*|\w*Count\w*|\w*Number\w*|\w*Amount\w*|\w*Label|\w*Name|\w*Text|String|toLocaleString|toLocaleDateString|toLocaleTimeString|toFixed|toString|join|trim|plural\w*|percent\w*|money|price|ago|relative\w*|when|since|until)$/i.test(n) && !/^(render|use)/.test(n)
  }
  return false
}

/**
 * Every user-facing string in one file, with whether it is translated.
 *
 * finding: { kind, text, start, end, line, translated, node }
 *   text runs merge "You have {count} orders" across JSX children.
 */
/** "item"/"items" is a plural; "single"/"multi" or "1fr"/"2fr" is a value. */
function looksLikeCodePair(a, b) {
  const w = (x) => x.trim()
  return !(w(b).startsWith(w(a)) || w(a).startsWith(w(b)) || /\s/.test(a + b)) || /[-_/:[\]]|\d/.test(a + b)
}

export function scanSource(sourceText, fileName = "file.tsx") {
  const sf = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const findings = []
  const lines = sourceText.split("\n")
  const ignoredLines = new Set()
  let fileIgnored = false
  let inBlock = false
  lines.forEach((l, i) => {
    if (/i18n-ignore-file/.test(l)) fileIgnored = true
    /* i18n-ignore-start ... i18n-ignore-end: a list of names or fallbacks, not words. */
    if (/i18n-ignore-start/.test(l)) inBlock = true
    if (/i18n-ignore-end/.test(l)) inBlock = false
    if (inBlock) ignoredLines.add(i)
    if (/i18n-ignore-next-line/.test(l)) ignoredLines.add(i + 1)
    if (/i18n-ignore(?!-)/.test(l)) ignoredLines.add(i)
  })
  if (fileIgnored) return { sf, findings: [] }
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line
  const ignored = (node) => ignoredLines.has(lineOf(node.getStart(sf)))
  const push = (f) => {
    if (ignored(f.node)) f.ignored = true
    f.line = lineOf(f.node.getStart(sf)) + 1
    findings.push(f)
  }
  const seenText = new Set()

  function visitChildren(parent) {
    /* Runs of text and inline values among JSX children. */
    const kids = parent.children
    let run = []
    const flush = () => {
      const texts = run.filter((k) => ts.isJsxText(k) && hasLetter(jsxTextValue(k.text).trim()))
      if (texts.length) {
        /* Trim the run's edges to the parts that hold words or values. */
        while (run.length && ts.isJsxText(run[0]) && !jsxTextValue(run[0].text).trim()) run.shift()
        while (run.length && ts.isJsxText(run[run.length - 1]) && !jsxTextValue(run[run.length - 1].text).trim()) run.pop()
        const state = { used: new Set(), message: "", values: [] }
        run.forEach((k, i) => {
          if (ts.isJsxText(k)) {
            let v = jsxTextValue(k.text)
            if (i === 0) v = v.replace(/^\s+/, "")
            if (i === run.length - 1) v = v.replace(/\s+$/, "")
            state.message += v
          } else appendValue(state, k.expression)
        })
        let message = state.message
        const values = state.values
        message = message.replace(/[ \t]+/g, " ")
        /* A separator at either end stays outside: " · Refunded" is "·" and "Refunded". */
        let lead = ""
        let trail = ""
        if (ts.isJsxText(run[0])) {
          const m = message.match(/^[·•|—–]\s*/)
          if (m) {
            lead = m[0]
            message = message.slice(lead.length)
          }
        }
        if (ts.isJsxText(run[run.length - 1])) {
          const m = message.match(/\s*[·•|—–]$/)
          if (m) {
            trail = m[0]
            message = message.slice(0, -trail.length)
          }
        }
        const translatable = looksLikeTextRun(message)
        for (const k of run) seenText.add(k)
        if (translatable) push({ kind: "text", text: message, lead, trail, node: run[0], nodes: [...run], values, start: run[0].getStart(sf), end: run[run.length - 1].getEnd(), translated: false })
      }
      run = []
    }
    for (const k of kids) {
      if (ts.isJsxText(k)) run.push(k)
      else if (ts.isJsxExpression(k) && k.expression && isInlineValue(k.expression)) run.push(k)
      else flush()
    }
    flush()
  }

  function looksLikeTextRun(message) {
    const bare = message.replace(/\{\w+\}/g, "").trim()
    if (!hasLetter(bare)) return false
    if (NEVER_TRANSLATED.has(bare)) return false
    if (/^[\p{L}\d]$/u.test(bare)) return false
    return true
  }

  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) visitChildren(node)
    if (ts.isJsxText(node) && !seenText.has(node)) {
      /* Text outside a run (should not happen), report alone. */
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !insideTranslation(node)) {
      const pos = positionOf(node, sf)
      if (pos) {
        const text = node.text
        const trimmed = text.trim()
        const words = looksLikeWords(text)
        const strong = pos === "attr" || pos === "jsx-expr" || pos === "call" || pos === "prop"
        const capitalised = hasLetter(trimmed) && !isNeverWords(trimmed) && /^[A-Z]/.test(trimmed) && !NEVER_TRANSLATED.has(trimmed) && !/^[A-Z0-9_]+$/.test(trimmed) && !/^[A-Z][a-z]+[A-Z]\w*$/.test(trimmed) && !/^[A-Z][\w-]*\/[\w./-]+$/.test(trimmed)
        /* new Error("no blob"): a marker for the log or a catch, short and in lower case; what a person reads starts with a capital. */
        const marker = pos === "error" && /^[a-z][a-z ]*$/.test(trimmed) && trimmed.split(" ").length <= 3
        if (!marker && (strong ? words || capitalised : words)) {
          push({ kind: pos === "attr?" ? "attr" : pos, text: text.replace(/\s*\n\s*/g, " "), node, start: node.getStart(sf), end: node.getEnd(), translated: false })
        }
      }
    }
    if (ts.isTemplateExpression(node) && !insideTranslation(node)) {
      const pos = positionOf(node, sf)
      if (pos) {
        const { message, values } = templateMessage(node)
        const bare = message.replace(/\{\w+\}/g, " ").trim()
        if (looksLikeWords(bare.length > 1 ? flattenMessage(message) : "") && /\p{L}{2,}/u.test(bare) && !/^[\s\W]*$/.test(bare) && !/[[\]]|^\/|https?:|^[\w-]+=|\.(png|jpe?g|webp|svg|css|js)\b|[{};]$/.test(flattenMessage(message)) && !/^(\{\w+\}[\s\-_/:.,]*)+$/.test(message)) {
          if (pos !== "error") push({ kind: pos === "attr?" ? "attr" : pos, text: message, values, node, start: node.getStart(sf), end: node.getEnd(), translated: false, template: true })
        }
      }
    }
    /* n === 1 ? "item" : "items": English's own plural, which other languages count differently. */
    if (ts.isConditionalExpression(node) && !insideTranslation(node) && ts.isBinaryExpression(node.condition) && /^(===|!==|==|!=)$/.test(node.condition.operatorToken.getText(sf)) && /^1$/.test(node.condition.right.getText(sf)) && ts.isStringLiteral(node.whenTrue) && ts.isStringLiteral(node.whenFalse) && /\p{L}{2,}/u.test(node.whenTrue.text + node.whenFalse.text) && !looksLikeCodePair(node.whenTrue.text, node.whenFalse.text)) {
      push({ kind: "plural", text: `${node.whenTrue.text} / ${node.whenFalse.text}`, node, start: node.getStart(sf), end: node.getEnd(), translated: false })
    }
    /* ttx("person", "Left"): the catalogs' key is "person::Left". */
    const isText = (a) => a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))
    if (ts.isCallExpression(node) && calleeName(node.expression) === "ttx" && isText(node.arguments[0]) && isText(node.arguments[1])) {
      const key = `${node.arguments[0].text}::${node.arguments[1].text}`
      push({ kind: "tt", call: "ttx", key, text: key, node, start: node.getStart(sf), end: node.getEnd(), translated: true })
    } else if (ts.isCallExpression(node) && TRANSLATED_CALL.test(calleeName(node.expression)) && node.arguments[0] && (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))) {
      const name = calleeName(node.expression)
      push({ kind: name === "tt" || name === "msg" ? "tt" : "key", call: name, key: node.arguments[0].text, text: node.arguments[0].text, node, start: node.getStart(sf), end: node.getEnd(), translated: true })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return { sf, findings }
}
