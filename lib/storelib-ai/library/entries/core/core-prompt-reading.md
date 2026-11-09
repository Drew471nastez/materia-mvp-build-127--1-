---
id: core-prompt-reading
title: Reading a short or vague prompt
category: core
summary: Turn a one line request into a usable brief by inferring audience, offer and tone from store data, and ask nothing that the data already answers.
intents: [build-site, plan-site, understand-request]
tags: [prompt, brief, intent, clarify, vague]
phases: [concept, plan]
priority: 4
related: [core-agent-loop]
version: 1
---
Most prompts are one line: "site for my yoga classes, make it calm". Extract four things before designing.

1. **Who visits and what they came to do.** Infer from what the store sells: a course product means students deciding to enrol; bookings mean someone choosing a time.
2. **The one action.** Enrol, book, buy, join, enquire. If the store supports several, rank them by what has real data (a booking form with slots outranks a vague "contact us").
3. **Tone words the creator used.** "Calm", "edgy", "premium". Treat them as constraints on the concept, not as copy. Never print "calm" on the page.
4. **Anything explicitly asked for**, which outranks every default here: "use a gradient", "make it pink", "one page only".

Ask a question only when the answer changes the structure and no data answers it (for example, two unrelated businesses in one store). Otherwise decide, state the assumption in one line in the plan, and continue. Do not ask about colours or fonts; propose them.

Do not inflate a short prompt into a long feature list. "Site for my yoga classes" is a home page, a classes or timetable page, an about page and a way to book. Not a blog, a shop and a community unless they exist.
