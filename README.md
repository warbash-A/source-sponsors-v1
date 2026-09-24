# SponsorScout

**Event Sponsorship Research Tool** — Discover events, identify sponsors, enrich contacts, generate outreach emails, and export everything.

## Overview

SponsorScout is a web application that automates the sponsor research workflow for event organizers and partnership teams. It guides users through a 5-step pipeline to go from event details to ready-to-send outreach emails.

## Features

- **Event Discovery** — Input your event details and find similar conferences/events with known sponsors
- **Sponsor Identification** — Extract and list sponsors from discovered events with tier classification (Platinum, Gold, Silver, Bronze)
- **Contact Enrichment** — Enrich sponsor data with emails, domains, and LinkedIn profiles
- **AI Email Generation** — Generate personalized outreach emails using AI or fallback templates
- **Filtering & Sorting** — Filter sponsors by tier, enrichment status; sort by name, tier, or event count
- **Export** — Download data as CSV, Excel, or email templates

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend**: Lovable Cloud (Edge Functions)
- **AI**: Lovable AI Gateway (Google Gemini)
- **State Management**: React hooks (`useSponsorWorkflow`)

## Architecture

```
src/
├── pages/Index.tsx              # Main workflow page
├── components/
│   ├── EventInputForm.tsx       # Step 1: Event details form
│   ├── EventDiscoveryResults.tsx # Step 2: Event list with selection
│   ├── SponsorList.tsx          # Step 3: Sponsor table with filters
│   ├── EmailPreview.tsx         # Step 4: Generated email previews
│   ├── ExportPanel.tsx          # Step 5: Export options
│   ├── WorkflowStepper.tsx      # Progress stepper
│   └── DataSourceIndicator.tsx  # Live vs sample data indicator
├── hooks/
│   └── useSponsorWorkflow.ts    # Core workflow state & logic
├── types/
│   └── sponsor.ts               # TypeScript interfaces
supabase/functions/
├── event-discovery/             # Find similar events
├── sponsor-identification/      # Extract sponsors from events
├── contact-enrichment/          # Enrich sponsor contact data
├── email-generation/            # AI-powered email drafting
└── export-data/                 # CSV/Excel export generation
```

## Workflow

1. **Input** — User enters event name, type, industry, and location
2. **Discovery** — Backend finds similar events (live API or sample data)
3. **Sponsors** — Sponsors are extracted and contacts enriched
4. **Emails** — AI generates personalized partnership outreach emails
5. **Export** — Download sponsors and emails as CSV, Excel, or templates

## Getting Started

This project runs on [Lovable](https://lovable.dev). Open it in the Lovable editor to develop and preview.

## Local Development

```sh
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>
npm i
npm run dev
```

## Performance

- **Event Discovery**: 30-60 seconds for 3-5 events
- **Sponsor Extraction**: 20-40 seconds per event
- **Recommended**: Start with 3 events for fastest results
- **Manual URL Input**: Fastest way to add specific events

## Tips

✅ Use manual URL input for known events (fastest)  
✅ Start with 3 events, then increase if needed  
✅ Major conferences work better than small events  
⚠️ Some events may not list sponsors publicly

## License

Private project.
