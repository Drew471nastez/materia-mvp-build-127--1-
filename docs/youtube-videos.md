# Adding a YouTube video to Storelib's pages

Storelib's comparison and "sell" pages can show one of your YouTube videos. You add it once, in one file, and every page you name shows it: a thumbnail that loads the player only when someone presses it, the title and description, the chapters as links, and the transcript in a fold. Search engines get the video's details too.

## 1. Collect the details from YouTube

Open the video in YouTube Studio.

- **Id**: the 11 characters after `watch?v=` in the video's address. In `https://www.youtube.com/watch?v=AbCdEfGhIjK` it is `AbCdEfGhIjK`.
- **Title and description**: copy them as they are on YouTube. Keep the description to a sentence or two.
- **Upload date**: in Studio, Content, the Date column. Write it as `2026-11-04`.
- **Length**: optional. Write 9 minutes 12 seconds as `PT9M12S`, and 1 hour 2 minutes as `PT1H2M`.
- **Chapters**: the timestamps from the video's description. Write each as seconds from the start. `1:35` is `95`. The first chapter starts at `0`.
- **Transcript**: optional. In Studio, open the video, then Subtitles, pick the language, and choose Download (as `.txt`) or copy the text. Leave a blank line between paragraphs.

## 2. Add one entry

Open `lib/marketing/videos.ts` and add an entry to `VIDEOS`:

```ts
export const VIDEOS: readonly Video[] = [
  {
    youtubeId: "AbCdEfGhIjK",
    title: "Storelib vs Gumroad: fees, features and moving over",
    description: "I sell the same sample pack on both and compare what I keep.",
    uploadDate: "2026-11-04",
    duration: "PT9M12S",
    chapters: [
      { t: 0, label: "What we compare" },
      { t: 95, label: "Fees on a $25 sale" },
      { t: 310, label: "Moving your products" },
    ],
    transcript: "Paste the transcript here.",
    pages: ["/alternatives/gumroad", "/sell/digital-products"],
  },
]
```

## 3. Choose the pages

`pages` lists where the video shows. It can be any of:

- a comparison: `/alternatives/gumroad`, `/alternatives/stan-store`, `/alternatives/whop`, `/alternatives/linktree`, `/alternatives/shopify`
- a sell page: `/sell/digital-products`, `/sell/online-courses`, `/sell/communities`, `/sell/creator-website`
- Storelib in one page: `/features`

A page shows the first video that names it. The blog has its own video block in the post editor and does not read this list.

## 4. Check it

Run the tests for this part:

```bash
node scripts/run-push-tests.mjs   # or the suite tests/content-r45.test.ts on its own
```

They fail if an id is not 11 characters, a date is not a real day, chapters are out of order or past the end, or a page in `pages` does not exist. Only add real videos with the details exactly as YouTube shows them.
