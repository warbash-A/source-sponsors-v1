# CLAUDE.md — Project Context for AI Assistants

## What is SponsorScout?

SponsorScout automates event sponsorship research. The user describes an event, the app finds similar events, identifies their sponsors, enriches contact details, and lets the user download the list. The visible pipeline is 3 steps: event input → event discovery → sponsor list (with export built into step 3).

**Email generation is hidden in the UI (by user request) but all of its code is kept.** Do not delete email code; do not re-add the email step to the visible workflow without asking.

## Architecture

```
src/
├── pages/Index.tsx                 # Main page — renders steps 1–3 only (email step hidden)
├── hooks/useSponsorWorkflow.ts     # Core state machine — all workflow logic lives here
├── types/sponsor.ts                # Shared TypeScript interfaces
├── components/
│   ├── EventInputForm.tsx          # Step 1: event name/type/industry/location (no date fields, no "Your Name"/"Your Company")
│   ├── EventDiscoveryResults.tsx   # Step 2: selectable event list, research-mode query groups, manual URL add
│   ├── SponsorList.tsx             # Step 3: sponsor table — NO status column; has "Download List" button
│   ├── EmailPreview.tsx            # Hidden (code kept)
│   ├── ExportPanel.tsx             # Hidden (code kept)
│   └── WorkflowStepper.tsx         # Progress indicator; clickable steps up to maxStepReached
supabase/functions/
├── _shared/
│   ├── ai-extract.ts               # aiExtract() — structured JSON extraction via Lovable AI Gateway
│   └── scrape.ts                   # JinaAI Reader fetch (x-timeout: 20; plain text/markdown)
├── similar-event-queries/          # Generates broad similar-event search queries from EventDetails
├── web-event-discovery/            # Web search (DuckDuckGo via JinaAI) + AI extraction of events
├── luma-discovery/                 # Luma (lu.ma) discovery
├── meetup-discovery/               # Meetup discovery (exists; not the primary UI source right now)
├── event-from-url/                 # Parses a pasted event URL into a DiscoveredEvent
├── sponsor-identification/         # Multi-layer sponsor extraction (see below) — the most complex function
├── contact-enrichment/             # Domain extraction, email variants, LinkedIn URLs (heuristic)
├── email-generation/               # Hidden in UI; AI via Lovable AI Gateway + template fallback
└── export-data/                    # CSV + multi-sheet Excel; columns: Name, Tier, Website, Emails, LinkedIn, Event Count (no Status)
```

## Workflow Pipeline (as users see it)

1. **Event Input** → `EventDetails` (name, type, industry, location; optional research mode)
2. **Event Discovery** → `DiscoveredEvent[]` — calls `similar-event-queries`, then `web-event-discovery` / `luma-discovery` per query; pasted URLs go through `event-from-url`. Sponsor-count prescanning runs on the top events.
3. **Sponsor Identification + Enrichment** → `EnrichedSponsor[]` — calls `sponsor-identification` (sponsors appear immediately with `enrichmentStatus: 'processing'`), then `contact-enrichment` in batches of 5, merged by sponsor ID so a failed batch doesn't blank the list. Download List button exports CSV.

Hidden/retained steps: 4. Email Generation (`email-generation`), 5. Export Panel (`export-data`).

## Persistence

- Table `public.sponsor_workflows` — one row per browser, keyed by a localStorage-generated `workspace_id`, JSONB workflow state, permissive RLS + grants.
- `useSponsorWorkflow.ts` restores state on load, debounces upserts after changes, and deletes the row on "Start Over".
- No authentication — single-user app keyed by browser storage.

## Sponsor Identification — Multi-Layer Extraction

`sponsor-identification` fetches event pages through JinaAI Reader and runs layers in order:

1. **Prioritize the real event URL** — the source URL is always analyzed first; probed sub-paths (`/sponsors`, `/partners`, …) only supplement it and must validate against the event.
2. **Official-site resolution** — directory listings that link to an official site ("Visit official site") are followed and scraped too.
3. **Deterministic layers (no AI)** in `structured.ts`:
   - `extractFromEmbeddedJson` — JSON-LD, `__NEXT_DATA__`, `__NUXT_DATA__`, `__remixContext`, `window.__X__` payloads
   - AEM `.model.json` data-endpoint extraction (IBM-style logo galleries)
   - `extractFromHtmlSections(html, pageUrl)` — sponsor containers/headings; reads alt/title text, image-wrapped anchors, and text sponsor cards (relative hrefs resolved); navigation links and section labels are rejected
4. **AI extraction** via `_shared/ai-extract.ts` — strict JSON schema, rejects people's names, menu items, legal links.
5. **Vision fallback** on zero results (rendered screenshot → Lovable AI vision).

- `mergeSponsors` dedupes by normalized name key (Inc/LLC/punctuation), keeping the best tier and any website found.
- `isLikelyCompany` rejects >5-word names, articles, dates, and section labels.
- Tier mapping in `tierFromHeading`: platinum/diamond/headline/title/presenting → platinum; gold/premier/lead → gold; silver/supporting → silver; bronze/community/startup/media → bronze.

## AI Integration

- **Provider**: Lovable AI Gateway
- **Endpoint**: `https://ai.gateway.lovable.dev/v1/chat/completions` (the old `/v1/responses` endpoint is dead — do not revert)
- **Model**: `google/gemini-2.5-flash`
- **Auth**: `LOVABLE_API_KEY` env var (auto-provisioned; managed, cannot be viewed)
- Structured extraction uses `response_format: json_schema` with strict schemas (object root, all props required, additionalProperties false).

## Web Scraping

- JinaAI Reader (`_shared/scrape.ts`), no API key, headers `Accept: text/plain` and `x-timeout: 20`. Do not add `x-with-images-summary` — it strips image markup and kills the vision/logo fallback.
- No Eventbrite — explicitly removed by user decision.

## Key Conventions

- **State management**: All workflow state lives in `useSponsorWorkflow.ts` — steps, loading, errors, data arrays.
- **Back navigation**: `handleGoBack` + clickable stepper via `maxStepReached`; data is not cleared on back.
- **UI library**: shadcn/ui in `src/components/ui/`; Tailwind with semantic design tokens from `index.css` (dark theme, deep indigo/navy primary, cyan accent).
- **Types**: all data interfaces in `src/types/sponsor.ts`.
- **Error handling**: every edge function call has try/catch; a failed enrichment batch marks only its own sponsors failed — it never replaces the list.

## Verification & Deployment

- Typecheck: `bunx tsgo --noEmit -p tsconfig.app.json`
- After any change to `sponsor-identification`, deploy that function, then retest the three live baselines via curl to `/sponsor-identification` (expect `status: "ok"`):
  - IBM Think 2026 → ~43 sponsors (platinum: Adobe/Salesforce)
  - WordCamp US 2025 → real sponsors (Bluehost, Jetpack, Kinsta)
  - Startup Boston Week → 11+ sponsors
- Text-sponsor regression case: ConferenceGrid-style listings (sponsors as plain text links, e.g. TechCrunch Founder Summit 2026).

## Known Limitations

- **No authentication** — single-user, browser-keyed persistence.
- **Contact enrichment is heuristic** (no Hunter.io or similar) — pattern-built emails are guesses.
- **Luma discovery** is limited by lu.ma's client-side rendering/API restrictions.
- **Event sources** depend on web scraping — sites that block the reader return no results rather than fake data.
- **Email generation** is hidden, not removed — re-enabling means unhiding the step in `Index.tsx`, `WorkflowStepper.tsx`, and `ExportPanel.tsx`.

## Important Files to Read First

1. `src/hooks/useSponsorWorkflow.ts` — the brain of the app
2. `src/types/sponsor.ts` — all data shapes
3. `supabase/functions/sponsor-identification/index.ts` + `structured.ts` — the most complex logic
4. `supabase/functions/_shared/ai-extract.ts` and `_shared/scrape.ts` — AI + scraping plumbing
5. `spec.md` — full product specification
