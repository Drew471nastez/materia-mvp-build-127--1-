/**
 * ===========================================================================
 *  A POST ON A PHONE (round 19 to 24, replaced in round 15)
 * ===========================================================================
 * This probe measured the card growing into the opened post and shrinking
 * back into it. Round 15 replaced that model with an iOS push (the owner's
 * recording, images/74.mp4, showed the title and the picture drawn twice at
 * the end of every close: components/community/member/post-motion.ts says
 * why), so what it measured no longer exists. The open, the close, the pull
 * down, the edge swipe, the keyboard and the tab bar are measured frame by
 * frame, at 4x CPU, by scripts/check-communities-post15.mjs, which this runs.
 *
 *   node scripts/check-post-fullscreen.mjs
 */
await import("./check-communities-post15.mjs")
