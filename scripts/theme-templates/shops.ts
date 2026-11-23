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
    name: "The Quiet Hour",
    products: [
      { title: "The Quiet Hour", price: "$18.00", compare: "$22.00", image: "ebooks-product-book.webp", kind: "digital", description: "A calm, practical guide to doing your best work in a busy life. 196 pages in nine short chapters, each ending with one small thing to try the next day.", options: [{ name: "Format", values: ["PDF and EPUB", "With the audiobook"] }], add: { "With the audiobook": 9 } },
      { title: "The Quiet Hour, complete set", price: "$39.00", compare: "$50.00", image: "ebooks-product-bundle.webp", kind: "digital", description: "The ebook, the printable workbook, the audiobook read by the author and Ten Quiet Mornings." },
      { title: "The Quiet Hour Workbook", price: "$12.00", image: "ebooks-product-workbook.webp", kind: "digital", description: "A 40 page printable workbook with every exercise from the book and weekly planning pages." },
      { title: "Ten Quiet Mornings", price: "$9.00", image: "ebooks-product-mornings.webp", kind: "digital", description: "A short companion: ten mornings, ten small changes, one page each." },
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
  /* Templates round 20: a life and business coach; sessions and programmes sell as products. */
  coach: {
    name: "Leah Morgan Coaching",
    products: [
      { title: "One to one coaching", price: "$160.00", image: "coach-offer-one.webp", kind: "digital", description: "Private 50 minute sessions to untangle one big decision and leave with a plan you will keep. Notes after every session and a short check in between calls.", options: [{ name: "Sessions", values: ["One session", "Six sessions"] }, { name: "Where", values: ["In Bristol", "Online"] }], add: { "Six sessions": 720 } },
      { title: "The Clear Path group", price: "$480.00", compare: "$560.00", image: "coach-offer-group.webp", kind: "digital", description: "Eight Tuesday evenings online with five other women at the same crossroads. Early places are $480." },
      { title: "Online session", price: "$140.00", image: "coach-offer-online.webp", kind: "digital", description: "One coaching session on a video call, wherever you are.", options: [{ name: "Length", values: ["50 minutes", "80 minutes"] }], add: { "80 minutes": 70 } },
      { title: "The clarity workbook", price: "$24.00", image: "coach-guide.webp", kind: "digital", description: "A printable workbook of the exercises I use in first sessions: forty pages to fill in at your own pace." },
      { title: "Gift a session", price: "$160.00", image: "coach-grid-4.webp", kind: "digital", description: "One 50 minute session for someone else, with a card to print or send." },
    ],
  },
  /* Templates round 20: one home barista course sold as a product, with two short courses and a call beside it; covers are drawn screens with real photographs in them. */
  course2: {
    name: "Slow Bloom",
    products: [
      { title: "Home Barista Course", price: "$149.00", compare: "$199.00", image: "course2-home-barista.webp", kind: "digital", description: "Seven modules and 46 short lessons, filmed at a home machine: beans, grinding, espresso, dialling in, milk, latte art and pour over. With printable recipe cards and grind charts.", options: [{ name: "Edition", values: ["Self paced", "With feedback"] }, { name: "Seats", values: ["Just me", "Team of 3"] }], add: { "With feedback": 80, "Team of 3": 200 }, pictures: { "Self paced": "course2-home-barista.webp", "With feedback": "course2-home-barista-feedback.webp" } },
      { title: "Milk and Latte Art", price: "$49.00", image: "course2-latte-art.webp", kind: "digital", description: "A short course of 12 lessons on steaming milk and pouring a heart, a tulip and a rosetta." },
      { title: "Pour Over at Home", price: "$39.00", image: "course2-pour-over.webp", kind: "digital", description: "Eight lessons and one recipe for pour over and cafetiere, by weight." },
      { title: "One to One Dial In", price: "$60.00", image: "course2-one-to-one.webp", kind: "digital", description: "A 45 minute video call on your own machine and grinder, with a written plan after." },
    ],
  },
  /* Templates round 21: a podcast launch course sold by a video sales letter; the course, its starter kit and a review call. */
  vsl: {
    name: "Longwave",
    products: [
      { title: "The Podcast Launch Course", price: "$397.00", compare: "$497.00", image: "vsl-course.webp", kind: "digital", description: "Eight weeks from idea to ten published episodes: 24 short lessons on format, gear, recording, editing and launch, the show starter kit, notes on your first episode and eight live calls on Thursdays.", options: [{ name: "Access", values: ["Course", "Course and two coaching calls"] }, { name: "Payment", values: ["In full", "In three parts"] }], add: { "Course and two coaching calls": 200 } },
      { title: "Show starter kit", price: "$49.00", image: "vsl-templates.webp", kind: "digital", description: "The episode outlines, guest email, show notes and launch checklist from the course, on their own." },
      { title: "Episode review call", price: "$150.00", image: "vsl-review-call.webp", kind: "digital", description: "A 45 minute video call on one of your episodes: sound, pace and structure, with written notes after." },
    ],
  },
  /* Templates round 20: one course sold on a one offer page. Round 21: the topic is now personal finance (Evenly); the course and its extras drawn as phone screens, with real photographs in the lesson and call screens. */
  courselanding: {
    name: "Evenly",
    products: [
      { title: "Evenly", price: "$89.00", compare: "$119.00", image: "courselanding-course.webp", kind: "digital", description: "A four week course on everyday money: 24 short lessons on tracking spending, a budget you keep, debt, saving and investing, a live Q&A every Thursday, the budget spreadsheet and a printable workbook.", options: [{ name: "Edition", values: ["Course", "With a money review"] }, { name: "Seats", values: ["Just me", "Two people"] }], add: { "With a money review": 60, "Two people": 60 }, pictures: { Course: "courselanding-course.webp", "With a money review": "courselanding-course-review.webp" } },
      { title: "Budget spreadsheet", price: "$19.00", image: "courselanding-spreadsheet.webp", kind: "digital", description: "The spreadsheet from the course: income, bills, three pots and a payoff plan, with a short video on each tab." },
      { title: "Money review call", price: "$45.00", image: "courselanding-review-call.webp", kind: "digital", description: "A 30 minute video call to go through your budget and plan, with notes after. Teaching, not personal financial advice." },
      { title: "Printable workbook", price: "$11.00", image: "courselanding-workbook.webp", kind: "digital", description: "A worksheet for every lesson, to print or fill in on screen." },
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
  /* Templates round 21: an author's book in three editions and a printable journal; the cover, phone and pages are drawn for the template. */
  authorbook: {
    name: "Theo Marlow",
    products: [
      { title: "Read More, Keep More", price: "$16.00", compare: "$20.00", image: "authorbook-ed-ebook.webp", kind: "digital", description: "A simple way to read more books and remember what is in them. Twelve short chapters, each ending with one small thing to try the same day. 240 pages as PDF and EPUB.", options: [{ name: "Format", values: ["Ebook", "Ebook and audiobook"] }], add: { "Ebook and audiobook": 9 }, pictures: { Ebook: "authorbook-ed-ebook.webp", "Ebook and audiobook": "authorbook-ed-audio.webp" } },
      { title: "The complete reading set", price: "$34.00", compare: "$46.00", image: "authorbook-ed-set.webp", kind: "digital", description: "The ebook, the audiobook read by Theo and the printable Reading Journal, with notes templates for fifty books." },
      { title: "Read More, Keep More, audiobook", price: "$14.00", image: "authorbook-ed-audio.webp", kind: "digital", description: "Six hours, read by the author, as MP3 files chapter by chapter." },
      { title: "The Reading Journal", price: "$9.00", image: "authorbook-journal.webp", kind: "digital", description: "A printable reading log and a one page notes sheet for every book you finish." },
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
      { title: "Launch Lab", price: "$249.00", compare: "$349.00", image: "creatorpro-course-launch.webp", kind: "digital", description: "Eight weeks from an idea to your first paid digital product: the offer, the sales page, the emails and the launch. 32 short lessons, templates for every step and a live call every Thursday.", options: [{ name: "Access", values: ["Course", "Course and two private calls"] }, { name: "Payment", values: ["In full", "In three parts"] }], add: { "Course and two private calls": 300 } },
      { title: "YouTube from Zero", price: "$129.00", image: "creatorpro-course-youtube.webp", kind: "digital", description: "Plan, film and edit your first ten videos with a phone and a lamp. 24 lessons, about five hours." },
      { title: "The Creator OS", price: "$29.00", image: "creatorpro-course-os.webp", kind: "digital", description: "The Notion workspace Nina runs her business from: ideas, a content plan, offers and sponsors, with a video walkthrough." },
      { title: "Strategy call", price: "$180.00", image: "creatorpro-call.webp", kind: "digital", description: "One hour on a video call about your offer, your audience or your launch plan, with written notes after." },
    ],
  },
}
