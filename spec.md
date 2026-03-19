# SponsorScout — Product Specification

## 1. Purpose

SponsorScout automates the end-to-end process of finding potential sponsors for events. It replaces manual research with a guided, 5-step workflow that discovers events, identifies their sponsors, enriches contact information, generates personalized outreach emails, and exports data.

## 2. Target Users

- Event organizers seeking sponsorship
- Partnership/BD teams at conferences
- Marketing teams doing competitive sponsor research

## 3. Workflow Steps

### Step 1: Event Input
- **Fields**: Event name, type (conference/workshop/meetup/expo), industry, location
- **Validation**: All fields required
- **Output**: Search parameters passed to discovery

### Step 2: Event Discovery
- **Input**: Keywords derived from event details + location
- **Backend**: `event-discovery` edge function
- **Data Sources**: Eventbrite API, Apify scraping, or sample data fallback
- **Output**: List of similar events with name, date, location, URL, sponsor count
- **UI**: Selectable event list with checkboxes; data source indicator badge

### Step 3: Sponsor Identification & Contact Enrichment
- **Input**: Selected events from Step 2
- **Backend**: 
  - `sponsor-identification` — extracts sponsors from event pages
  - `contact-enrichment` — enriches with emails, domains, LinkedIn
- **Output**: Enriched sponsor list with tier, website, emails, LinkedIn, enrichment status
- **UI**: Filterable/sortable table
  - **Filters**: Tier (all/platinum/gold/silver/bronze/unknown), enrichment status (all/complete/partial/pending)
  - **Sort**: Name, tier, event count (ascending/descending)

### Step 4: Email Generation
- **Input**: Enriched sponsors + event context + sender info
- **Backend**: `email-generation` edge function
- **AI**: Lovable AI Gateway with `google/gemini-2.5-flash`
  - System prompt: professional business outreach, under 200 words
  - Structured output: `SUBJECT:` and `BODY:` format
- **Fallback**: Template-based emails when AI unavailable or rate-limited
- **Output**: Email drafts with subject, body, sponsor name, generation method (ai/template)

### Step 5: Export
- **Formats**: CSV, Excel (CSV), Email Templates
- **Backend**: `export-data` edge function
- **Content**: Events, sponsors, and email drafts bundled by format
- **UI**: Format cards with download buttons, completion indicators

## 4. Data Models

### EventDetails
| Field    | Type   | Required |
|----------|--------|----------|
| name     | string | ✓        |
| type     | string | ✓        |
| industry | string | ✓        |
| location | string | ✓        |

### DiscoveredEvent
| Field        | Type                              | Required |
|--------------|-----------------------------------|----------|
| id           | string                            | ✓        |
| name         | string                            | ✓        |
| date         | string                            | ✓        |
| location     | string                            | ✓        |
| url          | string                            | ✓        |
| source       | 'eventbrite' \| 'apify' \| 'sample' | ✓     |
| sponsorCount | number                            | ✗        |

### EnrichedSponsor
| Field            | Type                                               | Required |
|------------------|-----------------------------------------------------|----------|
| id               | string                                              | ✓        |
| name             | string                                              | ✓        |
| tier             | 'platinum' \| 'gold' \| 'silver' \| 'bronze' \| 'unknown' | ✓ |
| website          | string                                              | ✗        |
| domain           | string                                              | ✗        |
| events           | string[]                                            | ✓        |
| emails           | string[]                                            | ✓        |
| linkedinUrl      | string                                              | ✗        |
| enrichmentStatus | 'pending' \| 'processing' \| 'complete' \| 'partial' \| 'failed' | ✓ |

### EmailDraft
| Field            | Type                  | Required |
|------------------|-----------------------|----------|
| sponsorId        | string                | ✓        |
| sponsorName      | string                | ✓        |
| subject          | string                | ✓        |
| subjectVariations| string[]              | ✓        |
| body             | string                | ✓        |
| generatedWith    | 'ai' \| 'template'   | ✓        |

## 5. Edge Functions

| Function                 | Purpose                          | AI Used |
|--------------------------|----------------------------------|---------|
| `event-discovery`        | Find similar events via APIs     | No      |
| `sponsor-identification` | Extract sponsors from events     | No      |
| `contact-enrichment`     | Enrich with emails & LinkedIn    | No      |
| `email-generation`       | Generate outreach email drafts   | Yes     |
| `export-data`            | Format and package export files  | No      |

## 6. AI Integration

- **Provider**: Lovable AI Gateway
- **Model**: `google/gemini-2.5-flash`
- **Endpoint**: `https://ai.gateway.lovable.dev/v1/chat/completions`
- **Auth**: `LOVABLE_API_KEY` (auto-provisioned)
- **Rate Limit Handling**: Falls back to template emails on 429/402 errors
- **Prompt Strategy**: Context-rich prompts with sponsor tier, event count, and template type

## 7. Error Handling

- All edge function calls have try/catch with sample data fallback
- Toast notifications for success and failure states
- AI generation gracefully degrades to template-based emails
- Loading states with spinners on all async operations

## 8. UI Components

| Component                | Description                                  |
|--------------------------|----------------------------------------------|
| `WorkflowStepper`        | Visual step progress indicator               |
| `EventInputForm`         | Form with event name, type, industry, location |
| `EventDiscoveryResults`  | Selectable event cards/list                  |
| `SponsorList`            | Filterable, sortable sponsor data table      |
| `EmailPreview`           | Email draft viewer                           |
| `ExportPanel`            | Export format selection with download         |
| `DataSourceIndicator`    | Badge showing live vs sample data            |

## 9. Future Enhancements

- Database persistence for workflows and sponsor lists
- User authentication and saved searches
- Direct email sending via SMTP integration
- CRM export (HubSpot, Salesforce)
- Real-time event API integrations (Eventbrite, Luma, Lu.ma)
- Sponsor scoring/ranking algorithm
- Bulk email customization editor
