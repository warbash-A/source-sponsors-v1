# Fixing steps 1-3: real events, real sponsors, real contacts

## What I verified just now

- **Eventbrite blocks us.** Its search pages now return a "confirm you are human" security check, so nothing real ever comes back. That is why every search silently shows the three placeholder events.
- **Meetup still works.** The same free reader pulled back genuine Meetup listings (real titles, dates, hosts, links) in my test.
- **Sponsor finding grabs the wrong names.** It picks any capitalised name off a page, which is how "Doug Leone" (a person) ended up listed as a sponsor of Web Summit.
- **Contact details are guesses.** Emails like `info@`, `sponsors@` are invented from the company's web address, never checked, and every row still shows as if it were confirmed.

## The fix, step by step

### Step 1 — Event discovery

- **Turn Meetup on as the working free source.** It is already built but was never published to the server, so selecting it currently fails. Publish it and make it a default source.
- **Replace guesswork with AI reading.** Instead of pattern-matching text, hand the fetched page to the AI to pull out event name, date, location and link. This is far more reliable and needs no extra account.
- **Eventbrite needs an official key.** Scraping it is a dead end. Eventbrite gives out a free personal token at eventbrite.com (Account Settings → Developer Links → API Keys). Once you save that token, I will switch Eventbrite over to the official feed. Until then, Eventbrite will be shown as unavailable rather than quietly faked.
- **No more silent fakes.** If a source returns nothing, you get a clear "no results from this source" message. Sample data only appears if you deliberately switch on a demo toggle.

### Step 2 — Sponsor identification

- **Look in the right places.** Follow each event's own sponsors/partners page rather than reading the homepage.
- **Let the AI do the extraction.** Ask it to return only sponsoring organisations with their tier (platinum/gold/silver/bronze), explicitly rejecting people's names, menu items and legal links.
- **Sanity checks on every result.** Drop anything that looks like a person, a navigation label or a legal page; merge duplicates across events; keep the link back to the page it came from so you can verify.
- **Be honest when a site can't be read.** Events with no readable sponsor page get flagged, not padded with Stripe/Salesforce/HubSpot.

### Step 3 — Contact enrichment

- **Find the real contact page.** Fetch the company's own contact/partnerships page and pull genuine published addresses first.
- **Label guesses as guesses.** Addresses built from a pattern get marked "unverified" and shown differently from ones actually found on the site, so you never email a made-up address thinking it is real.
- **Drop LinkedIn guessing** unless a real profile link is found on the page.
- **Accurate status.** "Complete" only when something real was found; otherwise "partial" or "none found".

## Ordering

1. Publish Meetup and switch step 1 to AI-based reading (immediate visible improvement — real events today).
2. Rebuild step 2 sponsor extraction with AI plus strict filtering.
3. Rebuild step 3 with verified-versus-guessed contact labelling.
4. Add Eventbrite's official feed once you save the token.

## Two things I need from you

- **Eventbrite token** — free, takes about two minutes to create. Without it, Eventbrite cannot be a source at all.
- **Confirm it is fine that results get smaller but real.** A search may return 4 genuine events instead of 10 padded ones.

## Technical notes

- `meetup-discovery` exists in the repo but is not deployed — deploy it and add it to `supabase/config.toml`.
- Replace the regex parsers in `event-discovery` and `sponsor-identification` with structured-output calls through the Lovable AI Gateway (`google/gemini-2.5-flash`), keeping the JinaAI Reader fetch as the content source.
- Add an `eventbrite` branch calling `https://www.eventbriteapi.com/v3/` behind a new `EVENTBRITE_API_TOKEN` secret; return an explicit `unavailable` status when it is absent.
- Extend `EnrichedSponsor` with per-email `verified: boolean` and a `sourceUrl`, and surface both in `SponsorList`.
- Remove the hardcoded sample fallbacks in `useSponsorWorkflow.ts` and gate sample data behind an explicit demo flag.
