# Similar Events & Sponsor Overlap Research

## Goal
Let the user enter their own event (e.g., "AI Tinkerers") and discover complementary events that attract the same audience, then extract all sponsor tiers from those events so the user can see which companies already sponsor multiple similar events.

## Why this is the right approach
- Co-sponsorship is the strongest signal: a company that sponsors 3-4 related AI events is already budgeting for that exact audience.
- Complementary events (AI demo days, LLM hackathons, MLOps meetups, founder nights) share sponsors without competing directly with the user's event.
- The existing pipeline already extracts sponsors from event pages; we only need better discovery and a new "overlap" view.

## What we will build

### 1. New "Research Mode" toggle on the input page
- "Find sponsors for my event" (existing single-event flow)
- "Find sponsors of similar events" (new flow)

### 2. Enhanced event input for similar-events mode
- Keep name, type, industry, location, senderName
- Add an optional "Event description / audience" textarea so AI understands what "similar" means
- Add a "Complementary event focus" multi-select or tags (e.g., hackathons, demo days, conferences, meetups)

### 3. AI-generated search expansion
- New edge function `similar-event-queries`: takes event details + description, returns 3-5 Meetup search queries that target complementary events
- Example for "AI Tinkerers": ["LLM hackathon", "AI demo day", "machine learning meetup", "generative AI founders", "MLOps meetup"]

### 4. Batch Meetup discovery
- `meetup-discovery` already accepts keywords + location; call it once per generated query
- Merge results, dedupe by URL, show up to the user's chosen event count

### 5. Manual event URL input
- Allow the user to paste direct event URLs (conference sites, Luma, Partiful, Meetup) that Meetup search misses
- New edge function `event-from-url`: scrapes the page and returns a DiscoveredEvent with name/date/location

### 6. Sponsor overlap analysis
- After extracting sponsors from selected events, compute:
  - How many selected events each sponsor appears in
  - Which tiers they took at each event
- New "Sponsor Overlap" sort/filter in SponsorList: sort by event count, filter by min-events
- Visual badge: "Sponsors 3 events" etc.

### 7. Export updates
- Export sheet includes an "Events Sponsored" count and tier list per sponsor

## Technical changes

### Frontend
- `EventInputForm.tsx`: add mode toggle, description textarea, focus tags
- `useSponsorWorkflow.ts`: new `researchMode: 'mine' | 'similar'`, store generated queries, batch call `meetup-discovery`, support manual URLs
- `EventDiscoveryResults.tsx`: group events by search query, show query used, allow URL input
- `SponsorList.tsx`: add overlap badge, sort by event count, filter by minimum events sponsored
- `src/types/sponsor.ts`: add `researchMode`, `description`, `focusTags`, `query` to `DiscoveredEvent`, `eventCount` to `EnrichedSponsor`

### Backend
- New `supabase/functions/similar-event-queries/index.ts`: AI prompt that returns strict JSON of search queries
- Extend `supabase/functions/meetup-discovery/index.ts`: already supports keywords + location, no change needed
- New `supabase/functions/event-from-url/index.ts`: scrape any event URL via JinaAI, extract event details
- Extend `supabase/functions/sponsor-identification/index.ts`: already extracts sponsors per event, ensure it returns `eventNames` and tiers

## Out of scope / limitations
- We will not add a paid web-search API. Discovery stays free: Meetup + manual URLs + AI query expansion.
- Major conferences not listed on Meetup will require a pasted URL.
- Luma/Partiful scraping is experimental; if blocked, the user falls back to Meetup or manual URLs.

## Success criteria
- Searching "AI Tinkerers" + "San Francisco" returns complementary AI events from Meetup.
- Selecting 3-5 events extracts sponsors and shows which sponsors appear in multiple events.
- User can paste a conference URL directly and extract its sponsors.
