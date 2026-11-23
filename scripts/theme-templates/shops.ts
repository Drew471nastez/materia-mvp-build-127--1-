/**
 * The shop on each template's cover: a name and a few products with
 * pictures, as a creator's store has them. Only the cover script draws
 * these. A template carries no products: on a creator's website their own
 * products take these places, and a store with none yet shows the theme's
 * empty cards. Each picture is a file in the template's own assets/.
 */
import type { SampleProduct } from "./site"

/** `currency`: a shop that sells in another currency than dollars draws its prices with its own symbol (Loudlib sells in euros). */
/** `posts` (templates round 21): a shop's own three blog posts, each with a picture from scripts/theme-templates/products/<template>/; without them the blog shows the shared sample posts. */
export interface SamplePost { title: string; excerpt: string; image: string; tag: string; html: string }
export const SAMPLE_SHOPS: Record<string, { name: string; products: SampleProduct[]; currency?: { code: string; format: string }; posts?: SamplePost[] }> = {
  default: {
    name: "Sundry",
    products: [
      { title: "Stoneware mug", price: "$28.00", image: "default-mug.webp", description: "A wide, heavy mug in white stoneware. Holds 350 ml and goes in the dishwasher.", options: [{ name: "Colour", values: ["White", "Sand"] }] },
      { title: "Cotton cap, mustard", price: "$32.00", image: "default-cap.webp" },
      { title: "Desk Planner, printable PDF", price: "$12.00", image: "default-planner.webp", kind: "digital", description: "A week on one page, with a column for notes." },
      { title: "Steel bottle, 600 ml", price: "$34.00", image: "default-bottle.webp" },
      { title: "Canvas tote", price: "$24.00", image: "default-tote.webp", description: "Heavy natural cotton with long handles." },
      { title: "Linen notebook, A5", price: "$18.00", image: "default-notebook.webp", description: "160 pages of ruled cream paper." },
    ],
  },
  clothing: {
    name: "Halde",
    products: [
      { title: "Wool overcoat, camel", price: "$420.00", image: "clothing-wool-overcoat.webp", description: "Double faced wool, cut long and straight with a single vent. Unlined, so it packs flat.", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL"] }], soldOut: ["XL"] },
      { title: "Merino half zip, black", price: "$145.00", image: "clothing-merino-half-zip.webp", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL"] }] },
      { title: "Linen overshirt, chestnut", price: "$160.00", image: "clothing-linen-overshirt.webp", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Long blazer, black", price: "$290.00", image: "clothing-long-blazer.webp", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL"] }] },
      { title: "Boxy tee, olive", price: "$55.00", image: "clothing-boxy-tee.webp", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL"] }] },
      { title: "Wool blazer, charcoal", price: "$260.00", image: "clothing-wool-blazer.webp", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
    ],
  },
  merch: {
    name: "OKTAV",
    products: [
      { title: "Heavyweight hoodie, black", price: "$79.00", compare: "$95.00", image: "merch-hoodie-black.webp", description: "Brushed back fleece at 450 gsm, a double layer hood and a kangaroo pocket. Cut boxy with dropped shoulders.", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL"] }], soldOut: ["XS"] },
      { title: "Loop trackpant, heather grey", price: "$59.00", compare: "$72.00", image: "merch-trackpant-grey.webp", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Oversized tee, black", price: "$38.00", image: "merch-tee-oversized-black.webp", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL"] }] },
      { title: "Cargo trackpant, bone", price: "$74.00", image: "merch-cargo-trackpant-ecru.webp", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Oversized tee, white", price: "$38.00", image: "merch-tee-oversized-white.webp", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL"] }] },
      { title: "Twill short, black", price: "$44.00", compare: "$55.00", image: "merch-short-black.webp", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Rib tank, white", price: "$29.00", image: "merch-tank-white.webp", options: [{ name: "Size", values: ["XS", "S", "M", "L"] }] },
      { title: "Fitted tee, black", price: "$34.00", image: "merch-tee-fitted-black.webp", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL"] }] },
    ],
  },
  digital: {
    name: "Plainfile",
    products: [
      { title: "Pricing your work, a guide", price: "$24.00", image: "digital-guide.webp", kind: "digital", description: "A 64 page PDF guide with a pricing worksheet and three proposal templates. Work out a day rate, price a project and say the number with confidence.", options: [{ name: "Edition", values: ["Guide", "Guide and worksheets"] }], add: { "Guide and worksheets": 10 } },
      { title: "Social post templates", price: "$29.00", image: "digital-templates.webp", kind: "digital", description: "40 square posts and a business card, for Figma and Canva.", options: [{ name: "Licence", values: ["Personal", "Commercial"] }], add: { Commercial: 20 } },
      { title: "Line icons, 240", price: "$19.00", image: "digital-icons.webp", kind: "digital", description: "240 icons on a 24 px grid, as SVG and a Figma library.", options: [{ name: "Licence", values: ["Personal", "Commercial"] }], add: { Commercial: 20 } },
      { title: "Soft Film presets", price: "$22.00", image: "digital-presets.webp", kind: "digital", description: "12 Lightroom presets for warm, quiet colour." },
      { title: "Marlow, a display serif", price: "$39.00", image: "digital-font.webp", kind: "digital", description: "OTF, TTF and WOFF2 with a desktop licence.", options: [{ name: "Licence", values: ["Desktop", "Desktop and web", "Desktop, web and app"] }], add: { "Desktop and web": 30, "Desktop, web and app": 80 } },
      { title: "Weekly planner, printable", price: "$8.00", image: "digital-planner.webp", kind: "digital", description: "A4 and US Letter PDFs to print at home.", options: [{ name: "Paper", values: ["A4", "US Letter"] }] },
      { title: "Coast LUTs for video", price: "$26.00", image: "digital-luts.webp", kind: "digital", description: "8 .cube LUTs for log footage." },
      { title: "The starter bundle", price: "$79.00", compare: "$112.00", image: "digital-bundle.webp", kind: "digital", description: "The guide, the icons, the presets and Marlow in one download." },
    ],
  },
  /* Templates round 19: digital art books, after the owner's Echoes reference. */
  artbooks: {
    name: "Ochre Editions",
    products: [
      { title: "Hokusai. Prints of Mount Fuji", price: "$22.00", image: "artbooks-hokusai.webp", kind: "digital", description: "A 168 page PDF of landscape prints, each plate on its own page with a short note on where it was made. Read it on a tablet or a large screen and zoom into the woodgrain.", options: [{ name: "Edition", values: ["PDF", "PDF and print files"] }], add: { "PDF and print files": 8 } },
      { title: "Sargent. Portraits in Black", price: "$28.00", compare: "$36.00", image: "artbooks-sargent.webp", kind: "digital", description: "A 144 page PDF of portraits and studies in oil, with close details of the brushwork.", options: [{ name: "Edition", values: ["PDF", "PDF and print files"] }], add: { "PDF and print files": 8 } },
      { title: "British Algae. Anna Atkins Photographs", price: "$16.00", image: "artbooks-atkins.webp", kind: "digital", description: "A 96 page PDF of cyanotypes, seaweeds pressed and printed in sunlight.", options: [{ name: "Edition", values: ["PDF", "PDF and print files"] }], add: { "PDF and print files": 8 } },
      { title: "Van Gogh. Self-Portraits and Flowers", price: "$24.00", image: "artbooks-van-gogh.webp", kind: "digital", description: "A 192 page PDF of self-portraits and flower paintings, with full page details.", options: [{ name: "Edition", values: ["PDF", "PDF and print files"] }], add: { "PDF and print files": 8 } },
      { title: "Egypt. Tomb Paintings in Colour", price: "$26.00", image: "artbooks-egypt.webp", kind: "digital", description: "A 120 page PDF of tomb paintings copied by hand at full size." },
      { title: "Vermeer. Light at the Window", price: "$18.00", image: "artbooks-vermeer.webp", kind: "digital", description: "An 80 page PDF of interiors, with each painting shown whole and in detail." },
      { title: "Birds and Flowers. Japanese Prints on Black", price: "$20.00", image: "artbooks-birds.webp", kind: "digital", description: "A 64 page PDF of prints made on a black ground, birds and blossom in fine lines." },
      { title: "Cross. Watercolours of the South", price: "$22.00", image: "artbooks-cross.webp", kind: "digital", description: "A 72 page PDF of watercolours in dabs of pure colour, painted on the Mediterranean coast." },
    ],
  },
  /* Templates round 20: remade as one calm book site, The Quiet Hour, with its editions; the covers are drawn for the template. */
  ebooks: {
    name: "Marrow & Hearth",
    products: [
      { title: "The Broth Book", price: "$29.00", compare: "$34.00", image: "ebooks-book-broth.webp", description: "Stocks, bone broths and the soups, stews and sauces they make. 92 recipes, from a weeknight chicken stock to a two day beef broth, with a chapter on storing and freezing.", options: [{ name: "Format", values: ["Hardback and ebook", "Ebook"] }], add: { "Ebook": -14 }, pictures: { "Ebook": "ebooks-cover-broth.webp" } },
      { title: "Nose to Tail at Home", price: "$32.00", image: "ebooks-book-nose.webp", description: "Liver, heart, tongue, marrow and the cheaper cuts, cooked so the whole table eats them. 84 recipes and a guide to what to ask your butcher for.", options: [{ name: "Format", values: ["Hardback and ebook", "Ebook"] }], add: { "Ebook": -15 }, pictures: { "Ebook": "ebooks-cover-nose.webp" } },
      { title: "Slow Ferments", price: "$27.00", image: "ebooks-book-ferments.webp", description: "Kraut, kimchi, kvass, pickles, yoghurt and cultured butter. 70 recipes and a four week plan for keeping three jars going at once.", options: [{ name: "Format", values: ["Hardback and ebook", "Ebook"] }], add: { "Ebook": -12 }, pictures: { "Ebook": "ebooks-cover-ferments.webp" } },
      { title: "Sourdough from Scratch", price: "$27.00", image: "ebooks-book-bread.webp", description: "A starter in seven days, a first loaf on the eighth, and everything after: rye, spelt, flatbreads and what to do with the discard.", options: [{ name: "Format", values: ["Hardback and ebook", "Ebook"] }], add: { "Ebook": -12 }, pictures: { "Ebook": "ebooks-cover-bread.webp" } },
      { title: "The 28 Day Table", price: "$19.00", image: "ebooks-book-plan.webp", kind: "digital", description: "Four weeks of dinners built on the other books, with a shopping list for each week and one batch cooking afternoon. Ebook, PDF and EPUB." },
      { title: "The library, all five books", price: "$89.00", compare: "$124.00", image: "ebooks-book-library.webp", description: "The Broth Book, Nose to Tail at Home, Slow Ferments, Sourdough from Scratch and The 28 Day Table, in hardback with every ebook included. Shipped free in one parcel." },
    ],
    posts: [
      { title: "A Sunday pot of chicken broth", tag: "Broth", image: "ebooks-cover-broth.webp", excerpt: "The stock we start every week with: one chicken carcass, a few vegetables and six slow hours. From The Broth Book.", html: `<p>This is the pot that carries us from Sunday to Thursday. It is the first recipe in The Broth Book and the one we make most.</p><h2 id="you-need">You need</h2><ul><li>1 roast chicken carcass, plus wings or feet if you have them</li><li>1 onion, 2 carrots, 2 celery sticks</li><li>1 tbsp cider vinegar and 3 litres of cold water</li></ul><h2 id="method">Method</h2><p>Put everything in a big pot, bring it just to a simmer and skim. Keep it barely moving for six hours, then strain, cool and keep it in jars for five days or freeze it.</p><blockquote>If it sets like jelly in the fridge, you did it right.</blockquote>` },
      { title: "Liver and onions people actually eat", tag: "Nose to tail", image: "ebooks-cover-nose.webp", excerpt: "Soaked in milk, cooked fast and served pink, with a lot of slow onions. The recipe that wins over the doubters.", html: `<p>Most people who say they hate liver have eaten it grey. Cooked fast and left pink, it is sweet and soft.</p><h2 id="method">Method</h2><ul><li>Soak sliced calf or lamb liver in milk for an hour</li><li>Cook two sliced onions in butter for 30 minutes until jammy</li><li>Fry the liver in a hot pan, one minute a side</li></ul><p>Serve on the onions with mashed potatoes and plenty of pepper.</p>` },
      { title: "Your first jar of kraut", tag: "Ferments", image: "ebooks-cover-ferments.webp", excerpt: "One cabbage, salt and a clean jar. What to expect on day three, day seven and day twenty one.", html: `<p>Sauerkraut is the easiest ferment there is and the best place to start.</p><h2 id="method">Method</h2><p>Shred one cabbage, weigh it and add 2 percent of that weight in salt. Squeeze it until it gives up its water, pack it into a jar and keep it under the brine.</p><ul><li>Day 3: bubbles and a sour smell</li><li>Day 7: crisp and tangy</li><li>Day 21: soft and deep, ready for the fridge</li></ul>` },
    ],
  },
  fitness: {
    name: "Iron Habit",
    products: [
      { title: "Foundation strength, 12 weeks", price: "$49.00", image: "fitness-deadlift.webp", kind: "digital", description: "Three sessions a week, with video for every lift.", options: [{ name: "Plan", values: ["Self guided", "With form checks"] }], add: { "With form checks": 40 } },
      { title: "Conditioning, 8 weeks", price: "$39.00", image: "fitness-ropes.webp", kind: "digital", options: [{ name: "Plan", values: ["Self guided", "With form checks"] }], add: { "With form checks": 30 } },
      { title: "Daily mobility", price: "$19.00", image: "fitness-stretch.webp", kind: "digital" },
    ],
  },
  landing: {
    name: "Cutroom",
    products: [
      { title: "The Whole Edit", price: "$249.00", compare: "$594.00", image: "landing-cover-whole-edit.webp", kind: "digital", description: "All six courses in one bundle, with the raw footage and a monthly feedback call.", options: [{ name: "Seats", values: ["1 person", "Team of 3"] }], add: { "Team of 3": 250 } },
      { title: "Cutting 101", price: "$47.00", compare: "$97.00", image: "landing-cover-cutting.webp", kind: "digital", description: "Beginner. 24 lessons. Go from a folder of clips to a cut that holds attention." },
      { title: "Colour Grading", price: "$97.00", compare: "$147.00", image: "landing-cover-colour.webp", kind: "digital", description: "Intermediate. 30 lessons. Balance, match and build a look that lasts a whole video." },
      { title: "Sound for Video", price: "$67.00", compare: "$97.00", image: "landing-cover-sound.webp", kind: "digital", description: "Intermediate. 18 lessons. Clean dialogue, music that sits under it, and a final mix." },
      { title: "Motion Titles", price: "$67.00", compare: "$97.00", image: "landing-cover-titles.webp", kind: "digital", description: "Intermediate. 16 lessons. Titles, lower thirds and captions that move well." },
      { title: "Short Form", price: "$47.00", compare: "$87.00", image: "landing-cover-short-form.webp", kind: "digital", description: "Beginner. 20 lessons. Vertical edits with a hook in the first two seconds." },
      { title: "Documentary Cuts", price: "$97.00", compare: "$147.00", image: "landing-cover-documentary.webp", kind: "digital", description: "Advanced. 22 lessons. Shape hours of interviews into a story." },
      { title: "7 Day Starter", price: "$27.00", compare: "$49.00", image: "landing-cover-starter.webp", kind: "digital", description: "New to editing. Seven short lessons and a finished one minute video by Sunday." },
    ],
  },
  creator: {
    name: "Ines Hart",
    products: [
      { title: "Draw Before Breakfast", price: "$24.00", image: "creator-book.webp", description: "The book. Forty drawing exercises of ten minutes each, for mornings before work.", options: [{ name: "Format", values: ["Paperback", "PDF"] }], add: { PDF: -10 } },
      { title: "Sketchbook Basics", price: "$129.00", image: "creator-course.webp", kind: "digital", description: "A six week video course for adults who have not drawn since school.", options: [{ name: "Access", values: ["Course", "Course and feedback"] }], add: { "Course and feedback": 60 } },
      { title: "The Drawing Table, monthly", price: "$9.00", image: "creator-community.webp", kind: "digital", description: "A members club with a live drawing session every month." },
      { title: "100 drawing prompts", price: "$18.00", image: "creator-prompts.webp", kind: "digital", description: "A printable deck of prompts for days with no ideas." },
      { title: "Light on Dark Paper", price: "$49.00", image: "creator-dark-paper.webp", kind: "digital", description: "A short video course on drawing pale flowers and light with coloured pencil on dark paper." },
      { title: "Line by Line workbook", price: "$12.00", image: "creator-workbook.webp", kind: "digital", description: "A printable workbook of line exercises." },
    ],
  },
  streetwear: {
    name: "Solano",
    products: [
      { title: "Linen popover, navy", price: "$120.00", image: "streetwear-linen-popover-navy.webp", description: "Washed linen with a short placket and a split hem. Cut loose through the body, so it moves in the heat.", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }], soldOut: ["XL"] },
      { title: "Band collar shirt, sky", price: "$135.00", image: "streetwear-band-collar-shirt-sky.webp", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Linen tee, stone", price: "$95.00", image: "streetwear-linen-tee-stone.webp", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Linen henley, white", price: "$95.00", image: "streetwear-linen-henley-white.webp", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Gathered hem top, ecru", price: "$125.00", image: "streetwear-gathered-hem-top-ecru.webp", options: [{ name: "Size", values: ["XS", "S", "M", "L"] }] },
    ],
  },
  samples: {
    name: "Loudlib",
    currency: { code: "EUR", format: "€{{amount}}" },
    /* Templates round 21: Loudlib's blog is about producing, with studio photographs (Unsplash License, theme-packages/materia/templates/CREDITS.md). */
    posts: [
      { title: "Layering a tech house kick", tag: "Drums", image: "samples-post-kick.webp", excerpt: "A punchy kick is usually two or three sounds: a click on top, a body and a short sub. How to stack them without the low end turning to mud.", html: `<p>Most tech house kicks you hear in a club are not one sample. They are a click for the top, a body for the punch and a short sub underneath, each cut to do one job.</p><h2 id="three">Three layers, three jobs</h2><p>Pick the body first. It decides the pitch and the length. Then add a click that only lives above 2 kHz, and a sine sub that stops before the next off beat.</p><ul><li>High pass the click at 1.5 to 2 kHz</li><li>Keep the body between 60 and 200 Hz</li><li>Tune the sub to the key of the track</li></ul><blockquote>If the layers fight, flip the phase of one and listen again before you reach for an EQ.</blockquote><h2 id="glue">Glue them</h2><p>Bus the three layers, add a little saturation and a fast compressor, then bounce the result to one sample. A single file is easier to sidechain against later.</p>` },
      { title: "Sidechain that breathes, for deep house", tag: "Mixing", image: "samples-post-sidechain.webp", excerpt: "Pumping is a sound, not a fix. Where to put the ducking in a deep house mix, and how long the release should be at 120 BPM.", html: `<p>Deep house sits slower and warmer than tech house, so the sidechain should move the pads and the bass without anyone noticing it as an effect.</p><h2 id="where">Where to duck</h2><p>Duck the bass hard and short, the chords softly and longer. Leave the hats alone: they carry the groove the kick leaves behind.</p><ul><li>Bass: 6 to 8 dB, release about 80 ms</li><li>Chords and pads: 2 to 3 dB, release about 200 ms</li><li>Vocals: usually none</li></ul><blockquote>At 120 BPM one sixteenth note is 125 ms. A release just under that keeps the pump in time.</blockquote><h2 id="ghost">Use a ghost kick</h2><p>Trigger the compressor from a muted kick on its own track, so the pump keeps going in breakdowns where the real kick drops out.</p>` },
      { title: "A vocal chop hook from one phrase", tag: "Sound design", image: "samples-post-vocal-chops.webp", excerpt: "Take one sung phrase, slice it to the transients and play it back as an instrument. A hook in ten minutes, and it is yours.", html: `<p>A short sung phrase holds more than one hook. Sliced and replayed, the same few syllables turn into a rhythm part that nobody else has.</p><h2 id="slice">Slice to the transients</h2><p>Drop the phrase in a sampler, slice it at each consonant and map the slices across the keyboard. Play a simple rhythm in the off beats first.</p><ul><li>Keep slices short, under a sixteenth note</li><li>Fade each slice out to avoid clicks</li><li>Transpose by octaves, not by odd intervals</li></ul><blockquote>Formant shifting keeps the voice human when you pitch it up an octave.</blockquote><h2 id="space">Give it space</h2><p>A send to a short reverb and a dotted eighth delay, both high passed, puts the chops behind the drums instead of on top of them.</p>` },
    ],
    /* Templates round 20: Loudlib's own catalogue, as loudlib.net lists it (names, prices, contents and box art from its Payhip store). The prices there are euros, and so are these. */
    products: [
      { title: "Serum Presets Vol 1", price: "€8.99", compare: "€22.47", image: "samples-pack-serum-presets.webp", kind: "digital", description: "26 ready to use bass presets for Xfer Serum, made for tech house, deep house, melodic house and afro house. Needs Serum 1.368 or later, which is not included. Also part of the Tech House Master Bundle and the Deep House Production Suite.", options: [{ name: "Download", values: ["ZIP", "RAR"] }] },
      { title: "Tech House Sample Pack, Master Bundle 2025", price: "€19.98", compare: "€49.96", image: "samples-pack-tech-house-master-bundle.webp", kind: "digital", description: "Over 1,000 tech house sounds, 1.7 GB unzipped: drum one shots and loops, 100 bass loops, 26 Serum bass presets, FX, vocals and melody loops. Released in limited runs, twice a year. Plug and play in every major DAW.", options: [{ name: "Download", values: ["ZIP, 1 GB", "RAR, 930 MB"] }] },
      { title: "Tech House Drum Kit Vol I", price: "€0.00", image: "samples-pack-drum-kit.webp", kind: "digital", description: "280 hand picked one shots for tech house: 35 kicks, 43 claps, 31 hats, 35 open hats, 63 percs, 21 crashes, 11 rides, 21 shakers and 20 snares. 71.9 MB unzipped.", options: [{ name: "Pack", values: ["Full pack", "Free preview pack"] }] },
      { title: "Free Ambience Sample Pack Vol I", price: "€0.00", image: "samples-pack-ambience-kit.webp", kind: "digital", description: "16 atmospheric loops: calm drones, soft textures and gentle tunes for intros, breakdowns and film. ZIP 59 MB or RAR 45 MB.", options: [{ name: "Download", values: ["ZIP", "RAR"] }] },
      { title: "Deep House Production Suite, Serenade", price: "€9.98", compare: "€24.94", image: "samples-pack-deep-house-production-suite.webp", kind: "digital", description: "223 sounds for deep house, 311 MB unzipped: 64 drum one shots, 64 drum loops, 52 bass sounds with Serum bass presets, 12 FX and 47 melody, ambience and instrument sounds. One ZIP, 246 MB." },
      { title: "Tech House Sample Pack, Unitech", price: "€6.20", image: "samples-pack-tech-house-unitech.webp", kind: "digital", description: "165 WAV files for the new wave of tech house, inspired by John Summit, Fisher, Matroda and Dom Dolla: kicks, top loops, full drum loops, hats, claps, percs, 20 Serum bass presets, FX and buildups. One RAR, about 104 MB." },
      { title: "Tech House Drums Collection Vol I", price: "€5.00", compare: "€10.00", image: "samples-pack-drums-collection.webp", kind: "digital", description: "177 drum loops for tech house: 122 top loops and 55 full drum loops, 620 MB unzipped. One ZIP, 517 MB." },
      { title: "Tech House Bass Collection Vol I", price: "€4.00", compare: "€10.00", image: "samples-pack-bass-collection.webp", kind: "digital", description: "Over 100 bass loops for tech house, 238 MB unzipped. One ZIP, 169 MB." },
    ],
  },
  workspace: {
    name: "Wellkept",
    products: [
      { title: "Freelance desk", price: "$29.00", image: "workspace-freelance-desk.webp", kind: "digital", description: "Clients, projects, invoices and hours in one Notion page, with a board for the week and a list of who still owes you.", options: [{ name: "Licence", values: ["Personal", "Team of 5"] }], add: { "Team of 5": 30 } },
      { title: "Meal planner", price: "$12.00", image: "workspace-meal-planner.webp", kind: "digital" },
      { title: "Reading log", price: "$9.00", image: "workspace-reading-log.webp", kind: "digital" },
      { title: "Home budget", price: "$15.00", image: "workspace-home-budget.webp", kind: "digital" },
      { title: "Habit tracker", price: "$9.00", image: "workspace-habit-tracker.webp", kind: "digital" },
      { title: "Study planner", price: "$12.00", image: "workspace-study-planner.webp", kind: "digital" },
    ],
  },
  /* Templates round 19: product pictures are transparent cut-outs, as the template asks creators to upload them. */
  space: {
    name: "Nadir",
    products: [
      { title: "White Tee", price: "$55.00", image: "space-white-tee.webp", description: "Heavy cotton jersey, boxy through the body with a dropped shoulder. Washed once before it ships, so it keeps its size.", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }], soldOut: ["S"] },
      { title: "Denim Jacket", price: "$140.00", image: "space-denim-jacket.webp", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Rust Bomber", price: "$155.00", image: "space-bomber.webp", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Pink Bag", price: "$50.00", image: "space-pink-bag.webp" },
      { title: "Light Jeans", price: "$95.00", image: "space-light-jeans.webp", options: [{ name: "Waist", values: ["28", "30", "32", "34"] }] },
      { title: "Grey Beanie", price: "$35.00", image: "space-grey-beanie.webp" },
      { title: "Black Cap", price: "$40.00", image: "space-black-cap.webp" },
      { title: "Black Tee", price: "$55.00", image: "space-black-tee.webp", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
    ],
  },
  /* Templates round 19: poster designs drawn for the template, shown framed on a soft card. */
  posters: {
    name: "Daydream Prints",
    products: [
      { title: "Blue Hour print", price: "$32.00", image: "posters-blue-petals.webp", description: "A cobalt flower on warm cream, printed on thick matte paper. Sent flat, ready for a frame.", options: [{ name: "Size", values: ["A4", "A3", "50 x 70 cm"] }, { name: "Frame", values: ["Unframed", "Black frame", "Oak frame"] }], add: { "A3": 10, "50 x 70 cm": 26, "Black frame": 45, "Oak frame": 45 }, pictures: { Unframed: "posters-blue-petals-unframed.webp", "Black frame": "posters-blue-petals.webp", "Oak frame": "posters-blue-petals-oak.webp" } },
      { title: "Good Morning print", price: "$32.00", image: "posters-sunburst.webp", options: [{ name: "Size", values: ["A4", "A3", "50 x 70 cm"] }, { name: "Frame", values: ["Unframed", "Black frame", "Oak frame"] }], add: { "A3": 10, "50 x 70 cm": 26, "Black frame": 45, "Oak frame": 45 } },
      { title: "In Full Bloom print", price: "$28.00", compare: "$36.00", image: "posters-big-bloom.webp", options: [{ name: "Size", values: ["A4", "A3", "50 x 70 cm"] }, { name: "Frame", values: ["Unframed", "Black frame", "Oak frame"] }], add: { "A3": 10, "50 x 70 cm": 26, "Black frame": 45, "Oak frame": 45 } },
      { title: "Squeeze the Day print", price: "$32.00", image: "posters-citrus.webp", options: [{ name: "Size", values: ["A4", "A3", "50 x 70 cm"] }, { name: "Frame", values: ["Unframed", "Black frame", "Oak frame"] }], add: { "A3": 10, "50 x 70 cm": 26, "Black frame": 45, "Oak frame": 45 } },
      { title: "After the Rain print", price: "$28.00", image: "posters-rainbow-arches.webp", options: [{ name: "Size", values: ["A4", "A3", "50 x 70 cm"] }, { name: "Frame", values: ["Unframed", "Black frame", "Oak frame"] }], add: { "A3": 10, "50 x 70 cm": 26, "Black frame": 45, "Oak frame": 45 } },
      { title: "Tulip Season print", price: "$32.00", image: "posters-tulips.webp", options: [{ name: "Size", values: ["A4", "A3", "50 x 70 cm"] }, { name: "Frame", values: ["Unframed", "Black frame", "Oak frame"] }], add: { "A3": 10, "50 x 70 cm": 26, "Black frame": 45, "Oak frame": 45 } },
      { title: "Pick Me print", price: "$28.00", image: "posters-daisies.webp", options: [{ name: "Size", values: ["A4", "A3", "50 x 70 cm"] }, { name: "Frame", values: ["Unframed", "Black frame", "Oak frame"] }], add: { "A3": 10, "50 x 70 cm": 26, "Black frame": 45, "Oak frame": 45 } },
      { title: "Slow Sundays print", price: "$32.00", image: "posters-wavy-checks.webp", options: [{ name: "Size", values: ["A4", "A3", "50 x 70 cm"] }, { name: "Frame", values: ["Unframed", "Black frame", "Oak frame"] }], add: { "A3": 10, "50 x 70 cm": 26, "Black frame": 45, "Oak frame": 45 } },
    ],
  },
  /* Templates round 22: a running coach (Amara Wells); four training plans and monthly coaching sell as products, pictured with black and white running photographs. */
  coach: {
    name: "Amara Wells",
    products: [
      { title: "Half marathon plan", price: "$79.00", compare: "$99.00", image: "coach-plan-half.webp", kind: "digital", description: "Twelve or sixteen weeks to 13.1 miles: mostly easy running, one steady session a week, a long run that grows slowly and two 20 minute strength sessions. Every run has a time and an effort, with a printable week view and a calendar file.", options: [{ name: "Length", values: ["16 weeks", "12 weeks"] }, { name: "Level", values: ["First half", "Faster half"] }] },
      { title: "5K from scratch", price: "$39.00", compare: "$49.00", image: "coach-plan-5k.webp", kind: "digital", description: "Eight weeks, three short sessions a week, from walking and running in pieces to 30 minutes of running without stopping." },
      { title: "Marathon plan", price: "$99.00", image: "coach-plan-marathon.webp", kind: "digital", description: "Eighteen weeks for a first or second marathon, with fuelling practice on the long runs and a pacing plan for race day." },
      { title: "Monthly coaching", price: "$149.00", image: "coach-monthly.webp", kind: "digital", description: "Your plan written four weeks at a time, every run read and answered within a day, and a call before your race. Stop or pause any month.", options: [{ name: "Calls", values: ["One a month", "Every two weeks"] }], add: { "Every two weeks": 60 } },
      { title: "Form check", price: "$60.00", image: "coach-form-review.webp", kind: "digital", description: "Send two short phone videos of you running and get a video reply with the two changes that matter most, and drills for each." },
    ],
    posts: [
      { title: "Why your easy runs are too fast", tag: "Training", image: "coach-dawn.webp", excerpt: "Most runners I coach run their easy days too hard and their hard days too easy. A simple test to find your easy pace, and why it matters.", html: `<p>If you can only say three words at a time, it is not an easy run. Most new runners spend every run in the same middle effort: too hard to recover from, too easy to get faster.</p><h2 id="test">The talk test</h2><p>Run with a friend, or say a few lines out loud. Full sentences mean easy. Short phrases mean steady. Single words mean hard.</p><ul><li>Easy: full sentences, most of your week</li><li>Steady: short phrases, once a week</li><li>Hard: single words, short pieces only</li></ul><blockquote>Slowing down feels wrong for about three weeks. Then the hard days start to feel better.</blockquote>` },
      { title: "Your first long run, step by step", tag: "Half marathon", image: "coach-road.webp", excerpt: "How far, how slow, what to eat and what to do the day after. Everything I tell runners before their first 10 mile run.", html: `<p>The long run builds the engine for race day. It only works if it is slow enough to finish feeling like you could do a little more.</p><h2 id="how">How to run it</h2><p>Start ten seconds per mile slower than you think. Walk the drink stops. Eat something small every 40 minutes after the first hour.</p><ul><li>Run it slower than your easy pace for the first mile</li><li>Practise the drink and gel you will use on race day</li><li>Go for a 20 minute walk the next day</li></ul>` },
      { title: "Twenty minutes of strength for runners", tag: "Strength", image: "coach-track.webp", excerpt: "Calves, hips and a plank. The short routine every one of my plans includes twice a week, with no gym.", html: `<p>Most running injuries I see start in the calves or the hips. Twenty minutes twice a week makes a real difference, and you can do it on your living room floor.</p><h2 id="routine">The routine</h2><ul><li>Single leg calf raises, 3 sets of 15</li><li>Split squats, 3 sets of 8 each side</li><li>Side plank, 3 sets of 30 seconds</li><li>Glute bridges, 3 sets of 12</li></ul><blockquote>Do it after an easy run, never the day before a long one.</blockquote>` },
    ],
  },
  /* Templates round 21: an online guitar course for beginners, sold as one product with a feedback edition, two short courses and a private lesson beside it; pictures are the teacher's photo series in one grey room. */
  course2: {
    name: "Fretline",
    products: [
      { title: "Guitar from Zero", price: "$149.00", compare: "$199.00", image: "course2-guitar-from-zero.webp", kind: "digital", description: "Eight modules and 64 short lessons, from holding the guitar to playing whole songs: first chords, strumming, five songs, riffs, barre chords and fingerpicking. With 20 play along songs at three speeds, printable chord sheets and a daily plan.", options: [{ name: "Edition", values: ["Self paced", "With feedback"] }, { name: "Seats", values: ["Just me", "Two seats"] }], add: { "With feedback": 80, "Two seats": 60 }, pictures: { "Self paced": "course2-guitar-from-zero.webp", "With feedback": "course2-video-feedback.webp" } },
      { title: "Barre Chords Bootcamp", price: "$49.00", image: "course2-barre-chords.webp", kind: "digital", description: "Twelve lessons over two weeks to make F, B minor and every E and A shape ring clean, with exercises that build strength without strain." },
      { title: "Song Library: 20 Songs", price: "$39.00", image: "course2-song-library.webp", kind: "digital", description: "Twenty songs broken down slowly, each with a chord sheet and a play along at three speeds." },
      { title: "Video Feedback", price: "$29.00", image: "course2-video-feedback.webp", kind: "digital", description: "Send a video of yourself playing and get a short video reply on what to change, within three days." },
      { title: "Private Lesson", price: "$60.00", image: "course2-private-lesson.webp", kind: "digital", description: "A 30 minute lesson with Jonas on video, on whatever you are stuck on, with a written practice plan after." },
    ],
  },

  /* Templates round 22: a short video course for creators and small brands (Cutaway), sold by a video sales letter; the course, its templates and a review call, with real photographs. */
  vsl: {
    name: "Cutaway",
    products: [
      { title: "The Short Video Course", price: "$349.00", compare: "$449.00", image: "vsl-course.webp", kind: "digital", description: "Six weeks from a blank camera roll to thirty posted videos: 30 short lessons on ideas, filming on a phone, editing, hooks and a posting schedule, the hook and script templates, notes on your first five videos and six live reviews on Tuesdays.", options: [{ name: "Access", values: ["Course", "Course and two coaching calls"] }, { name: "Payment", values: ["In full", "In three parts"] }], add: { "Course and two coaching calls": 180 } },
      { title: "Hook and script templates", price: "$39.00", image: "vsl-templates.webp", kind: "digital", description: "Fifty video openings, five script shapes and the idea sheet from the course, on their own." },
      { title: "Video review call", price: "$120.00", image: "vsl-review-call.webp", kind: "digital", description: "A 45 minute video call on three of your videos: hook, pace, captions and what to post next, with written notes after." },
    ],
  },
  /* Templates round 20: one course sold on a one offer page. Round 22: the topic is now a first half marathon (Negative Split), in orange, with real photographs. */
  courselanding: {
    name: "Negative Split",
    products: [
      { title: "Half Marathon Plan", price: "$129.00", compare: "$159.00", image: "courselanding-course.webp", kind: "digital", description: "Sixteen weeks from twenty minutes of jogging to your first half marathon: four runs a week laid out day by day, a short video for every week, two strength routines, a race week checklist and questions answered every Sunday.", options: [{ name: "Edition", values: ["Plan", "Plan with coaching"] }, { name: "Length", values: ["16 weeks", "20 weeks"] }], add: { "Plan with coaching": 90 } },
      { title: "Strength for runners", price: "$29.00", image: "courselanding-strength.webp", kind: "digital", description: "Two ten minute routines to do after a run, no gym and no kit, with a video for every move." },
      { title: "Race week call", price: "$45.00", image: "courselanding-call.webp", kind: "digital", description: "A 30 minute video call in the week before your race: pacing, food, kit and what to do on the morning, with notes after." },
      { title: "Printable training log", price: "$9.00", image: "courselanding-log.webp", kind: "digital", description: "Sixteen weeks on paper: every run, how it felt and what you ate before the long ones." },
    ],
  },
  /* Templates round 20: merch on an old desktop; plain tees, a hoodie, a cap and a beanie with pixel prints drawn on, and a drawn sticker sheet. */
  retro: {
    name: "Lowres Club",
    products: [
      { title: "Loading tee", price: "$34.00", image: "retro-loading-tee-white.webp", description: "An hourglass and a progress bar that never finishes, printed on heavy 240 gsm cotton with water based ink. Cut a little boxy with a dropped shoulder.", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }, { name: "Colour", values: ["White", "Black"] }], soldOut: ["XL"], pictures: { White: "retro-loading-tee-white.webp", Black: "retro-loading-tee-black.webp" } },
      { title: "Fatal error hoodie", price: "$68.00", compare: "$80.00", image: "retro-error-hoodie.webp", description: "Brushed back fleece with a double layer hood. The error dialog is printed big across the chest.", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Save me tee", price: "$34.00", image: "retro-floppy-tee.webp", description: "A floppy disk in navy on sky blue cotton.", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Cursor cap", price: "$28.00", image: "retro-cursor-cap.webp", description: "Six panel cotton cap with the arrow cursor stitched in white. One size, with a strap at the back." },
      { title: "Icon sticker sheet", price: "$8.00", image: "retro-sticker-pack.webp", description: "Nine die cut vinyl stickers, matte and waterproof." },
      { title: "Smiley beanie", price: "$26.00", image: "retro-smiley-beanie.webp", description: "Cable knit with a pom and a woven smiley label." },
    ],
  },
  /* Templates round 22: an author's money book for people in their twenties (Maya Okafor), in paperback, ebook and audiobook, with a printable workbook; the book, audiobook and workbook are drawn for the template. */
  authorbook: {
    name: "Maya Okafor",
    products: [
      { title: "Not Broke Anymore", price: "$18.00", compare: "$22.00", image: "authorbook-ed-book.webp", description: "Money for your twenties, without the guilt. Twelve short chapters on where your money goes, a budget with fun money in it, getting out of the overdraft, a first emergency fund and investing the boring way. 256 pages.", options: [{ name: "Format", values: ["Paperback", "Ebook", "Audiobook"] }], pictures: { Paperback: "authorbook-ed-book.webp", Ebook: "authorbook-cover.webp", Audiobook: "authorbook-ed-audio.webp" } },
      { title: "Book and workbook set", price: "$29.00", compare: "$36.00", image: "authorbook-ed-set.webp", description: "The paperback and the printed workbook: 52 pages of plans, trackers and the one page money map from chapter two." },
      { title: "Not Broke Anymore, audiobook", price: "$15.00", image: "authorbook-ed-audio.webp", kind: "digital", description: "Seven hours, read by the author, as MP3 files chapter by chapter." },
      { title: "The money workbook", price: "$12.00", image: "authorbook-workbook.webp", description: "52 pages to fill in: a month of tracking, the money map, a debt plan and a savings ladder." },
    ],
  },
  /* Templates round 21: a business coach for creative founders; a group programme, a short course, private mentoring and a pricing calculator, pictured with the coach's own photographs. */
  coachpro: {
    name: "Camila Duarte",
    products: [
      { title: "Studio Foundations", price: "$1,450.00", compare: "$1,750.00", image: "coachpro-foundations.webp", kind: "digital", description: "Twelve weeks in a small group to set prices you can say out loud, find clients worth keeping and build a week with real edges. A live call every Tuesday, short lessons between calls and a private group of twelve.", options: [{ name: "Round", values: ["March round", "September round"] }, { name: "Payment", values: ["In full", "Three monthly parts"] }], add: { "Three monthly parts": 90 } },
      { title: "Price It Right", price: "$149.00", compare: "$199.00", image: "coachpro-pricing.webp", kind: "digital", description: "A self paced course on the numbers behind a fair quote: your real hourly cost, a day rate that holds and how to present a price. About three hours, with the calculator." },
      { title: "One to one mentoring", price: "$2,400.00", image: "coachpro-mentoring.webp", kind: "digital", description: "Three months of private mentoring for a bigger move: a first hire, a price change or a new direction. Fortnightly calls and answers between them.", options: [{ name: "Calls", values: ["Fortnightly", "Weekly"] }], add: { Weekly: 1200 } },
      { title: "Studio pricing calculator", price: "$29.00", image: "coachpro-moment-desk.webp", kind: "digital", description: "The spreadsheet behind the free worksheet: costs, day rate, project quote and a margin check, with a short video." },
    ],
  },
  /* Templates round 21: a content creator's courses, a Notion template and a call; covers drawn around the creator's own photographs. */
  creatorpro: {
    name: "Nina Brooks",
    products: [
      { title: "Launch Lab", price: "$249.00", compare: "$349.00", image: "creatorpro-p-launch.webp", kind: "digital", description: "Eight weeks from an idea to your first paid digital product: the offer, the sales page, the emails and the launch. 32 short lessons, templates for every step and a live call every Thursday.", options: [{ name: "Access", values: ["Course", "Course and two private calls"] }, { name: "Payment", values: ["In full", "In three parts"] }], add: { "Course and two private calls": 300 } },
      { title: "YouTube from Zero", price: "$129.00", image: "creatorpro-p-youtube.webp", kind: "digital", description: "Plan, film and edit your first ten videos with a phone and a lamp. 24 lessons, about five hours." },
      { title: "The Creator OS", price: "$29.00", image: "creatorpro-p-os.webp", kind: "digital", description: "The Notion workspace Nina runs her business from: ideas, a content plan, offers and sponsors, with a video walkthrough." },
      { title: "Strategy call", price: "$180.00", image: "creatorpro-p-call.webp", kind: "digital", description: "One hour on a video call about your offer, your audience or your launch plan, with written notes after." },
    ],
    posts: [
      { title: "Sell a workshop before the course", tag: "Offers", image: "creatorpro-desk.webp", excerpt: "Why my first paid product was a two hour live workshop for forty readers, and how it told me what the course should be.", html: `<p>A course takes months to make. A workshop takes a weekend. Selling one first tells you whether people will pay, and what they actually want to learn.</p><h2 id="how">How I ran it</h2><ul><li>One email to the list with a date, a price and three things they would leave with</li><li>A simple checkout page and a calendar invite</li><li>Questions collected the day before</li></ul><blockquote>The questions people asked became the outline of Launch Lab.</blockquote>` },
      { title: "Filming with a phone and a window", tag: "Video", image: "creatorpro-wide.webp", excerpt: "The studio came later. My first fifty videos were filmed on a phone by a window, and that is still what I recommend.", html: `<p>Good light matters more than a good camera. Sit facing a window, put the phone at eye level and record your sound close to your mouth.</p><h2 id="kit">The whole kit</h2><ul><li>A phone and a cheap tripod</li><li>A clip on microphone</li><li>A window, facing you</li></ul>` },
      { title: "A newsletter you can keep up", tag: "Audience", image: "creatorpro-podcast.webp", excerpt: "One idea, five minutes, every Tuesday. The rules that kept my letter going for five years.", html: `<p>The best newsletter is the one you still send in a year. Mine is short on purpose, goes out on the same day every week, and always has one thing to try.</p><h2 id="rules">Three rules</h2><ul><li>Same day, every week</li><li>One idea per letter</li><li>Write it in under an hour</li></ul>` },
    ],
  },
  /* Templates round 21: Digital Renaissance, an AI course for business owners in two editions, a prompt library and an audit call. Round 22: real photographs instead of drawn covers. */
  renaissance: {
    name: "Digital Renaissance",
    products: [
      { title: "Digital Renaissance", price: "$297.00", compare: "$397.00", image: "renaissance-course.webp", kind: "digital", description: "Six modules and 40 short lessons on using AI in a small business: writing in your own voice, customer service and sales, research, automations and a weekly routine. With the prompt library, the voice guide, ten automation recipes and lifetime updates.", options: [{ name: "Edition", values: ["Self paced", "Cohort edition"] }, { name: "Payment", values: ["In full", "Three monthly parts"] }], add: { "Cohort edition": 200, "Three monthly parts": 18 }, pictures: { "Self paced": "renaissance-course.webp", "Cohort edition": "renaissance-cohort.webp" } },
      { title: "Cohort edition", price: "$497.00", compare: "$697.00", image: "renaissance-cohort.webp", kind: "digital", description: "The full course with twelve live calls on Thursdays and a private AI audit." },
      { title: "Prompt library", price: "$49.00", image: "renaissance-prompts.webp", kind: "digital", description: "150 prompts sorted by task, updated every month." },
      { title: "AI audit call", price: "$190.00", image: "renaissance-audit.webp", kind: "digital", description: "Sixty minutes on a video call about your own business, with a written plan after." },
    ],
  },
  /* Templates round 21: a merch shop on a sunny XP style desktop; plain tees, a crew, a cap and a beanie (Unsplash photographs, recoloured, prints drawn on) on one pale ground, and a drawn sticker sheet. */
  xpshop: {
    name: "Hilltop Supply",
    products: [
      { title: "Hillside tee", price: "$36.00", image: "xpshop-hillside-tee-white.webp", description: "A hill, a sky and two clouds in a rounded window, printed on heavy 240 gsm cotton with water based ink. Cut a little boxy with a dropped shoulder.", options: [{ name: "Colour", values: ["White", "Sky"] }, { name: "Size", values: ["S", "M", "L", "XL"] }], soldOut: ["XL"], pictures: { White: "xpshop-hillside-tee-white.webp", Sky: "xpshop-hillside-tee-sky.webp" } },
      { title: "Start crew", price: "$72.00", compare: "$88.00", image: "xpshop-start-crew-green.webp", description: "Brushed back fleece crewneck with our green hilltop button printed on the chest. Ribbed cuffs and hem.", options: [{ name: "Colour", values: ["Green", "White"] }, { name: "Size", values: ["S", "M", "L", "XL"] }], pictures: { Green: "xpshop-start-crew-green.webp", White: "xpshop-start-crew-white.webp" } },
      { title: "Balloon tee", price: "$36.00", image: "xpshop-balloon-tee-black.webp", description: "A yellow notice balloon that says the new drop is ready. Heavy cotton, printed to order.", options: [{ name: "Colour", values: ["Black", "White"] }, { name: "Size", values: ["S", "M", "L", "XL"] }], pictures: { Black: "xpshop-balloon-tee-black.webp", White: "xpshop-balloon-tee-white.webp" } },
      { title: "Cloud cap", price: "$30.00", image: "xpshop-cloud-cap-blue.webp", description: "Six panel cotton twill cap with a white cloud stitched on the front. One size, with a strap at the back." },
      { title: "Desktop sticker sheet", price: "$9.00", image: "xpshop-sticker-pack.webp", description: "Seven die cut stickers on one sheet: a hill, a window, the green button, a clock, a cursor, a cloud and a balloon. Matte vinyl, waterproof." },
      { title: "Meadow beanie", price: "$28.00", image: "xpshop-meadow-beanie.webp", description: "Chunky cable knit in grass green with a pom and a woven hilltop label." },
    ],
    posts: [
      { title: "How a print goes from sketch to tee", tag: "Studio", image: "xpshop-hillside-tee-sky.webp", excerpt: "Every print starts on paper. How we turn a doodle of a hill into a clean file the studio can print on cotton.", html: `<p>Each print starts as a pencil sketch, usually on the back of an envelope. If it still makes us smile a week later, it goes on.</p><h2 id="file">From sketch to file</h2><p>We redraw it as a clean vector with no more than four colours, then print it at full size on paper and pin it to a tee to check the scale.</p><ul><li>Four colours at most, so the ink stays soft</li><li>Checked at full size before it goes to the studio</li><li>Every colour of tee gets its own proof</li></ul><h2 id="print">Printing</h2><p>The studio prints each piece when it is ordered, with water based ink pressed into the cotton.</p>` },
      { title: "Why the green button is on a crewneck", tag: "Behind the drop", image: "xpshop-start-crew-green.webp", excerpt: "The first thing anyone clicked. Why we put our own version of it on a heavy fleece crew, and what it took to get the green right.", html: `<p>For a lot of us the first click on a computer was a green button in the bottom left corner. We drew our own, with our name on it.</p><h2 id="green">Getting the green right</h2><p>Green ink on green fleece is hard to see, so the button sits on a lighter green with a darker edge. It took three proofs.</p><ul><li>Brushed back fleece, 400 gsm</li><li>Ribbed cuffs and hem</li><li>Printed to order</li></ul>` },
      { title: "Seven stickers, one sheet", tag: "Notes", image: "xpshop-sticker-pack.webp", excerpt: "How we picked the seven icons on the sticker sheet, and the one that nearly made it.", html: `<p>A hill, a window, the green button, a clock, a cursor, a cloud and a balloon. Seven small pictures that anyone who sat at that desk will know.</p><h2 id="cut">Cut to shape</h2><p>Each sticker is cut around its outline with a white border, in matte waterproof vinyl that peels off clean.</p><blockquote>The one that nearly made it was a paperclip. Maybe next time.</blockquote>` },
    ],
  },
  /* Templates round 22: Fieldhouse, a print on demand hometown apparel shop; plain tees, crews, a cap and a beanie (Unsplash photographs, cut out and recoloured, prints drawn on) on one light grey ground. */
  podshop: {
    name: "Fieldhouse",
    products: [
      { title: "River City tee", price: "$38.00", compare: "$45.00", image: "podshop-rivercity-tee-black.webp", description: "Our skyline print in red and cream on heavy 220 gsm cotton, printed with water based ink when you order. Cut regular with a ribbed collar.", options: [{ name: "Colour", values: ["Black", "White"] }, { name: "Size", values: ["S", "M", "L", "XL", "2XL"] }], add: { "2XL": 4 }, soldOut: ["White / 2XL"], pictures: { Black: "podshop-rivercity-tee-black.webp", White: "podshop-rivercity-tee-white.webp" } },
      { title: "Weekend Champions tee", price: "$38.00", image: "podshop-champions-tee-teal.webp", description: "Undefeated since Saturday. Coral script on a sea green tee, soft washed cotton.", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Hometown crewneck", price: "$75.00", image: "podshop-hometown-crew-red.webp", description: "Brushed back fleece crewneck with the hometown heart printed on the chest. Ribbed cuffs and hem.", options: [{ name: "Colour", values: ["Red", "Navy"] }, { name: "Size", values: ["S", "M", "L", "XL"] }], pictures: { Red: "podshop-hometown-crew-red.webp", Navy: "podshop-hometown-crew-navy.webp" } },
      { title: "Game Day crewneck", price: "$68.00", image: "podshop-gameday-crew-white.webp", description: "A navy pennant on a white fleece crew, for every home game and the drive there.", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Front Porch Social Club tee", price: "$36.00", image: "podshop-porch-tee-grey.webp", description: "A round badge print for the people who stay out on the porch after dark. Heather grey cotton.", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "Good Days tee", price: "$36.00", image: "podshop-gooddays-tee-sand.webp", description: "A rising sun in coral and gold on a sand coloured tee.", options: [{ name: "Size", values: ["S", "M", "L", "XL"] }] },
      { title: "RC cap", price: "$30.00", image: "podshop-rc-cap-navy.webp", description: "Six panel cotton twill cap with RC stitched on the front. One size, with a strap at the back." },
      { title: "Pom beanie", price: "$28.00", image: "podshop-pom-beanie-red.webp", description: "Chunky cable knit in red with a pom and a woven Fieldhouse label." },
    ],
    posts: [
      { title: "How a print goes from sketch to shirt", tag: "Print shop", image: "podshop-rivercity-tee-black.webp", excerpt: "Every design starts as a pencil sketch. How the River City skyline became a print, and why it waits until you order it.", html: `<p>The River City print started as a sketch on the back of a receipt, drawn from the bridge on a slow Sunday.</p><h2 id="file">From sketch to file</h2><p>We redraw each design as a clean file with no more than four ink colours, then proof it at full size on every colour of shirt.</p><ul><li>Four colours at most, so the print stays soft</li><li>Proofed on every shirt colour we sell</li><li>Printed when you order, so nothing sits in a box</li></ul><h2 id="print">Printing</h2><p>Each order is printed in the shop with water based ink and heat cured, then folded and packed the same week.</p>` },
      { title: "Finding your size", tag: "Fit notes", image: "podshop-champions-tee-teal.webp", excerpt: "Our tees run true to size and our crewnecks run roomy. A short guide to picking the right one the first time.", html: `<p>Lay a shirt you like flat and measure across the chest, armpit to armpit. Compare it with the size chart on the product page.</p><h2 id="tees">Tees</h2><p>Regular fit, true to size. Size up for a looser, boxier look.</p><h2 id="crews">Crewnecks</h2><p>Cut roomy for layering. Stay with your usual size, or size down for a closer fit.</p><blockquote>Still not sure? Order your best guess. Size swaps are free for 30 days.</blockquote>` },
      { title: "Matching tees for the whole family", tag: "Gifts", image: "podshop-hometown-crew-red.webp", excerpt: "Reunions, team days and birthdays. How to order one print in every size, from youth small to adult 2XL.", html: `<p>Pick one print and add each size to the cart. Every shirt is printed in the same run, so the colours match exactly.</p><h2 id="sizes">Sizes</h2><p>Most prints come in youth and adult sizes. Write to us for ten or more and we will set up a group order.</p><ul><li>One print, every size</li><li>Printed in the same run</li><li>Free shipping over $75</li></ul>` },
    ],
  },
  capstees: {
    name: "Fairweather",
    products: [
      { title: "Twill cap, mustard", price: "$38.00", image: "capstees-cap-mustard.webp", description: "Six panel washed cotton twill with a curved peak and a strap at the back. One size." },
      { title: "Twill cap, rose", price: "$38.00", image: "capstees-cap-rose.webp", description: "Six panel washed cotton twill with a curved peak and a strap at the back. One size." },
      { title: "Twill cap, rust", price: "$38.00", image: "capstees-cap-rust.webp", description: "Six panel washed cotton twill with a curved peak and a strap at the back. One size." },
      { title: "Twill cap, black", price: "$38.00", image: "capstees-cap-black.webp", description: "Six panel washed cotton twill with a curved peak and a strap at the back. One size." },
      { title: "Wordmark tee, white", price: "$36.00", image: "capstees-tee-white.webp", description: "Heavy 240 gsm combed cotton with our name printed across the chest in water based ink. Easy fit, dropped shoulders.", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL", "XXL"] }], soldOut: ["XS"] },
      { title: "Wordmark tee, black", price: "$36.00", image: "capstees-tee-black.webp", description: "Heavy 240 gsm combed cotton with our name printed across the chest in water based ink. Easy fit, dropped shoulders.", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL", "XXL"] }] },
      { title: "Wordmark tee, bottle green", price: "$36.00", image: "capstees-tee-bottle.webp", description: "Heavy 240 gsm combed cotton with our name printed across the chest in water based ink. Easy fit, dropped shoulders.", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL", "XXL"] }] },
      { title: "Wordmark tee, sand", price: "$36.00", compare: "$42.00", image: "capstees-tee-sand.webp", description: "Heavy 240 gsm combed cotton with our name printed across the chest in water based ink. Easy fit, dropped shoulders.", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL", "XXL"] }] },
      { title: "Heavy crewneck, ash", price: "$72.00", image: "capstees-crew-ash.webp", description: "400 gsm brushed back fleece with ribbed cuffs and hem and a small printed mark on the chest.", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL", "XXL"] }] },
      { title: "Heavy crewneck, black", price: "$72.00", image: "capstees-crew-black.webp", description: "400 gsm brushed back fleece with ribbed cuffs and hem and a small printed mark on the chest.", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL", "XXL"] }] },
      { title: "Heavy crewneck, forest", price: "$72.00", image: "capstees-crew-forest.webp", description: "400 gsm brushed back fleece with ribbed cuffs and hem and a small printed mark on the chest.", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL", "XXL"] }], soldOut: ["XXL"] },
      { title: "Heavy crewneck, brown", price: "$72.00", image: "capstees-crew-brown.webp", description: "400 gsm brushed back fleece with ribbed cuffs and hem and a small printed mark on the chest.", options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL", "XXL"] }] },
    ],
    posts: [
      { title: "How a run of fifty is made", tag: "Workshop", image: "capstees-tee-white.webp", excerpt: "From a bolt of cotton to fifty folded tees: cutting, printing, stitching and the week it takes.", html: `<p>Every colour we sell is made in a run of fifty. Here is what happens in the week between ordering the cotton and folding the last tee.</p><h2 id="cut">Cutting</h2><p>The cotton arrives on a roll and rests for a day so it settles. Then it is cut in stacks of ten, by hand, with a pattern we have used since the first run.</p><h2 id="print">Printing</h2><p>The wordmark is printed with water based ink, pressed into the cotton rather than sitting on top, so it fades with the fabric instead of cracking.</p><ul><li>Fifty pieces per colour</li><li>Printed and stitched in one workshop</li><li>Folded and packed by hand</li></ul>` },
      { title: "Four new cap colours", tag: "New", image: "capstees-cap-rose.webp", excerpt: "Mustard, rose, rust and black, in the same washed twill. Why we picked these four.", html: `<p>The twill cap now comes in four colours. We dyed a dozen samples and wore them for a month before choosing.</p><h2 id="why">Why these</h2><p>Each one goes with everything else we make, and each one looks better after a summer of sun than it did on day one.</p><blockquote>Rose was the one nobody wanted to give back.</blockquote>` },
      { title: "Looking after a heavy crewneck", tag: "Care", image: "capstees-crew-forest.webp", excerpt: "Wash it less, wash it cold, and never tumble dry. A short guide to keeping fleece soft for years.", html: `<p>Brushed fleece gets softer with time if you treat it gently.</p><h2 id="wash">Washing</h2><ul><li>Cold, inside out, with similar colours</li><li>No fabric softener, it flattens the brushed back</li><li>Dry flat, away from the radiator</li></ul><p>Done this way a crewneck keeps its shape and colour for years.</p>` },
    ],
  },
}
