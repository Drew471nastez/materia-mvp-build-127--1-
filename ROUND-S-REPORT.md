# Round S: profile, scroll feel, mobile nav, emails

Everything below is on `main` and live. Two production deploys:
`1b838982` (the round) and `254b4152` (a second pass on the email tags).

## What you asked for, and what it is now

**S1 — no "Joined Storelib" in Activity.** Gone from the list. The day somebody
joined Storelib now sits in an "About <name>" block under the tabs, which is
where a creator page already puts that kind of fact. Joining a *community* is
still activity and still shows, as you asked.

**S2 — more on the profile, and the Edit button never cut.** The profile is now
drawn with the creator page's own pieces: the cover, the photo across its edge,
the name and handle, where they are from, followers and following, then the
tabs, then About with the join day, their location, how many communities they
are in and their own line about themselves.

The Edit profile button was sliding under the header on scroll. It is pinned
below the header now and cannot pass it, measured in a headless browser at
320, 360, 390, 414, 430, 768, 1024, 1280 and 1440 wide. At 390 the button sits
at [264, 374] and the avatar ends at 258, so 6px of clearance. On phones
narrower than 390 the words shorten to "Edit", which is where the collision
actually starts (369px) rather than at a round breakpoint.

The avatar has a little more depth: a close contact shadow, a wide soft one and
a hairline ring off its edge.

**S3 — pull to refresh on the user page.** iOS style, the same engine the rest
of Storelib pulls with. It asks the server for the page again and for the first
page of Activity again.

**S4 — elastic overscroll.** The library, the user page, account settings and
the rest of the pages the bottom bar reaches now rubber band at their ends like
Safari. It was dead because `overscroll-behavior: none` had been set on the
native shell to stop a white flash behind the dark bars. That is `contain` now
plus a two colour canvas, so the bounce is back and the flash stays fixed.

**S5 — smooth landings.** Opening somebody's profile, coming back from account
settings, landing on Discover or Explore communities, landing on settings: all
of them fade and rise 180ms instead of cutting in.

**S6 — the picture viewer.** Opens out of the circle it was tapped in and
closes back into it, on the X and on a tap away.

**S7 — the mobile bar.** The glass is a touch larger (70x44 from 64x42) and
more liquid: it stretches further under a fast finger, leans in a frame behind
it and runs on a little when the finger stops, and the landing spring is now
sampled for screens faster than 120Hz. Nothing measures the bar's box during a
drag any more, so there is no forced layout between the finger and the frame.
A finger that wanders two bars' height off the bar keeps the gesture instead of
opening nothing.

The bar's depth was rebalanced rather than moved, which is what "a little less
and a little more" asks for: the close shadow is lighter and tighter, the wide
one reaches 46px instead of 24px and is fainter for it, so the same amount of
ink falls across thirty pixels rather than six. The hairline is untouched.

The sheet offers "Start creating" to anybody who does not sell, as a quiet grey
row in the shape the ways out already use, with a line icon from the same
family. A seller still gets Dashboard as the one solid button. Signed out is
unchanged.

**S8 — Home goes back to the community.** This was a real bug and the reason it
survived every test: the community is held in the browser, so the server, which
renders the bar on every load that is not a step inside the app, cannot know
it. The bar was served as a plain link to Explore and only corrected itself
207 to 326ms after the first paint. A thumb that arrived in that window
followed the link.

Two things fix it. The press now works the tabs out from the context as it
stands at the moment the finger lifts, not from the render's copy. And a small
script printed with the bar answers a press that lands before any of React is
running. That script stands down the moment the bar is live, so the two never
answer the same press.

**S9 — the `+slb-` tags.** Nine places were printing the raw address. The two
Settings screens and the app header went first; then the account menu on
storelib.com in both of its shapes, "to <address>" where a campaign test goes,
"replies go to <address>" in the composer and its confirm panel, and "Receipt
goes to <address>" on a receipt.

Two places that actually *send* changed too. A reply to a second business's
campaign used to go to the tagged address; it goes to your own now. And a test
may now be sent to the address the composer shows you, which it used to refuse
while naming the tag back at you.

## Checked

| | |
|---|---|
| Full test suite | 23 failures, all of them other sessions' stale assertions, one fewer than the baseline I started from |
| Suites repaired | 12 had stopped running when the library moved; they run again, and the 7 real failures they had been hiding are fixed |
| New suites | `profile-page-s` 68, `elastic-and-landings` 83, `nav-feel` 62, `shown-email` 19 |
| Nav suites | `app-mobile-nav` 164, `buyer-tab-bar` 121, `place-navigator` 89, plus 8 more, all clean |
| Browser probes | 149 measurements on the bar, 178 on the bounce, landings and picture viewer, 69 on the profile header |
| Build | exit 0, three times |

## Three things for you to decide

**Creator pages have no Activity tab.** You noticed Activity missing on some
profiles. That is a creator page, and it is missing on purpose: an earlier
round of yours says "Creator pages: NO Activity tab; the Communities tab lists
ONLY communities they created". A person without a store gets Activity, a
creator does not. Say the word and creators get it too.

**The wishlist icon line.** What came through was "like the icon of the
wishlist bill shape subpage in your content", right after the Start creating
sentence. I read it as the icon wanting to be in the same line family as the
header's, which it now is. If you meant the wishlist icon's own shape, tell me
what about it.

**One flaky test, not mine.** `tests/communities-notify-budget.test.ts` expects
a digest to read "1 mention and 1 new comment". The rows come back newest
first, so the order flips depending on whether two inserts land in the same
millisecond. It passes alone and fails about half the time in a full run. It
belongs to whoever is building the notifications budget work; the code is fine,
the assertion is the fragile part.
