/**
 * ===========================================================================
 *  THE ONE CARD EVERY UNSUBSCRIBE LINK OPENS ON
 * ===========================================================================
 * Two links take a person off an email list here, and both land on this:
 *
 *   a creator's list     /unsubscribe and /api/email/unsubscribe
 *                        (lib/subscriber-unsubscribe-page.ts), the sender
 *                        drawn as the creator's logo or photo and store name
 *   Storelib's own mail  /api/notify/unsubscribe
 *                        (lib/notify/unsubscribe-page.ts), the Storelib mark
 *
 * A whole HTML document with its styles inline: no script, no stylesheet,
 * no font from anywhere else. Every button is a plain form POST, so it
 * works with JavaScript off and in the smallest in-app mail browser. The
 * look is /app's: #f8f9fa behind a white card with a hairline border and a
 * soft shadow, ink words, the depth buttons of components/ui/depth-button.ts
 * drawn in CSS, violet only in the keyboard outline. Dark when the device
 * is dark.
 *
 * Pure (no server imports), so the suites can read what it draws.
 */
import { STORELIB_LOGO, STORELIB_LOGO_SHADOW } from "@/lib/brand/logo"

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
}

/** Who the email came from, drawn at the top of the card. */
export type CardSender =
  | { kind: "storelib" }
  /** An https picture, or null for the first letter of the name in a neutral circle. */
  | { kind: "creator"; name: string; imageUrl: string | null }
  /** Nobody known (a link that does not work): a plain envelope, no name. */
  | { kind: "none" }

/** asked: nothing has happened yet. done: it worked. problem: it did not, or could not. */
export type CardTone = "asked" | "done" | "problem"

export interface CardButton {
  label: string
  /** Where the form posts. */
  action: string
  /** Hidden fields, posted as they are. */
  fields: Record<string, string>
  look: "primary" | "secondary"
}

export interface CardInput {
  /** The tab's title, before " | <sender>". */
  title: string
  sender: CardSender
  tone: CardTone
  heading: string
  body: string
  /** A short line under the body, like the masked address the email went to. */
  note?: string
  buttons?: CardButton[]
  link?: { href: string; label: string }
  /** A small line under the card. */
  footer?: string
}

/* The Storelib logo, the same file every page draws (lib/brand/logo.ts). A path on this page's own host, which is storelib.com, so nothing comes from anywhere else. */
function storelibMark(): string {
  return `<img class="mark" src="${STORELIB_LOGO}" alt="" width="48" height="48">`
}

function initialOf(name: string): string {
  const first = Array.from(name.trim())[0] ?? "S"
  return first.toLocaleUpperCase()
}

/** The picture with the state's badge on its corner, and the name under it. */
function senderBlock(sender: CardSender, badge: string): string {
  if (sender.kind === "none") {
    return `<div class="sender"><span class="figure"><span class="avatar avatar-initial" aria-hidden="true"><svg class="envelope" viewBox="0 0 24 24" focusable="false"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4.5 7.5l7.5 5.5 7.5-5.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>${badge}</span></div>`
  }
  const picture =
    sender.kind === "storelib"
      ? storelibMark()
      : sender.imageUrl && /^https:\/\//i.test(sender.imageUrl)
        ? `<img class="avatar" src="${escapeHtml(sender.imageUrl)}" alt="" width="48" height="48" referrerpolicy="no-referrer" data-initial="${escapeHtml(initialOf(sender.name))}">`
        : `<span class="avatar avatar-initial" aria-hidden="true">${escapeHtml(initialOf(sender.name))}</span>`
  const name = sender.kind === "storelib" ? "Storelib" : escapeHtml(sender.name)
  return `<div class="sender"><span class="figure">${picture}${badge}</span><p class="sender-name">${name}</p></div>`
}

const BADGE: Record<CardTone, string> = {
  asked: "",
  done: `<span class="badge badge-done" aria-hidden="true"><svg viewBox="0 0 16 16" focusable="false"><path d="M4 8.5l2.5 2.5L12 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`,
  problem: `<span class="badge badge-problem" aria-hidden="true"><svg viewBox="0 0 16 16" focusable="false"><path d="M8 4.5v4.25" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="8" cy="11.5" r="1.1" fill="currentColor"/></svg></span>`,
}

function buttonForm(button: CardButton): string {
  const fields = Object.entries(button.fields)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join("\n      ")
  return `<form method="post" action="${escapeHtml(button.action)}">
      ${fields}
      <button type="submit" class="btn btn-${button.look}">${escapeHtml(button.label)}</button>
    </form>`
}

const STYLE = `
  :root {
    color-scheme: light dark;
    --page: #f8f9fa; --card: #ffffff; --line: #e5e7eb; --ink: #1a1a2e; --muted: #6b7280; --faint: #9ca3af;
    --chip: #f3f4f6; --initial: #eef0f3; --initial-ink: #4b5563;
    --primary: #1a1a2e; --primary-hover: #2a2a40; --primary-down: #0f0f1c; --primary-ink: #ffffff;
    --secondary: #ffffff; --secondary-hover: #f7f7f8; --secondary-down: #f1f2f4; --secondary-line: #d9dbe0;
    --done: #15803d; --problem: #b45309; --ring: #8b5cf6;
    --shadow: 0 1px 2px rgba(16, 24, 40, 0.04), 0 4px 12px rgba(16, 24, 40, 0.04);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --page: #0e0e13; --card: #17171e; --line: #2a2a33; --ink: #ececf1; --muted: #a1a1aa; --faint: #71717a;
      --chip: #22222b; --initial: #26262f; --initial-ink: #d4d4d8;
      --primary: #f4f4f5; --primary-hover: #e4e4e7; --primary-down: #d4d4d8; --primary-ink: #1a1a2e;
      --secondary: #1f1f27; --secondary-hover: #26262f; --secondary-down: #2c2c36; --secondary-line: #34343f;
      --done: #4ade80; --problem: #fbbf24; --ring: #a78bfa;
      --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.25);
    }
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
  body { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 32px 16px; background: var(--page); color: var(--ink); overflow-x: hidden;
    font: 15px/1.5 Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased; }
  main { width: 100%; max-width: 440px; background: var(--card); border: 1px solid var(--line); border-radius: 12px;
    padding: 32px 20px 24px; box-shadow: var(--shadow); text-align: center; }
  @media (min-width: 480px) { main { padding: 40px 36px 32px; } }
  .sender { display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .figure { position: relative; display: inline-flex; }
  .avatar, .mark { width: 48px; height: 48px; border-radius: 999px; display: block; }
  .mark { border-radius: 7px; box-shadow: ${STORELIB_LOGO_SHADOW}; object-fit: cover; }
  img.avatar { position: relative; object-fit: cover; background: var(--initial); border: 1px solid var(--line); color: transparent; }
  /* A picture that does not load draws its ::before: the letter, where the broken-image icon would be. */
  img.avatar::before { content: attr(data-initial); position: absolute; inset: -1px; display: flex; align-items: center; justify-content: center;
    border-radius: 999px; background: var(--initial); color: var(--initial-ink); border: 1px solid var(--line); font-size: 19px; font-weight: 600; }
  .avatar-initial { display: inline-flex; align-items: center; justify-content: center; background: var(--initial); color: var(--initial-ink);
    font-size: 19px; font-weight: 600; border: 1px solid var(--line); }
  .envelope { width: 22px; height: 22px; }
  .sender-name { font-size: 13px; font-weight: 600; color: var(--muted); max-width: 100%; overflow-wrap: anywhere; }
  .badge { position: absolute; right: -4px; bottom: -4px; width: 20px; height: 20px; border-radius: 999px; display: inline-flex;
    align-items: center; justify-content: center; background: var(--card); box-shadow: 0 0 0 2px var(--card); }
  .badge svg { width: 20px; height: 20px; border-radius: 999px; color: #fff; }
  .badge-done svg { background: var(--done); }
  .badge-problem svg { background: var(--problem); }
  @media (prefers-color-scheme: dark) { .badge svg { color: #0e0e13; } }
  .message { margin-top: 20px; }
  h1 { font-size: 20px; line-height: 1.3; font-weight: 600; letter-spacing: -0.01em; overflow-wrap: anywhere; }
  .body { margin-top: 8px; font-size: 14px; color: var(--muted); overflow-wrap: anywhere; }
  .note { display: inline-block; margin-top: 12px; padding: 4px 10px; border-radius: 999px; background: var(--chip);
    font-size: 13px; color: var(--muted); max-width: 100%; overflow-wrap: anywhere; }
  .actions { margin-top: 24px; display: grid; gap: 8px; }
  .btn { display: flex; align-items: center; justify-content: center; width: 100%; min-height: 44px; padding: 10px 16px;
    border-radius: 10px; font: inherit; font-size: 14px; line-height: 1.3; cursor: pointer; -webkit-tap-highlight-color: transparent;
    transition: background-color 100ms, box-shadow 100ms; }
  .btn-primary { border: 0; background: var(--primary); color: var(--primary-ink); font-weight: 600;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14), inset 0 -1px 0 rgba(0, 0, 0, 0.35), 0 1px 2px rgba(16, 24, 40, 0.25); }
  .btn-primary:hover { background: var(--primary-hover); }
  .btn-primary:active { background: var(--primary-down); box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.4); }
  .btn-secondary { border: 1px solid var(--secondary-line); background: var(--secondary); color: var(--ink); font-weight: 500;
    box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.08), 0 1px 0 rgba(0, 0, 0, 0.05); }
  .btn-secondary:hover { background: var(--secondary-hover); }
  .btn-secondary:active { background: var(--secondary-down); box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.1); }
  .btn:focus-visible, a:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  .link { display: inline-flex; align-items: center; min-height: 44px; margin-top: 8px; padding: 0 4px; color: var(--muted);
    font-size: 14px; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--line); border-radius: 6px; }
  .link:hover { color: var(--ink); text-decoration-color: currentColor; }
  main > .link:last-child { margin-bottom: -10px; }
  footer { margin-top: 20px; font-size: 12px; color: var(--faint); text-align: center; }
  @media (prefers-reduced-motion: reduce) { .btn { transition: none; } }
`

export function unsubscribeCard(input: CardInput): string {
  const top = senderBlock(input.sender, BADGE[input.tone])
  const buttons = (input.buttons ?? []).map(buttonForm).join("\n    ")
  const senderName = input.sender.kind === "storelib" ? "Storelib" : input.sender.kind === "creator" ? input.sender.name : "Email preferences"
  /* A result is announced when it lands; a question is just read. */
  const live = input.tone === "asked" ? "" : ` role="${input.tone === "problem" ? "alert" : "status"}" aria-live="${input.tone === "problem" ? "assertive" : "polite"}"`
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(input.title)} | ${escapeHtml(senderName)}</title>
<style>${STYLE}</style>
</head>
<body>
<main aria-labelledby="heading">
  ${top}
  <div class="message"${live}>
    <h1 id="heading">${escapeHtml(input.heading)}</h1>
    <p class="body">${escapeHtml(input.body)}</p>
    ${input.note ? `<p class="note">${escapeHtml(input.note)}</p>` : ""}
  </div>
  ${buttons ? `<div class="actions">
    ${buttons}
  </div>` : ""}
  ${input.link ? `<a class="link" href="${escapeHtml(input.link.href)}">${escapeHtml(input.link.label)}</a>` : ""}
</main>
${input.footer ? `<footer>${escapeHtml(input.footer)}</footer>` : ""}
</body>
</html>`
}
