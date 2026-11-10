/**
 * ===========================================================================
 *  ROUND R (R4): WHAT THE SCRIPTED MODEL "WRITES" FOR EACH OF THE SIX
 * ===========================================================================
 * No API key here, so the model is scripted. These are its words and
 * decisions, written by hand per business the way a careful model would
 * answer the brief: the copy (by role: headings, paragraphs, offers, steps,
 * questions, facts), the concept's own lines (its name, mood, signature
 * moves), the picture briefs, and the native engine's plan (preset, palette,
 * type and every page's Storelib sections).
 *
 * SAID PLAINLY: these measure the SYSTEM (the loop, tools, templates,
 * validation, render, editor, publish, the direction and story logic)
 * against realistic outputs. They say nothing about how good a real model's
 * words or choices are; scripts/ai-builder/eval.ts --live does that.
 *
 * No invented proof anywhere: no reviews, client counts, awards or logos.
 * Prices are the seeded products' own.
 */
import type { EvalScenarioId } from "@/lib/ai-builder/eval/scenarios"

export interface Deck {
  brand: string
  /** The hero headline, split as a template sets it over several lines. */
  heroLines: string[]
  headings: string[]
  bodies: string[]
  shorts: string[]
  ctas: string[]
  facts: [string, string][]
  steps: [string, string][]
  offers: [string, string, string][]
  principles: [string, string][]
  faqs: [string, string][]
  fitYes: string[]
  fitNo: string[]
  notices: string[]
  /** What the pictures show, by slot purpose words. */
  pictures: { match: RegExp; prompt: string; alt: string }[]
  concept: { name: string; mood: string[]; rule: string; principles: string[]; signatureMoves: string[]; imagery: string; moves: string[]; accentUse: string }
  /** The native engine's plan (submit_site_plan arguments, the pages filled in by nativePlan). */
  native: { preset: string; palette: { direction: string; background: string; surface: string; text: string; heading: string; accent: string; button: string; button_text: string }; typography: { heading: string; body: string }; voice: { tone: string; use: string[]; avoid: string[] }; audience: string; conversion: string; imagery: string; home: NativeSection[]; pages: { key: string; title: string; purpose: string; sections: NativeSection[] }[] }
}

export type NativeSection = [type: string, content: string, scheme: "light" | "dark" | "alt", layout?: [string, string][], images?: [slot: string, query: string, aspect: "landscape" | "portrait" | "square"][]]

export const DECKS: Record<EvalScenarioId, Deck> = {
  fitness: {
    brand: "Halden Strength",
    heroLines: ["Strong", "by", "spring"],
    headings: ["Coaching for people with full diaries", "One coach, every session", "How the first month runs", "Who this is for", "Book a free consultation", "Training that fits a working week", "What a session looks like", "Where we train", "Questions before you book", "The plan, written for you", "Progress you can read", "Start with a conversation", "Ways to train", "Your first four weeks", "Coached in Ancoats", "Strength that lasts"],
    bodies: [
      "One to one strength coaching in Manchester for people who sit at a desk all day and want to lift properly, without guessing.",
      "Every session is coached: your coach sets the weights, watches the reps and writes down what moved, so the next week starts from a fact.",
      "The free consultation is forty minutes. We look at how you move, what your weeks really look like and what you want from training, then you decide.",
      "Sessions run before work, at lunch and in the evening, Monday to Saturday, in a private studio in Ancoats or online with video checks.",
      "The online programme gives you the same plan in an app, with your top sets checked on video every week.",
      "No crash plans. The work is squats, hinges, presses, carries and conditioning that fits the time you have.",
      "Twelve coached sessions over four to six weeks, a written plan for the days between and a check in after every block.",
      "If a session has to move, move it with a day's notice. Unused sessions carry over or are refunded.",
      "You leave the consultation with a first plan, whether you train with us or not.",
      "Numbers are logged every session, so a stronger squat is something you can see, not something you hope for.",
      "Bring flat shoes, water and something you can move in. Everything else is here.",
      "Coaching is led by one coach from the first session to the last, so nobody has to learn you twice.",
    ],
    shorts: ["Squat", "Hinge", "Press", "Carry", "Mobility", "Conditioning", "Warm up", "Top set", "Notes", "Ancoats", "Mornings", "Evenings"],
    ctas: ["Book a free consultation", "See coaching options", "Book a free consultation", "Ask a question"],
    facts: [["Session", "60 minutes"], ["Where", "Ancoats studio or online"], ["When", "6am to 8pm, Monday to Saturday"], ["Start", "Any Monday"], ["Reply", "Within one working day"], ["Block", "12 sessions"], ["Price", "£720 for 12 sessions"], ["Online", "Weekly video checks"]],
    steps: [["The consultation", "Forty minutes on how you move, your weeks and your goal. Free, no obligation."], ["A plan for your week", "Written around the days and the kit you really have, two or three sessions a week."], ["Coached sessions", "Every rep watched, weights set for the day, notes kept."], ["Check in", "After every four weeks we look at the numbers and change the plan."]],
    offers: [["One to one", "Twelve coached sessions in the Ancoats studio, a written plan between them.", "£720"], ["Online programme", "The plan in an app, video checks on your top sets every week.", "Monthly"], ["Pairs", "Train with a partner on the same plan and split the cost of a coach.", "60 min"]],
    principles: [["Form before load", "Weight goes on the bar once the movement is right, never the other way round."], ["Plans for real weeks", "Two or three sessions written around work, not around an ideal week."], ["Numbers you can see", "Every lift logged, so progress is a fact."], ["One coach", "The same person every session, from the consultation on."]],
    faqs: [["Do I need to be fit already?", "No. The consultation finds where you are today and the plan starts there."], ["What does the free consultation include?", "Forty minutes, a movement check and a first plan you keep either way."], ["Can I train online only?", "Yes. The online programme is the same plan with weekly video checks."], ["I have an old injury. Can I still train?", "Usually, yes. Tell us at the consultation and bring any notes from your physio."], ["How do I pay?", "Online when you book the block of twelve sessions."]],
    fitYes: ["You work long hours and want training that fits around them", "You want to lift properly and know why each session is there", "You are coming back after a long break"],
    fitNo: ["You want a six week crash plan", "You would rather not log what you lift", "You need medical rehab: see a physio first"],
    notices: ["Free consultations this week: mornings and evenings", "Training in Ancoats or online"],
    pictures: [
      { match: /hero|opening|cover/i, prompt: "a coach spotting a client's squat in a concrete strength studio, morning light, chalk in the air", alt: "A coach spotting a client's squat in the Ancoats studio" },
      { match: /coach|portrait|about|people/i, prompt: "portrait of a strength coach leaning on a squat rack, natural light, plain concrete wall", alt: "The coach by the squat rack" },
      { match: /.*/, prompt: "barbell, chalk and a training notebook on a rubber gym floor, top down", alt: "A barbell, chalk and the session notebook" },
    ],
    concept: { name: "Logged and loaded", mood: ["direct", "calm", "exact"], rule: "Headlines set tight in heavy grotesk, sentence case; numbers in tabular figures", principles: ["Big left aligned headlines over full bleed training photos", "Session facts set like a timetable"], signatureMoves: ["The session log as a design element: every block shows its numbers"], imagery: "Real training in a concrete studio, morning light, no stock smiles", moves: ["Headings rise once on scroll", "Photos scale slightly as they enter"], accentUse: "The booking button and live session times only" },
    native: {
      preset: "performance_sport",
      palette: { direction: "Charcoal and chalk with one signal colour for booking", background: "#f2f2ef", surface: "#e4e4df", text: "#141414", heading: "#0d0d0d", accent: "#d7ff3a", button: "#141414", button_text: "#f2f2ef" },
      typography: { heading: "Archivo", body: "Inter" },
      voice: { tone: "direct, plain, encouraging", use: ["coached", "logged", "session"], avoid: ["transform", "beast mode", "elevate"] },
      audience: "Busy professionals in Manchester who want to lift properly",
      conversion: "Book a free consultation",
      imagery: "Real coaching in a concrete studio",
      home: [
        ["hero_media", "A coached squat in the studio; headline Strong by spring; book the consultation", "dark", [["overlay_style", "bottom"], ["height", "80"]], [["image", "coach spotting squat concrete gym", "landscape"]]],
        ["marquee", "Squat, hinge, press, carry, conditioning, Ancoats, online", "alt", [["size", "medium"]]],
        ["text_image", "One coach for every session: who coaches you and how", "light", [["image_side", "left"]], [["image", "strength coach portrait gym", "portrait"]]],
        ["features_grid", "How the first month runs: consultation, plan, sessions, check in", "light", [["marker", "number"], ["columns", "4"]]],
        ["pricing_table", "Ways to train: one to one block, online programme, pairs", "alt"],
        ["sticky_story", "What a session looks like, warm up to notes", "light", [["media_side", "right"]], [["image", "barbell chalk notebook gym floor", "portrait"]]],
        ["text_columns", "Who this is for and who it is not for", "alt", [["columns", "2"]]],
        ["media_gallery", "The studio and the work", "light", [["columns", "3"]], [["block:picture", "strength training studio", "square"]]],
        ["faq_accordion", "Questions before you book", "light"],
        ["cta_banner", "Book a free consultation", "dark", [["background", "colour"]]],
      ],
      pages: [
        { key: "coaching", title: "Coaching", purpose: "The ways to train and what each includes", sections: [["hero_split", "Coaching options", "light", [["image_side", "right"]], [["image", "personal trainer client deadlift", "portrait"]]], ["pricing_table", "The three ways to train", "alt"], ["faq_columns", "Practical questions", "light"], ["cta_simple", "Book the consultation", "dark"]] },
        { key: "about", title: "About", purpose: "Who coaches you", sections: [["about_founder", "The coach and why one coach", "light", [], [["image", "strength coach portrait", "portrait"]]], ["features_grid", "Principles", "alt", [["marker", "number"]]], ["cta_simple", "Book the consultation", "dark"]] },
        { key: "contact", title: "Contact", purpose: "Book or ask", sections: [["contact", "Book a consultation or ask a question", "light", [["layout", "split"]]], ["media_map", "The Ancoats studio", "alt"]] },
      ],
    },
  },

  clothing: {
    brand: "Keld & Co",
    heroLines: ["Knit", "for", "weather"],
    headings: ["Drop 04 is in", "Made in small batches", "The overshirt", "The crew knit", "Next drop: sign up", "What we make", "From the mill to you", "Wool that is built to be worn", "Shop the drop", "How it fits", "Care for your knitwear", "Questions about orders", "Seasonal drops, not seasons", "Glasgow made", "Outerwear", "Last pieces"],
    bodies: [
      "Knitwear, overshirts and outerwear cut in Glasgow and made in runs of a few hundred, released when they are ready.",
      "Each drop is small. When a piece sells out it stays sold out, and the next drop is something new.",
      "The boiled wool overshirt is dense enough to wear as a jacket in autumn and light enough to layer in winter.",
      "Our lambswool crew is knitted in the Borders and washed soft before it reaches you.",
      "Sign up and we email you the day before a drop lands, with the pieces and the quantities.",
      "Most pieces fit true to size with room for a layer underneath. Each product page has the measurements.",
      "Hand wash cool or use the wool cycle, dry flat, and fold rather than hang.",
      "Orders ship from Glasgow within two working days. Returns are free within thirty days.",
      "We work with two mills and one workshop, and we name them on every product.",
      "Colours come from the yarn we can get in that season, so each drop has its own palette.",
      "Fewer, heavier pieces you wear for years.",
      "Outerwear arrives in the autumn drop: waxed cotton and boiled wool.",
    ],
    shorts: ["Knitwear", "Overshirts", "Outerwear", "Drop 04", "Lambswool", "Boiled wool", "Glasgow", "Borders mill", "Small batch", "New", "Sizing", "Care"],
    ctas: ["Shop the drop", "Join the drop list", "Shop knitwear", "See sizing"],
    facts: [["Made", "Glasgow and the Borders"], ["Run", "A few hundred per piece"], ["Shipping", "Within two working days"], ["Returns", "Free for thirty days"], ["Wool", "Lambswool and boiled wool"], ["Next drop", "Email list first"], ["Fit", "True to size"], ["Care", "Wool cycle, dry flat"]],
    steps: [["Yarn", "We choose the yarn the mill has that season."], ["Knit", "Knitted and washed in the Borders."], ["Cut and sew", "Overshirts cut and sewn in our Glasgow workshop."], ["Drop", "Released in one small run, emailed to the list first."]],
    offers: [["Boiled wool overshirt", "Dense, warm, worn as a jacket.", "£185"], ["Lambswool crew knit", "Knitted in the Borders, washed soft.", "£129"], ["Waxed field jacket", "Arrives with the autumn drop.", "Autumn"]],
    principles: [["Small runs", "Made in hundreds, never thousands."], ["Named makers", "Every product names its mill and workshop."], ["Built to wear", "Heavier cloth, reinforced seams."], ["No discounts", "One fair price from the first day."]],
    faqs: [["When is the next drop?", "We email the list the day before. Sign up at the bottom of the page."], ["Do you restock?", "Rarely. A sold out piece usually stays sold out."], ["How does sizing run?", "True to size with room for a layer. Measurements are on every product."], ["Where do you ship?", "The UK and Europe, from Glasgow."], ["Can I return something?", "Yes, free within thirty days if unworn."]],
    fitYes: ["You buy fewer things and wear them for years", "You want to know who made it", "You like knitwear with weight to it"],
    fitNo: ["You want a new look every week", "You need it tomorrow", "You are after a discount code"],
    notices: ["Drop 04 is live: knitwear and overshirts", "Free returns within thirty days"],
    pictures: [
      { match: /hero|opening|cover|campaign/i, prompt: "a person in a dark boiled wool overshirt walking along a Glasgow street in rain, editorial fashion photograph", alt: "The boiled wool overshirt on a wet Glasgow street" },
      { match: /product|still|flat/i, prompt: "folded lambswool crew knit in oatmeal on a stone table, soft daylight", alt: "The lambswool crew knit, folded" },
      { match: /.*/, prompt: "close up of knitted wool texture and a wooden button, daylight", alt: "Knit texture close up" },
    ],
    concept: { name: "Weathered goods", mood: ["sturdy", "quiet", "sharp"], rule: "Product names in caps, tight; headlines in a wide grotesk", principles: ["Product photography edge to edge", "A strict grid for the drop, loose layout for the story"], signatureMoves: ["The drop number as a giant numeral behind the product"], imagery: "Garments worn outside in Scottish weather, still lifes on stone", moves: ["Marquee of the drop contents", "Products lift on hover"], accentUse: "Add to bag and the drop countdown" },
    native: {
      preset: "studio_mono",
      palette: { direction: "Slate, oat and a deep moss accent", background: "#ecebe6", surface: "#dedcd4", text: "#1c1d1a", heading: "#111210", accent: "#2f4a3a", button: "#2f4a3a", button_text: "#f4f3ee" },
      typography: { heading: "Space Grotesk", body: "IBM Plex Sans" },
      voice: { tone: "plain, sure, a little dry", use: ["drop", "made", "wool"], avoid: ["luxury", "elevate", "must-have"] },
      audience: "People who buy fewer, better clothes",
      conversion: "Shop the drop",
      imagery: "Garments worn outside, still lifes on stone",
      home: [
        ["hero_media", "Drop 04 worn on a wet Glasgow street; Shop the drop", "dark", [["overlay_style", "side"], ["height", "100"]], [["image", "wool overshirt street rain editorial", "landscape"]]],
        ["product_grid", "Drop 04: the pieces in this run", "light", [["columns", "3"], ["shape", "3 / 4"]]],
        ["marquee", "Knitwear, overshirts, outerwear, made in Glasgow", "dark", [["size", "display"]]],
        ["text_image", "Made in small batches: the mill and the workshop", "alt", [["image_side", "right"]], [["image", "knitting mill wool yarn", "portrait"]]],
        ["product_spotlight", "The boiled wool overshirt", "light", [["image_side", "left"]], [["image", "boiled wool overshirt", "portrait"]]],
        ["features_grid", "How we make it: small runs, named makers, built to wear", "alt", [["marker", "none"], ["columns", "4"]]],
        ["media_collage", "The drop, worn", "light", [["big_side", "left"]], [["block:picture", "knitwear fashion editorial outdoors", "portrait"]]],
        ["faq_columns", "Orders, sizing and returns", "light"],
        ["newsletter_split", "Next drop: join the list", "dark", [["layout", "image"]], [["image", "folded knitwear stone table", "portrait"]]],
      ],
      pages: [
        { key: "about", title: "About", purpose: "Who makes it and where", sections: [["hero_editorial", "Glasgow made", "light", [["layout", "split"]], [["image", "garment workshop sewing", "landscape"]]], ["about_timeline", "From yarn to drop", "alt"], ["cta_simple", "Shop the drop", "dark"]] },
        { key: "care", title: "Care", purpose: "How to keep the pieces", sections: [["page_content", "Care for knitwear and wool", "light"], ["faq_accordion", "Care questions", "alt"]] },
        { key: "contact", title: "Contact", purpose: "Orders and questions", sections: [["contact", "Ask about an order", "light", [["layout", "stacked"]]]] },
      ],
    },
  },

  photography: {
    brand: "Mara Okafor",
    heroLines: ["Pictures", "that", "stay"],
    headings: ["Selected work", "Fashion stories", "Documentary commissions", "Commission a story", "Signed prints", "About Mara", "How a commission works", "Recent series", "Clients and publications by request", "Availability", "Questions about commissions", "Prints and editions", "Thames at dawn", "The studio", "Work together", "Field notes"],
    bodies: [
      "Mara Okafor photographs fashion stories and documentary commissions from a studio in Hackney, London.",
      "Commissions start with a short call about the story, the people in it and where it will run.",
      "Fashion work is shot on location in natural light, with a small crew and a slow pace.",
      "Documentary commissions follow people over days or weeks, for magazines, charities and brands.",
      "Signed prints are made in small editions on cotton rag paper and shipped flat.",
      "Each series below is a selection. The full edits are shared with commissioners on request.",
      "Send the brief, the dates and the budget range, and you will hear back within two working days.",
      "Mara works across London and travels for longer stories.",
      "Prints are numbered, signed on the back and come with a certificate.",
      "Usage, licensing and day rates are agreed per commission and written into the quote.",
      "Thames at dawn is a series made over one winter along the river, from Greenwich to Teddington.",
      "Tear sheets and references are available for commissioners.",
    ],
    shorts: ["Fashion", "Documentary", "Portraits", "Prints", "London", "On location", "2026", "2025", "Series", "Edition of 25", "Hackney", "Commissions"],
    ctas: ["Commission a story", "See the work", "Buy a print", "Send a brief"],
    facts: [["Based", "Hackney, London"], ["Works", "Fashion and documentary"], ["Reply", "Within two working days"], ["Prints", "Editions of 25"], ["Paper", "Cotton rag"], ["Travel", "UK and abroad"], ["Format", "Digital and medium format film"], ["Licensing", "Per commission"]],
    steps: [["The brief", "A short call about the story, the people and where it runs."], ["The quote", "Dates, crew, usage and fee, written down."], ["The shoot", "On location, natural light, a small crew."], ["The edit", "A selection, then the final files and usage."]],
    offers: [["Fashion story", "Editorial shoots for magazines and labels.", "Day rate"], ["Documentary commission", "Days or weeks with the people in the story.", "Quoted"], ["Signed print", "Thames at dawn, edition of 25, cotton rag.", "£240"]],
    principles: [["Slow pace", "Fewer frames, more time with people."], ["Natural light", "No studio flash unless the story needs it."], ["Small crew", "Usually two people on set."], ["Honest edits", "The pictures look like the day."]],
    faqs: [["How far ahead should I book?", "Two to four weeks for fashion, longer for documentary work."], ["Do you travel?", "Yes, across the UK and abroad, quoted with the commission."], ["Who owns the pictures?", "Mara keeps copyright; usage is licensed per commission."], ["How are prints shipped?", "Flat, in a rigid box, tracked."], ["Can I see a full edit?", "Yes, on request for commissioners."]],
    fitYes: ["Your story needs people photographed as they are", "You want a photographer who stays longer", "You publish in print and online"],
    fitNo: ["You need fifty product packshots by Friday", "You want heavy retouching", "You need event coverage"],
    notices: ["Booking commissions for spring", "New print: Thames at dawn"],
    pictures: [
      { match: /hero|opening|cover|lead/i, prompt: "fashion editorial photograph of a model in a long coat on a foggy London riverbank at dawn", alt: "A model in a long coat on the riverbank at dawn" },
      { match: /portrait|about|photographer/i, prompt: "portrait of a photographer holding a medium format camera in a sunlit studio", alt: "Mara with a medium format camera" },
      { match: /.*/, prompt: "documentary photograph of a market trader in east London in late afternoon light", alt: "A market trader in late afternoon light" },
    ],
    concept: { name: "Wall and margin", mood: ["patient", "spare", "warm"], rule: "Captions small and set after the picture, never above; headlines in a light grotesk", principles: ["The picture leads, words follow in the margin", "White wall spacing between series"], signatureMoves: ["An index of series that reveals a picture on hover"], imagery: "Her own work: fashion and documentary, natural light", moves: ["Images fade in as they enter", "Slow horizontal gallery"], accentUse: "Links and the commission button" },
    native: {
      preset: "noir_gallery",
      palette: { direction: "Gallery white with near black and a single cobalt for links", background: "#fbfbf9", surface: "#f0f0ec", text: "#161616", heading: "#0b0b0b", accent: "#2443d1", button: "#161616", button_text: "#fbfbf9" },
      typography: { heading: "Manrope", body: "Manrope" },
      voice: { tone: "quiet, precise, warm", use: ["story", "light", "commission"], avoid: ["stunning", "breathtaking", "capture memories"] },
      audience: "Editors, brands and charities commissioning photography",
      conversion: "Commission a story",
      imagery: "Her own fashion and documentary photographs",
      home: [
        ["hero_media", "A fashion story on the river at dawn; See the work", "dark", [["overlay_style", "bottom"], ["height", "100"]], [["image", "fashion editorial river fog dawn", "landscape"]]],
        ["gallery_scroll", "Selected work, fashion and documentary", "light", [["size", "large"], ["ratio", "4 / 5"]], [["block:picture", "documentary photography london portrait", "portrait"]]],
        ["text_columns", "Fashion stories and documentary commissions", "light", [["columns", "2"]]],
        ["media_collage", "Recent series: Thames at dawn", "alt", [["big_side", "right"]], [["block:picture", "thames river dawn photograph", "landscape"]]],
        ["sticky_story", "How a commission works", "light", [["media_side", "left"]], [["image", "photographer on location camera", "portrait"]]],
        ["product_spotlight", "Signed print: Thames at dawn", "alt", [["image_side", "right"]], [["image", "framed photographic print wall", "portrait"]]],
        ["about_image", "About Mara", "light", [["image_side", "left"]], [["image", "photographer portrait studio", "portrait"]]],
        ["faq_columns", "Questions about commissions", "light"],
        ["cta_split", "Commission a story", "dark", [["style", "panel"]], [["image", "fashion photographer on set", "landscape"]]],
      ],
      pages: [
        { key: "work", title: "Work", purpose: "The series", sections: [["media_gallery", "Fashion", "light", [["columns", "3"], ["shape", "3 / 4"]], [["block:picture", "fashion editorial photograph", "portrait"]]], ["media_gallery", "Documentary", "alt", [["columns", "2"], ["shape", "4 / 3"]], [["block:picture", "documentary photograph people", "landscape"]]]] },
        { key: "about", title: "About", purpose: "Who she is", sections: [["about_founder", "Mara Okafor", "light", [], [["image", "photographer portrait", "portrait"]]], ["text_rich", "How she works", "alt"]] },
        { key: "contact", title: "Commissions", purpose: "Send a brief", sections: [["contact", "Send the brief, the dates and the budget", "light", [["layout", "split"]]]] },
      ],
    },
  },

  skincare: {
    brand: "Sølv Skin",
    heroLines: ["Less,", "applied", "well"],
    headings: ["Three products, one ritual", "The night face oil", "The barrier serum", "The cleansing balm", "What is inside", "The evening ritual", "Made in Copenhagen", "How to use it", "Ingredients, plainly", "Questions about your skin", "Shop the ritual", "Small batches", "Fragrance free", "Refills", "The morning", "Delivery and returns"],
    bodies: [
      "A face oil, a serum and a cleansing balm, made in small batches in Copenhagen and nothing more.",
      "The ritual is three steps in the evening: balm to cleanse, serum on damp skin, two drops of oil to finish.",
      "The night face oil is squalane and cold pressed jojoba with vitamin E, light enough for every skin type.",
      "The barrier serum uses niacinamide at five percent and panthenol to calm and hold water.",
      "The cleansing balm melts on dry skin and rinses off with warm water, taking sunscreen and makeup with it.",
      "Every ingredient is listed in full on each product, with what it does and why it is there.",
      "Batches are made each month in our Copenhagen workshop and dated on the bottle.",
      "No fragrance and no essential oils: what you smell is the ingredients.",
      "Orders ship within two working days in recyclable glass and paper.",
      "If a product does not suit your skin, write to us within thirty days.",
      "Patch test anything new on the inside of your arm for a day before using it on your face.",
      "Refill pouches for the balm arrive with the next batch.",
    ],
    shorts: ["Cleanse", "Treat", "Seal", "Squalane", "Jojoba", "Niacinamide", "Panthenol", "30 ml", "100 ml", "Evening", "Copenhagen", "Fragrance free"],
    ctas: ["Shop the ritual", "Read the ingredients", "Add to bag", "See how to use"],
    facts: [["Made", "Copenhagen, monthly batches"], ["Fragrance", "None"], ["Bottle", "Recyclable glass"], ["Shipping", "Within two working days"], ["Oil", "30 ml, about three months"], ["Serum", "30 ml, about two months"], ["Balm", "100 ml"], ["Returns", "Thirty days"]],
    steps: [["Cleanse", "Massage the balm into dry skin, then rinse with warm water."], ["Treat", "Press three drops of serum into damp skin."], ["Seal", "Warm two drops of oil between your palms and press in."], ["Rest", "Leave it overnight. Morning: water and sunscreen."]],
    offers: [["Night face oil", "Squalane, jojoba, vitamin E. 30 ml.", "£68"], ["Barrier serum", "Niacinamide 5%, panthenol. 30 ml.", "£59"], ["Cleansing balm", "Melts makeup and sunscreen. 100 ml.", "£42"]],
    principles: [["Fewer products", "Three that work together, nothing to collect."], ["Full lists", "Every ingredient, what it does and why."], ["Dated batches", "Made monthly, dated on the bottle."], ["No fragrance", "Nothing added to smell nice."]],
    faqs: [["Which skin types is it for?", "All three are made for normal, dry and combination skin. Patch test first if your skin reacts easily."], ["Can I use the serum in the morning?", "Yes, under sunscreen. Keep the oil for the evening."], ["How long does a bottle last?", "The oil about three months, the serum about two, used every evening."], ["Is it vegan?", "Yes, every product is."], ["Where do you ship?", "Across Europe and the UK, from Copenhagen."]],
    fitYes: ["You want a short routine you will keep", "You read ingredient lists", "Your skin dislikes fragrance"],
    fitNo: ["You want a twelve step routine", "You are treating a skin condition: see a dermatologist", "You like strong scents"],
    notices: ["New batch, dated this month", "Free delivery across Europe on the full ritual"],
    pictures: [
      { match: /hero|opening|cover/i, prompt: "three amber glass skincare bottles on wet grey stone with soft window light and a sprig of green", alt: "The oil, serum and balm on wet stone" },
      { match: /product|bottle|still/i, prompt: "a single amber glass dropper bottle with a drop of oil on its tip, pale grey background", alt: "The night face oil with a drop on the dropper" },
      { match: /.*/, prompt: "hands warming a drop of face oil between the palms, soft daylight, close up", alt: "Hands warming two drops of oil" },
    ],
    concept: { name: "Cold light, warm skin", mood: ["clean", "tactile", "calm"], rule: "Headlines light weight and large, product names in small caps tracked", principles: ["Products photographed at life size on stone", "Long reading column for ingredients"], signatureMoves: ["The ritual as three numbered steps that pin while the bottles change"], imagery: "Glass, stone, water and skin, cool daylight", moves: ["Bottles drift slightly on scroll", "Ingredients reveal one by one"], accentUse: "Add to bag and the step numbers" },
    native: {
      preset: "nordic_calm",
      palette: { direction: "Cool stone with deep spruce", background: "#eef0ef", surface: "#e1e5e3", text: "#1b2321", heading: "#101816", accent: "#1f4d45", button: "#1f4d45", button_text: "#f3f5f4" },
      typography: { heading: "Figtree", body: "Figtree" },
      voice: { tone: "calm, exact, kind", use: ["ritual", "batch", "ingredients"], avoid: ["miracle", "glow up", "luxurious"] },
      audience: "People who want a short routine with full ingredient lists",
      conversion: "Shop the ritual",
      imagery: "Glass bottles on stone, skin, water",
      home: [
        ["hero_split", "Three bottles on wet stone; Less, applied well; Shop the ritual", "light", [["image_side", "right"]], [["image", "amber glass skincare bottles stone", "portrait"]]],
        ["product_featured", "The three products", "alt", [["columns", "3"], ["shape", "3 / 4"]]],
        ["sticky_story", "The evening ritual in three steps", "light", [["media_side", "left"]], [["image", "face oil drops hands", "portrait"]]],
        ["features_image", "Ingredients, plainly", "alt", [["image_side", "right"], ["marker", "none"]], [["image", "jojoba squalane ingredients", "portrait"]]],
        ["marquee", "Fragrance free, dated batches, made in Copenhagen", "dark", [["size", "large"]]],
        ["text_image", "Made in Copenhagen in small monthly batches", "light", [["image_side", "left"]], [["image", "skincare workshop glass bottles", "landscape"]]],
        ["comparison_table", "Which product does what", "alt"],
        ["faq_accordion", "Questions about your skin", "light"],
        ["newsletter_split", "Hear when a batch is ready", "dark", [["layout", "text"]]],
      ],
      pages: [
        { key: "ritual", title: "The ritual", purpose: "How to use the three", sections: [["hero_editorial", "The evening ritual", "light", [["layout", "stacked"]], [["image", "skincare ritual evening", "landscape"]]], ["features_grid", "Cleanse, treat, seal, rest", "alt", [["marker", "number"], ["columns", "4"]]], ["cta_simple", "Shop the ritual", "dark"]] },
        { key: "ingredients", title: "Ingredients", purpose: "Every ingredient explained", sections: [["text_rich", "Ingredients, plainly", "light"], ["faq_columns", "Ingredient questions", "alt"]] },
        { key: "contact", title: "Contact", purpose: "Questions and orders", sections: [["contact", "Write to us", "light", [["layout", "stacked"]]]] },
      ],
    },
  },

  architecture: {
    brand: "Studio Veld",
    heroLines: ["Rooms", "for", "slow", "light"],
    headings: ["Selected projects", "House on the Maas", "The practice", "How a commission starts", "Homes and small cultural buildings", "Feasibility first", "Recent work", "Working with us", "Questions from clients", "Start a commission", "Materials we return to", "Stages of a project", "Library pavilion, Delft", "Rotterdam", "Drawings", "In progress"],
    bodies: [
      "Studio Veld is an architecture practice in Rotterdam designing homes and small cultural buildings.",
      "A commission starts with a feasibility study: the site, the brief, the rules and a first idea of cost.",
      "House on the Maas is a family home of brick and timber on a narrow river plot, finished in 2025.",
      "The library pavilion in Delft is a single timber room for reading, open to the park on three sides.",
      "We work in brick, timber and lime, and draw every detail ourselves.",
      "Projects run in four stages: feasibility, design, permits and drawings, and building with the contractor.",
      "The practice is small on purpose: the architects you meet are the ones who draw your building.",
      "Tell us about the site, what you need from the building and when, and we will reply within a week.",
      "A feasibility study takes four to six weeks and costs a fixed fee agreed before we start.",
      "We take on a few projects a year so each one gets the time it needs.",
      "We work across the Netherlands and Flanders.",
      "Sketches, models and drawings are shared at every stage.",
    ],
    shorts: ["Homes", "Cultural", "Brick", "Timber", "Lime", "Rotterdam", "Delft", "2025", "2026", "Feasibility", "Design", "Permits"],
    ctas: ["Start a commission", "See the projects", "Ask about feasibility", "Write to the studio"],
    facts: [["Based", "Rotterdam"], ["Works", "Homes, small cultural buildings"], ["Region", "Netherlands and Flanders"], ["Feasibility", "Four to six weeks"], ["Reply", "Within a week"], ["Materials", "Brick, timber, lime"], ["Projects", "A few a year"], ["Fee", "Fixed for feasibility"]],
    steps: [["Feasibility", "The site, the brief, the rules and a first idea of cost."], ["Design", "Sketches and models until the building is right."], ["Permits and drawings", "The permit application and every detail drawn."], ["Building", "We stay on site with the contractor until handover."]],
    offers: [["Feasibility study", "Site, brief, rules and cost in four to six weeks.", "Fixed fee"], ["New home", "From the first sketch to the keys.", "Quoted"], ["Cultural building", "Pavilions, libraries and small halls.", "Quoted"]],
    principles: [["Daylight first", "Rooms are planned around where the light comes from."], ["Few materials", "Brick, timber and lime, used honestly."], ["Drawn by hand first", "Every project starts on paper."], ["Small practice", "The people you meet draw your building."]],
    faqs: [["What does a feasibility study cost?", "A fixed fee agreed before we start, depending on the site."], ["Do you work outside Rotterdam?", "Yes, across the Netherlands and Flanders."], ["How long does a house take?", "Usually two to three years from the first meeting to moving in."], ["Do you manage the permits?", "Yes, the permit application is part of the drawings stage."], ["Can you work with my builder?", "Yes, or we can suggest contractors we know."]],
    fitYes: ["You have a site and a brief, or the start of one", "You want a building that will last", "You want to be part of the design"],
    fitNo: ["You need drawings for a standard extension next week", "You want the cheapest permit drawings", "You are looking for interior styling"],
    notices: ["Taking on two new commissions for 2027", "House on the Maas: new photographs"],
    pictures: [
      { match: /hero|opening|cover|lead/i, prompt: "modern brick and timber house on a narrow river plot at dusk, architectural photograph, warm interior light", alt: "House on the Maas at dusk" },
      { match: /interior|room|detail/i, prompt: "interior of a timber library pavilion with tall windows onto a park, soft daylight", alt: "Inside the library pavilion in Delft" },
      { match: /.*/, prompt: "architectural model in white card on a drawing table with sketches, overhead light", alt: "A card model and sketches on the drawing table" },
    ],
    concept: { name: "Measured daylight", mood: ["precise", "warm", "unhurried"], rule: "Project names in a wide grotesk, numbers and years in tabular figures", principles: ["Full bleed project photographs with captions in the margin", "A ruled index of projects"], signatureMoves: ["The project index as a table with years and places"], imagery: "Finished buildings in natural light, models and drawings", moves: ["Pictures reveal with a slow clip", "The index rows highlight on hover"], accentUse: "Links and the commission button only" },
    native: {
      preset: "swiss_grid",
      palette: { direction: "Lime white, brick and graphite", background: "#f4f2ee", surface: "#e7e3dc", text: "#1e1d1b", heading: "#121110", accent: "#9a3b21", button: "#1e1d1b", button_text: "#f4f2ee" },
      typography: { heading: "Work Sans", body: "Work Sans" },
      voice: { tone: "measured, plain, exact", use: ["daylight", "brick", "commission"], avoid: ["iconic", "stunning", "visionary"] },
      audience: "Families and cultural clients with a site and a brief",
      conversion: "Start a commission",
      imagery: "Finished buildings, models, drawings",
      home: [
        ["hero_media", "House on the Maas at dusk; Rooms for slow light", "dark", [["overlay_style", "bottom"], ["height", "100"]], [["image", "modern brick house river dusk", "landscape"]]],
        ["text_columns", "The practice: homes and small cultural buildings in Rotterdam", "light", [["columns", "2"]]],
        ["multirow", "Selected projects: House on the Maas, Library pavilion", "light", [["shape", "4 / 3"], ["first_side", "left"]], [["block:row", "architecture house timber brick", "landscape"]]],
        ["stats_band", "Facts of the practice: where, what, how long feasibility takes", "dark", [["columns", "3"]]],
        ["sticky_story", "Stages of a project", "light", [["media_side", "right"]], [["image", "architectural model sketches", "portrait"]]],
        ["media_gallery", "Drawings and models", "alt", [["columns", "4"], ["shape", "1 / 1"]], [["block:picture", "architecture drawing model", "square"]]],
        ["features_grid", "Materials we return to", "light", [["marker", "none"], ["columns", "3"]]],
        ["faq_columns", "Questions from clients", "alt"],
        ["cta_split", "Start a commission with a feasibility study", "dark", [["style", "plain"]], [["image", "architect drawing table", "landscape"]]],
      ],
      pages: [
        { key: "projects", title: "Projects", purpose: "The work", sections: [["multirow", "Every project", "light", [["shape", "16 / 9"]], [["block:row", "contemporary architecture house", "landscape"]]], ["media_gallery", "In progress", "alt", [["columns", "3"]], [["block:picture", "construction site timber frame", "square"]]]] },
        { key: "practice", title: "Practice", purpose: "Who we are and how we work", sections: [["about_image", "The practice", "light", [["image_side", "right"]], [["image", "architecture studio rotterdam", "landscape"]]], ["about_timeline", "How a project runs", "alt"], ["team_grid", "The architects", "light", [["columns", "3"]], [["block:member", "architect portrait", "portrait"]]]] },
        { key: "contact", title: "Contact", purpose: "Start a commission", sections: [["contact", "Tell us about the site and the brief", "light", [["layout", "split"]]], ["media_map", "The studio in Rotterdam", "alt"]] },
      ],
    },
  },

  consulting: {
    brand: "Arden Partners",
    heroLines: ["Better", "margins,", "same", "plant"],
    headings: ["Operations, pricing and finance for manufacturers", "Two senior partners on every project", "What we work on", "How an engagement runs", "Who we work with", "Book an intro call", "The operations diagnostic", "Pricing that reflects cost", "Finance the floor can use", "Questions before a call", "The partners", "Start with a diagnostic", "Six weeks, one report", "Plant first", "Our approach", "After the project"],
    bodies: [
      "Arden Partners works with mid-size manufacturers on operations, pricing and finance, led by two senior partners from the first call to the last.",
      "Most projects start with a six week operations diagnostic: we spend time on the floor, read the numbers and write down where the margin goes.",
      "Pricing work rebuilds quotes from real cost, so the jobs you win are the ones that pay.",
      "Finance work gives the plant a monthly view it can act on: cost per part, scrap and cash.",
      "We work with family owned and private equity backed manufacturers between 50 and 500 people.",
      "The intro call is thirty minutes. Tell us what is going on and we will say plainly whether we can help.",
      "The two partners have run plants and finance teams before advising them, and do the work themselves.",
      "At the end of the diagnostic you get one report, a ranked list of changes and the cost of each.",
      "We stay for the changes if you want us to, on a monthly fee agreed up front.",
      "No junior teams and no long decks: the partners are on site and in the spreadsheets.",
      "Fees are fixed for the diagnostic and agreed before we start.",
      "We work across the UK and Ireland.",
    ],
    shorts: ["Operations", "Pricing", "Finance", "Diagnostic", "Six weeks", "On site", "Cost per part", "Scrap", "Cash", "UK", "Ireland", "Fixed fee"],
    ctas: ["Book an intro call", "See how we work", "Book an intro call", "Read about the diagnostic"],
    facts: [["Clients", "Manufacturers, 50 to 500 people"], ["Diagnostic", "Six weeks, fixed fee"], ["Team", "Two senior partners"], ["Region", "UK and Ireland"], ["Call", "Thirty minutes, free"], ["Report", "Ranked changes and their cost"], ["After", "Monthly, agreed up front"], ["Reply", "Within one working day"]],
    steps: [["Intro call", "Thirty minutes on what is going on. Free."], ["Diagnostic", "Six weeks on the floor and in the numbers."], ["Report", "A ranked list of changes and the cost of each."], ["Changes", "We stay to make them with you, if you want us to."]],
    offers: [["Operations diagnostic", "Six weeks on site and in the numbers, one report.", "£6,000"], ["Pricing review", "Quotes rebuilt from real cost.", "Quoted"], ["Finance for the floor", "A monthly view of cost per part, scrap and cash.", "Monthly"]],
    principles: [["Partners do the work", "No junior teams between you and the advice."], ["On the floor", "We start where the parts are made."], ["One report", "Ranked changes, each with its cost."], ["Fixed fees", "Agreed before we start."]],
    faqs: [["What happens on the intro call?", "Thirty minutes on your situation. We say plainly if we can help."], ["How much does the diagnostic cost?", "A fixed fee of £6,000, agreed before we start."], ["Do you work with private equity owners?", "Yes, and with family owned firms."], ["Will you implement the changes?", "If you want us to, on a monthly fee agreed up front."], ["Where do you work?", "Across the UK and Ireland, on site."]],
    fitYes: ["You run a plant of 50 to 500 people", "Margins have slipped and nobody can say why", "You want advice from people who have run plants"],
    fitNo: ["You want a large team for a year", "You need an audit", "You are not in manufacturing"],
    notices: ["Diagnostics starting in March", "Intro calls this week"],
    pictures: [
      { match: /hero|opening|cover/i, prompt: "two consultants talking with a plant manager beside a CNC machine on a factory floor, documentary photograph", alt: "The partners with a plant manager on the factory floor" },
      { match: /partner|portrait|team|about/i, prompt: "portrait of a senior consultant in a factory office with production schedules on the wall", alt: "A partner in the plant office" },
      { match: /.*/, prompt: "close up of machined metal parts on a workbench with a printed cost sheet, daylight", alt: "Machined parts and a cost sheet" },
    ],
    concept: { name: "Floor and ledger", mood: ["frank", "solid", "precise"], rule: "Headlines in a sturdy grotesk; figures in tabular numerals", principles: ["Documentary photos of real plants", "Numbers set as a ledger, ruled"], signatureMoves: ["The diagnostic's six weeks drawn as a ruled timeline"], imagery: "Real factory floors, people at work, no handshake stock", moves: ["Timeline fills as you scroll", "Quiet fades only"], accentUse: "The intro call button and timeline marks" },
    native: {
      preset: "heritage_navy",
      palette: { direction: "Steel grey, ink navy and a safety orange accent", background: "#f1f3f4", surface: "#e2e6e9", text: "#14202b", heading: "#0c1620", accent: "#e0571b", button: "#14202b", button_text: "#f1f3f4" },
      typography: { heading: "IBM Plex Sans", body: "IBM Plex Sans" },
      voice: { tone: "frank, plain, senior", use: ["plant", "margin", "diagnostic"], avoid: ["synergy", "leverage", "transform"] },
      audience: "Owners and managers of mid-size manufacturers",
      conversion: "Book an intro call",
      imagery: "Real factory floors and the people in them",
      home: [
        ["hero_split", "Better margins, same plant; book an intro call", "light", [["image_side", "right"]], [["image", "consultants factory floor plant manager", "portrait"]]],
        ["text_columns", "What we work on: operations, pricing, finance", "alt", [["columns", "3"]]],
        ["sticky_story", "How an engagement runs", "light", [["media_side", "left"]], [["image", "factory floor cnc machine", "portrait"]]],
        ["pricing_table", "The operations diagnostic and the follow on work", "alt"],
        ["features_cards", "Our approach: partners do the work, on the floor, one report, fixed fees", "light", [["marker", "number"], ["columns", "4"]]],
        ["text_image", "Who we work with: manufacturers of 50 to 500 people", "dark", [["image_side", "left"]], [["image", "manufacturing workers production line", "landscape"]]],
        ["team_grid", "The partners", "light", [["columns", "2"]], [["block:member", "senior consultant portrait office", "portrait"]]],
        ["faq_accordion", "Questions before a call", "alt"],
        ["cta_banner", "Book an intro call", "dark", [["background", "colour"]]],
      ],
      pages: [
        { key: "services", title: "Services", purpose: "What we do", sections: [["hero_editorial", "Operations, pricing and finance", "light", [["layout", "stacked"]], [["image", "factory operations", "landscape"]]], ["features_image", "Each service", "alt", [["image_side", "right"], ["marker", "number"]], [["image", "metal parts cost sheet", "portrait"]]], ["cta_simple", "Book an intro call", "dark"]] },
        { key: "about", title: "About", purpose: "The partners", sections: [["about_image", "Two senior partners", "light", [["image_side", "left"]], [["image", "consultant portrait factory", "portrait"]]], ["about_timeline", "How we got here", "alt"]] },
        { key: "contact", title: "Book a call", purpose: "Book the intro call", sections: [["contact", "Book an intro call", "light", [["layout", "split"]]]] },
      ],
    },
  },
}
