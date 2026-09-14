# CLAUDE.md — Project Context for AI Assistants

## What is SponsorScout?

SponsorScout automates event sponsorship research. It guides users through a 5-step pipeline: discover events → identify sponsors → enrich contacts → generate outreach emails → export data.

## Architecture

```
src/
├── pages/Index.tsx                 # Main page, renders workflow steps
├── hooks/useSponsorWorkflow.ts     # Core state machine — all workflow logic lives here
├── types/sponsor.ts                # Shared TypeScript interfaces
├── components/
│   ├── EventInputForm.tsx          # Step 1: event name/type/industry/location
│   ├── EventDiscoveryResults.tsx   # Step 2: selectable event list
│   ├── SponsorList.tsx             # Step 3: filterable/sortable sponsor table
│   ├── EmailPreview.tsx            # Step 4: generated email drafts
│   ├── ExportPanel.tsx             # Step 5: CSV/Excel/email-template export
│   ├── WorkflowStepper.tsx         # Progress indicator across steps
supabase/functions/
├── meetup-discovery/               # Meetup search via JinaAI scraping (only discovery source)
├── sponsor-identification/         # Extract sponsors + tiers from event pages
├── contact-enrichment/             # Domain extraction, email variants, LinkedIn URLs
├── email-generation/               # AI email drafting via Lovable AI Gateway
└── export-data/                    # CSV, multi-sheet Excel, email template files
```

## Workflow Pipeline

Each step feeds into the next:

1. **Event Input** → `EventDetails` (name, type, industry, location)
2. **Event Discovery** → `DiscoveredEvent[]` — calls `meetup-discovery`
3. **Sponsor Identification + Enrichment** → `EnrichedSponsor[]` — calls `sponsor-identification` then `contact-enrichment`
4. **Email Generation** → `EmailDraft[]` — calls `email-generation` (AI or template fallback)
5. **Export** → downloadable files — calls `export-data`

## Edge Function Details

### meetup-discovery
- The only event discovery source; uses JinaAI Reader + AI extraction on Meetup search results
- **Input**: keywords + location from EventDetails
- **Output**: array of `DiscoveredEvent` with `source: 'meetup'`

### sponsor-identification
- Attempts JinaAI scraping of event URLs, falls back to sample sponsors
- Returns sponsors with tier classification (platinum/gold/silver/bronze/unknown)

### contact-enrichment
- Extracts domains from websites, generates email variants (info@, contact@, sponsors@, etc.)
- Builds LinkedIn company URLs from sponsor names
- No external API needed — all heuristic-based

### email-generation
- **AI path**: Lovable AI Gateway (`google/gemini-2.5-flash`) — no API key needed
- **Fallback**: Template-based emails when AI fails or returns 429/402
- **Legacy code**: Still references `ANTHROPIC_API_KEY` but this is unused; Lovable AI Gateway is the active path

### export-data
- CSV: comma-separated with headers
- Excel: multi-sheet workbook (events, sponsors, emails tabs)
- Email templates: individual `.txt` files per sponsor

## AI Integration

- **Provider**: Lovable AI Gateway
- **Endpoint**: `https://ai.gateway.lovable.dev/v1/chat/completions`
- **Model**: `google/gemini-2.5-flash`
- **Auth**: `LOVABLE_API_KEY` environment variable (auto-provisioned)
- **Prompt format**: structured output with `SUBJECT:` and `BODY:` markers

## Key Conventions

- **State management**: All workflow state lives in `useSponsorWorkflow.ts` hook — steps, loading, errors, data arrays
- **UI library**: shadcn/ui components in `src/components/ui/`
- **Styling**: Tailwind CSS with semantic design tokens from `index.css`
- **Types**: All data interfaces in `src/types/sponsor.ts`
- **Error handling**: Every edge function call has try/catch with sample data fallback + toast notifications
- **No database**: All state is in-memory (React state). No Supabase tables are used yet.

## Known Limitations

- **Meetup is the only event source** — public Meetup listings are scraped; Eventbrite was removed
- **Meetup integration** uses scraping only (no official API)
- **No persistence** — refreshing the page loses all workflow state
- **No authentication** — single-user, no saved searches
- **Email generation** has legacy Anthropic code that should be cleaned up
- **Contact enrichment** is heuristic-based (no Hunter.io or similar API)

## Important Files to Read First

1. `src/hooks/useSponsorWorkflow.ts` — the brain of the app
2. `src/types/sponsor.ts` — all data shapes
3. `src/pages/Index.tsx` — how components are assembled
4. `supabase/functions/event-discovery/index.ts` — most complex edge function
5. `spec.md` — full product specification
