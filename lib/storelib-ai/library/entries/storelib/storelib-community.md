---
id: storelib-community
title: Communities on Storelib sites
category: storelib
summary: Showing a Storelib community with the community picker: what it is, how to join, and what visitors can and cannot see.
intents: [membership, build-section, community]
tags: [community, members, join, forum, group, community-picker]
components: [card]
capabilities: [community]
phases: [plan, build]
priority: 3
related: [industry-membership-community, storelib-memberships]
version: 1
---
**Binding**: a section points at a real community with a `community_picker` setting; only communities that are published, public and not hidden are offered (capabilities lists them). The AI builder binds the first one to a community card when one exists.

**Present**: the community's name and purpose, who it is for, what happens inside (posts, events, chats) in concrete terms, whether it is free or part of a membership, and the join action.

**Privacy**: never show member names, avatars or posts from a private community on the public site. Do not fabricate activity ("12 people online").

**Visual**: real photos from community events if the creator has them; otherwise typography and a clear description beat stock group photos.
