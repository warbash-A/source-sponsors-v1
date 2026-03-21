# Workflow Improvements — Design Spec

**Date:** 2026-03-21
**Status:** Approved

---

## Overview

Three independent improvements to SponsorScout:

1. **Anthropic email generation** — swap the Lovable AI gateway for the Anthropic API in the email-generation edge function
2. **Event count preset buttons** — let users choose how many events to discover (5 / 10 / 25 / 50)
3. **Go back navigation** — allow users to navigate back to previous steps without losing data

---

## Feature 1: Anthropic Email Generation

### Modified: `supabase/functions/email-generation/index.ts`

Replace the Lovable API block with an Anthropic API call.

**Environment variable:** `ANTHROPIC_API_KEY` (set as a Supabase secret). If absent, falls back to template emails — same behavior as today.

**API call:**
- Endpoint: `https://api.anthropic.com/v1/messages`
- Headers: `x-api-key: {ANTHROPIC_API_KEY}`, `anthropic-version: 2023-06-01`, `content-type: application/json`
- Model: `claude-haiku-4-5-20251001` (fast, cost-effective for email drafts)
- Max tokens: 500
- Same prompt already written in `buildEmailPrompt()` — unchanged

**Request body:**
```json
{
  "model": "claude-haiku-4-5-20251001",
  "max_tokens": 500,
  "system": "You are an expert at writing professional, personalized business outreach emails. Write concise, compelling emails that feel genuine and not generic. Keep emails under 200 words.",
  "messages": [{ "role": "user", "content": "<prompt>" }]
}
```

**Response parsing:**
- Extract text from `response.content[0].text`
- Pass to existing `parseEmailContent()` — unchanged
- On any error (non-200, network failure, parse failure): fall back to template

**`usedAI` flag:** Set to `true` when Anthropic call succeeds, `false` when template is used.

**What does not change:**
- `buildEmailPrompt()` — unchanged
- `parseEmailContent()` — unchanged
- `generateSubject()` — unchanged
- `generateTemplateEmail()` — unchanged
- The 300ms delay between sponsors — remove (only needed for rate-limiting, not required for Anthropic)
- Response shape `{ emails, totalGenerated, usedAI }` — unchanged

---

## Feature 2: Event Count Preset Buttons

### Modified: `src/types/sponsor.ts`

Add optional `eventCount` field to `EventDetails`:

```ts
export interface EventDetails {
  name: string;
  type: string;
  industry: string;
  location: string;
  sources?: ('eventbrite' | 'meetup')[];
  eventCount?: number;  // default 10 when absent
}
```

### Modified: `src/components/EventInputForm.tsx`

Add `eventCount` state (default `10`) and preset button UI.

**State:**
```ts
const [eventCount, setEventCount] = useState<number>(10);
```

**Preset values:** `[5, 10, 25, 50]`

**UI:** A new section below the source checkboxes, before the submit button:
```
Label: "Number of events"
Buttons: [5] [10] [25] [50]  — selected button is visually highlighted
```

Selected button styling: matches the active/selected pattern used elsewhere in the app (primary color border/background). Unselected: secondary/ghost style.

**Submit:** `eventCount` is spread into the submitted `EventDetails` alongside `sources`.

### Modified: `supabase/functions/event-discovery/index.ts`

Accept `eventCount` from request body (default `10` when absent):

```ts
const { keywords, location, dateRange, eventCount = 10 }: EventSearchParams & { eventCount?: number } = await req.json();
```

Replace the hard-coded `events.slice(0, 10)` with `events.slice(0, eventCount)`.

The inner parsing loops (`parseEventsFromMarkdown`, `parseEventsFromGenericSearch`) already cap at 10 — update those caps to use `eventCount` too.

### Modified: `supabase/functions/meetup-discovery/index.ts`

Same pattern: accept `eventCount` (default `10`), pass it as the limit when slicing results.

### Modified: `src/hooks/useSponsorWorkflow.ts`

Pass `eventCount` from `details` through to both edge function invocations:

```ts
body: { keywords, location: details.location, eventCount: details.eventCount ?? 10 }
```

---

## Feature 3: Go Back Navigation

### Modified: `src/hooks/useSponsorWorkflow.ts`

Add `handleGoBack` callback:

```ts
const handleGoBack = useCallback(() => {
  const prevStep = currentStep - 1;
  setCurrentStep(prevStep);
  updateStepStatus(currentStep + 1, 'pending');
  updateStepStatus(prevStep + 1, 'active');
}, [currentStep, updateStepStatus]);
```

`updateStepStatus` signature: `(stepId: number, status: WorkflowStep['status']) => void` where `stepId` is **1-based** (steps 1–5). `currentStep` is **0-based** (0–4), so the `+ 1` offsets convert between the two systems.

Worked example — going back from step 3 to step 2 (`currentStep = 2`):
- `prevStep = 1`
- `updateStepStatus(currentStep + 1, 'pending')` → `updateStepStatus(3, 'pending')` — step 3 marked pending ✓
- `updateStepStatus(prevStep + 1, 'active')` → `updateStepStatus(2, 'active')` — step 2 marked active ✓

The two calls target different step IDs (3 and 2); no overlap.

- No data is cleared — navigation only
- Only valid when `currentStep > 0` (callers are responsible for not rendering the button on step 1)
- Add `handleGoBack` to the hook's return value

### Modified: `src/pages/Index.tsx`

Show a **Back** button on steps 2–5 (when `currentStep > 0`).

- Positioned to the left of the primary action button for each step
- Variant: `outline` or `ghost` (secondary — less prominent than the primary action)
- Label: "Back"
- `onClick`: calls `handleGoBack`
- Not rendered on step 1 (`currentStep === 0`) — nowhere to go

---

## Data Flow

```
EventInputForm
  sources: ['eventbrite', 'meetup']  (or subset)
  eventCount: 10 | 5 | 25 | 50
      ↓
useSponsorWorkflow.handleEventSubmit
  → passes eventCount to both edge functions
      ↓
event-discovery / meetup-discovery
  → respects eventCount limit on returned events
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| `ANTHROPIC_API_KEY` not set | Falls back to template emails, `usedAI: false` |
| Anthropic API returns non-200 | Falls back to template emails |
| Anthropic API network failure | Falls back to template emails |
| `eventCount` absent from request | Edge functions default to 10 |
| `handleGoBack` called on step 1 | Not possible — button not rendered on step 1 |

---

## What Does Not Change

- `buildEmailPrompt()`, `parseEmailContent()`, `generateSubject()`, `generateTemplateEmail()` — unchanged
- Email response shape `{ emails, totalGenerated, usedAI }` — unchanged
- All downstream sponsor pipeline steps — unchanged
- `selectedEventIds`, `sponsors`, `emails` state — not cleared on back navigation
- `EventDetails` existing fields — all optional additions only

---

## Testing

### Anthropic email generation
- With `ANTHROPIC_API_KEY` set: emails are generated via Anthropic, `usedAI: true`
- Without `ANTHROPIC_API_KEY`: template emails generated, `usedAI: false`
- Anthropic returns error: falls back to template, no crash

### Event count
- Default (no selection change): 10 events requested and returned
- Select 25: 25 events requested; up to 25 returned (may be fewer if source has less)
- `eventCount` appears in the submitted `EventDetails` object
- Both `event-discovery` and `meetup-discovery` respect the limit

### Go back navigation
- Back button absent on step 1
- Back button present on steps 2–5
- Clicking Back on step 3 (sponsors): moves to step 2 (discovery), sponsor data still present
- Clicking Back on step 2 (discovery): moves to step 1 (form), event data still present
- Re-submitting form after going back: clears events and proceeds normally (existing behaviour)
