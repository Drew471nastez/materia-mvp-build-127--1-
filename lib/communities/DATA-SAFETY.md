# Communities: data safety

What a community keeps, what protects it, how to get something back, and what
the owner of Storelib has to switch on. The whole platform's backups are in
`docs/operations/backups.md`; this page is the communities part of it, plus
the checks that keep bad content and bad files out.

## 1. Nothing a member writes is deleted outright

| What | When somebody "deletes" it | Where it can come back from |
| --- | --- | --- |
| Post (`community_feed_posts`) | `status = 'deleted'`, `deleted_at` set. The row, its words, its media and its comments stay. | SQL below, or the post's author asks support |
| Post removed by a moderator or a rule | `status = 'removed'`, `removed_reason` says who or what (`Held for review: ...`, `Hidden after 3 reports ...`) | Moderation queue: Approve or Restore (`moderation.ts`), logged |
| Comment (`community_feed_comments`) | the same `status` and `deleted_at` | the same |
| Chat message (`community_messages`) | the same `status`; a message hidden after reports has its body blanked (the words are kept in `community_audit_log`) | SQL for status; the words from the log |
| Space | only an empty space can be deleted; one with posts or messages is archived | Settings, Spaces |
| Community | archived, never deleted (the only delete is a creation that failed half way) | Settings |
| A member's account | deleted accounts leave their posts and comments with `author_id` empty; nothing they wrote is removed | nothing to do |
| Every moderation action and every rule that fired | `community_audit_log`, kept for good | Moderation, Audit log |

Bring back a post or comment a member deleted by mistake (Supabase, SQL Editor):

```sql
update public.community_feed_posts
set status = 'published', deleted_at = null
where id = '<post id>' and status = 'deleted';
```

(`community_feed_comments` the same way.) Counters follow on their own (triggers).

## 2. Backups (owner's actions)

1. **Point in Time Recovery.** Supabase, Project Settings, Add-ons, Point in
   Time Recovery. Without it, the database goes back to last night's backup at
   best; with it, to any second of the last 7 days. This is the one setting
   that matters most, and it is a paid add-on only the owner can switch on.
2. **The nightly off-site copies** (`docs/operations/backups.md`, steps 2 to 6):
   the whole database and every storage bucket, community pictures and files
   included, copied every night outside Supabase, with a weekly restore drill.
   Supabase's own backups do not include uploaded files; that copy is the
   only one.
3. **Not yet covered: row by row undo for community tables.** The
   `public.deleted_rows` safety net (run-now part 66) keeps a copy of every
   row deleted from the tables that hold work and money, for 90 days. The
   community tables came after it and are not on its list. Because posts,
   comments and messages are only ever marked deleted (section 1), this
   matters for the few hard deletes left: an empty space, a tier, a badge,
   a level, a course link, a video. Recommended: a run-now part that adds
   `community_spaces`, `community_tiers`, `community_badges`,
   `community_levels`, `community_courses` and `media_videos` to the
   `_keep_deleted` trigger (no code change needed; the restore function
   already works for any table on the list).

## 3. Storage hygiene

| Files | Kept clean by |
| --- | --- |
| Pictures in posts and comments (`product-images`, `<user>/community/<community>/`) | made lighter and stripped of EXIF in the browser; checked where they landed (`/api/storage/uploaded`); the hourly picture pass strips any metadata left and runs the malware engine when one is on; **pictures taken out of a draft and never posted are removed after 14 days** (`server/orphans.ts`, daily in `/api/cron/storage-cleanup`) |
| Files attached to posts (`digital-products`, `<creator>/community-files/<community>/<member>/`) | checked where they landed (the product file check, ZIPs opened); **read by the malware engine after the answer when one is switched on** (`lib/security/uploads/engine-after.ts`); handed out only as 5 minute signed downloads to members who may see the post; **files taken out of a draft are removed after 14 days**, a seventh of the communities each day |
| Comments | take no files since round 12 (pictures, one GIF, one video by link); the server refuses one |
| Videos | checked on upload (`server/videos.ts`); not swept, because a video can sit in a post, the gallery, an event or a lesson: the owner removes one in the video library |

The sweep errs towards keeping. It only looks at paths in exactly the shapes
above, keeps everything of a member whose rows could not be read, counts a
deleted, removed or held post as using its pictures (so a restore brings them
back), counts a post by a deleted account as using them, and removes at most
300 files a run. `GET /api/cron/storage-cleanup?dry=1` (with the cron secret)
says what it would remove without removing anything.

A picture removed after 14 days shows as missing in a draft that is brought
back later; never in anything posted.

## 4. What is checked before anybody sees it

All server side, in `server/safety.ts` `screenWrite` (posts, comments, chat
messages, direct messages) and `screenEdit` (only what an edit adds). Nothing
here is visible to a member who writes normally.

### Words (ask 55)

| List | Who | What happens |
| --- | --- | --- |
| Storelib: sexual content involving children (`word-blocklist.ts` PLATFORM_MINORS) | everybody, the team too | refused; in the community's log and the platform's security log (`file_security_events`, `/admin/security`) |
| Storelib: slurs (kept as fingerprints, PLATFORM_HATE_PRINTS) | everybody | refused; the log names the list, never the words |
| Storelib: selling sexual content ("send nudes", "onlyfans leaks") | members | post or comment held for a moderator; chat and direct message refused |
| The community's own (Moderation, Rules; `communities.onboarding.safety.words`, up to 200) | members (the team can write them, to name them) | refused, or held for review, as the owner chooses |

Matching (`word-filter.ts`): whole words and phrases, a trailing `*` for a
prefix (three letters at least). Read through: case, accents, wide letters,
digits and signs for letters (`p0rn`, `a$$`), Cyrillic and Greek look-alikes
inside Latin words, letters spelled out (`p o r n`), invisible characters,
stretched letters. Never squeezed: ordinary double letters (`good` is not
`god`). A list word in another alphabet is matched as written; Chinese,
Japanese and Thai anywhere in the text. A refusal is logged once per member
per community in 10 minutes. A refused direct message is logged without its
words.

Not read: poll questions and options, event titles, profile text. Leetspeak
with symbols this list does not know (`f*ck`) gets through, by design: a
self censored word is not what the list is for.

### Pictures (ask 56)

Every picture and video still in a post or comment that is in Storelib's own
storage (`server/image-check.ts`, `lib/security/images/`).

| Reading | When | Result |
| --- | --- | --- |
| Clearly explicit (classifier: Porn + Hentai at least 0.85) | everybody, the team too | refused; deleted from storage when it is in the writer's own folder; security log |
| Likely explicit (0.55) or clearly suggestive (Sexy 0.9) | members | held |
| First day member: 0.35 explicit or 0.7 suggestive | members in their first 24 hours (not paid members) | held |
| Classifier off: skin heavy (35% skin, largest patch 20%, `skin.ts`) | first day members only | held |
| Will not decode | first day members; everybody when the classifier is on | held |
| An uploaded video | first day members | held |

**The classifier is off until the owner switches it on.** It is NSFWJS
(MobileNetV2, MIT licence) on TensorFlow.js's WebAssembly backend, run inside
the Vercel function: no picture leaves Storelib, nothing is paid for. Measured
here on 58 ordinary photos (portraits, babies, a family, beaches, yoga, a
massage, tattoos, food, wood, sand dunes, sport): first load 2.2 seconds on a
cold function, then about 200 ms a picture, 260 MB of memory, about 13 MB of
code and model. The highest scores on those photos were 0.44 explicit (two
hands holding) and 0.86 suggestive (a yoga class); 3 of the 58 would be held
for a first day member and none for anybody else. Its authors give about 90%
accuracy on their own test set. Nothing adult was used to test it here, on
purpose, so how much it catches is their number, not ours.

To switch it on:

1. `pnpm add nsfwjs@4 @tensorflow/tfjs@4 @tensorflow/tfjs-backend-wasm@4`
2. In `next.config`, so Vercel ships them with the routes that post (they are
   loaded at run time, not bundled):
   ```js
   outputFileTracingIncludes: {
     "/api/community/**": [
       "./node_modules/nsfwjs/package.json",
       "./node_modules/nsfwjs/dist/esm/**",
       "./node_modules/nsfwjs/dist/models/mobilenet_v2/**",
       "./node_modules/@tensorflow/**/package.json",
       "./node_modules/@tensorflow/**/dist/**/*.{js,mjs,wasm}",
     ],
   },
   ```
3. Vercel, Settings, Environment Variables: `SECURITY_IMAGE_CLASSIFIER=nsfwjs`.
4. Deploy a preview, post a picture as a test member, and check the function
   log. If it did not load it says so once (`[image-check] SECURITY_IMAGE_CLASSIFIER=nsfwjs
   but it did not load ...`) and the skin rule carries on alone.

What the picture check **cannot** do, said plainly:

- Without the classifier it sees colour, not people: it holds only first day
  members' pictures, and about 1 in 6 ordinary photos with a lot of warm
  colour (a family portrait, a tattoo, a wooden table, sand) gets held. A
  nude picture in black and white or under coloured light is not caught.
- With it, cartoons and drawings are weaker than photos; a picture cropped or
  covered with text to fool it may pass; a picture inside a PDF or ZIP file
  attachment is not looked at.
- Videos are not looked at frame by frame (the still a member uploads is),
  so a first day member's video is held instead, and reports cover the rest.
- GIFs from Giphy are not read: the search asks Giphy for PG-13 and lower.

What covers the gaps: three reports from different established members hide
anything until a moderator looks (`hideAfterReports`), and the owner can
remove and ban from the post menu and the queue.

### Links, spam and abuse (round 12, unchanged)

Blocklisted and lookalike domains, short links followed, first day limits,
slow mode, duplicate text, mention limits, join and invite limits. See the
header of `server/safety.ts` for every number.

## 5. Uploads and viruses (ask 57)

Every upload goes through the existing pipeline: Storelib's own checks
(file signatures, scripts in documents, disguised programs, ZIP contents, the
EICAR test file) always, and ClamAV when `SECURITY_MALWARE_PROVIDER=clamav`
and its service are set up (`services/file-scanner/README.md`). Refused files
are deleted and logged in `file_security_events`.

## 6. The owner's checklist

- [ ] Supabase Point in Time Recovery (section 2.1)
- [ ] The nightly off-site backups and the restore drill (section 2.2)
- [ ] A run-now part for row by row undo of community tables (section 2.3)
- [ ] Optionally the picture classifier (section 4, four steps)
- [ ] Optionally ClamAV (`services/file-scanner/README.md`)
- [ ] Look at `/admin/security` now and then: refused words from Storelib's
      lists and refused pictures are there with the community they came from
