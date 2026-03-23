# Workflow Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Anthropic email generation, event count preset buttons (5/10/25/50), and go back navigation to SponsorScout.

**Architecture:** Three independent features: (1) swap the Lovable API gateway for the Anthropic API in the email-generation edge function, with template fallback when `ANTHROPIC_API_KEY` is absent; (2) add an `eventCount` field through the EventDetails type → form UI → hook → both discovery edge functions; (3) add a `handleGoBack` callback to the hook and render a Back button on steps 2–5 in the page.

**Tech Stack:** React 18, TypeScript, Supabase Edge Functions (Deno), Vite

---

## File Structure

| File | Change |
|---|---|
| `supabase/functions/email-generation/index.ts` | Replace Lovable API block with Anthropic API call; remove 300ms delay |
| `src/types/sponsor.ts` | Add `eventCount?: number` to `EventDetails` |
| `src/components/EventInputForm.tsx` | Add `eventCount` state + preset button UI |
| `supabase/functions/event-discovery/index.ts` | Accept `eventCount`, pass to slicing and inner loop caps |
| `supabase/functions/meetup-discovery/index.ts` | Accept `eventCount`, pass to URL slicing |
| `src/hooks/useSponsorWorkflow.ts` | Pass `eventCount` to both edge functions; add `handleGoBack` callback |
| `src/pages/Index.tsx` | Destructure `handleGoBack`; render Back button on steps 2–5 |

---

## Task 1: Anthropic Email Generation

**Files:**
- Modify: `supabase/functions/email-generation/index.ts`

The existing file uses the Lovable AI gateway (`LOVABLE_API_KEY`). Replace that entire block with an Anthropic API call using `ANTHROPIC_API_KEY`. Keep `buildEmailPrompt()`, `parseEmailContent()`, `generateSubject()`, and `generateTemplateEmail()` exactly as-is. Remove the 300ms delay.

The key change is the `if (LOVABLE_API_KEY)` block becomes `if (ANTHROPIC_API_KEY)` with a different fetch call.

- [ ] **Step 1: Replace the API key variable and the AI generation block**

In `supabase/functions/email-generation/index.ts`, find the line:
```ts
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
```
Replace it with:
```ts
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
```

- [ ] **Step 2: Replace the Lovable fetch block with the Anthropic fetch block**

Find the entire `if (LOVABLE_API_KEY) { try { ... }` block (lines ~56–109). Replace with:

```ts
if (ANTHROPIC_API_KEY) {
  try {
    const prompt = buildEmailPrompt(sponsor, eventName, senderName, senderOrganization, template);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: "You are an expert at writing professional, personalized business outreach emails. Write concise, compelling emails that feel genuine and not generic. Keep emails under 200 words.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const generatedContent = data.content[0]?.text || '';
      const parsed = parseEmailContent(generatedContent);
      subject = parsed.subject || generateSubject(sponsor, eventName, template);
      emailBody = parsed.body || generateTemplateEmail(sponsor, eventName, senderName, senderOrganization, template);
    } else {
      console.log('Anthropic API failed with status:', response.status);
      subject = generateSubject(sponsor, eventName, template);
      emailBody = generateTemplateEmail(sponsor, eventName, senderName, senderOrganization, template);
    }
  } catch (error) {
    console.error('Anthropic generation error:', error);
    subject = generateSubject(sponsor, eventName, template);
    emailBody = generateTemplateEmail(sponsor, eventName, senderName, senderOrganization, template);
  }
} else {
  // No API key, use template
  subject = generateSubject(sponsor, eventName, template);
  emailBody = generateTemplateEmail(sponsor, eventName, senderName, senderOrganization, template);
}
```

- [ ] **Step 3: Remove the 300ms delay**

Find and delete these lines (they appear right after the `emails.push(...)` call, before the closing `}`):
```ts
// Small delay between AI calls
if (LOVABLE_API_KEY) {
  await new Promise(resolve => setTimeout(resolve, 300));
}
```

- [ ] **Step 4: Update the `usedAI` flag in the response**

Find:
```ts
usedAI: !!LOVABLE_API_KEY,
```
Replace with:
```ts
usedAI: !!ANTHROPIC_API_KEY,
```

- [ ] **Step 5: Verify the full function shape is intact**

Read `supabase/functions/email-generation/index.ts` and confirm:
- `buildEmailPrompt()` — unchanged
- `parseEmailContent()` — unchanged
- `generateSubject()` — unchanged
- `generateTemplateEmail()` — unchanged
- Response shape: `{ emails, totalGenerated, usedAI }` — unchanged
- No `LOVABLE_API_KEY` references remain

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/email-generation/index.ts
git commit -m "feat(email): replace Lovable API with Anthropic claude-haiku-4-5-20251001"
```

---

## Task 2: Add `eventCount` to EventDetails Type

**Files:**
- Modify: `src/types/sponsor.ts`

- [ ] **Step 1: Add the optional field**

In `src/types/sponsor.ts`, find:
```ts
export interface EventDetails {
  name: string;
  type: string;
  industry: string;
  location: string;
  sources?: ('eventbrite' | 'meetup')[];
}
```
Replace with:
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

- [ ] **Step 2: TypeScript compile check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/types/sponsor.ts
git commit -m "feat(types): add optional eventCount to EventDetails"
```

---

## Task 3: Event Count Preset Buttons in EventInputForm

**Files:**
- Modify: `src/components/EventInputForm.tsx`

Add `eventCount` state (default `10`) and a preset button row below the source checkboxes. Include `eventCount` in the submitted `EventDetails`.

- [ ] **Step 1: Add `eventCount` state**

In `src/components/EventInputForm.tsx`, find:
```ts
  const [sources, setSources] = useState<('eventbrite' | 'meetup')[]>(['eventbrite', 'meetup']);
```
Add the new state immediately after it:
```ts
  const [sources, setSources] = useState<('eventbrite' | 'meetup')[]>(['eventbrite', 'meetup']);
  const [eventCount, setEventCount] = useState<number>(10);
```

- [ ] **Step 2: Include `eventCount` in the submit payload**

Find:
```ts
    onSubmit({ ...formData, sources });
```
Replace with:
```ts
    onSubmit({ ...formData, sources, eventCount });
```

- [ ] **Step 3: Add the preset button UI**

Find the closing tag of the sources section:
```tsx
      </div>

      <Button
        type="submit"
```
Replace with:
```tsx
      </div>

      <div className="space-y-3">
        <Label className="text-foreground text-sm font-medium">Number of events</Label>
        <div className="flex items-center gap-2">
          {[5, 10, 25, 50].map((count) => (
            <Button
              key={count}
              type="button"
              variant={eventCount === count ? "default" : "outline"}
              size="sm"
              onClick={() => setEventCount(count)}
            >
              {count}
            </Button>
          ))}
        </div>
      </div>

      <Button
        type="submit"
```

- [ ] **Step 4: TypeScript compile check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Build check**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add src/components/EventInputForm.tsx
git commit -m "feat(form): add event count preset buttons (5/10/25/50)"
```

---

## Task 4: Edge Functions Respect `eventCount`

**Files:**
- Modify: `supabase/functions/event-discovery/index.ts`
- Modify: `supabase/functions/meetup-discovery/index.ts`

### 4a — event-discovery

- [ ] **Step 1: Accept `eventCount` from request body**

Find:
```ts
    const { keywords, location, dateRange }: EventSearchParams = await req.json();
```
Replace with:
```ts
    const { keywords, location, dateRange, eventCount = 10 }: EventSearchParams & { eventCount?: number } = await req.json();
```

- [ ] **Step 2: Use `eventCount` in the final slice**

Find:
```ts
      events: events.slice(0, 10), // Limit to 10 events
```
Replace with:
```ts
      events: events.slice(0, eventCount),
```

- [ ] **Step 3: Update `parseEventsFromMarkdown` signature to accept `eventCount`**

Find:
```ts
function parseEventsFromMarkdown(content: string, keywords: string): DiscoveredEvent[] {
```
Replace with:
```ts
function parseEventsFromMarkdown(content: string, keywords: string, eventCount: number = 10): DiscoveredEvent[] {
```

Update the two call sites within `serve()`:
```ts
        const parsedEvents = parseEventsFromMarkdown(content, keywords);
```
Replace both occurrences with:
```ts
        const parsedEvents = parseEventsFromMarkdown(content, keywords, eventCount);
```

- [ ] **Step 4: Use `eventCount` as the inner loop cap in `parseEventsFromMarkdown`**

There are two inner `break` guards in `parseEventsFromMarkdown` — one in Strategy 1 (Eventbrite URL pattern loop) and one in Strategy 2 (markdown link loop). Update both.

Find (Strategy 1, around line 175):
```ts
    if (events.length >= 10) break;
  }

  // Strategy 2: Look for markdown links with event-like titles
```
Replace with:
```ts
    if (events.length >= eventCount) break;
  }

  // Strategy 2: Look for markdown links with event-like titles
```

Find (Strategy 2, around line 211):
```ts
    if (events.length >= 10) break;
  }

  return events;
}

function parseEventsFromGenericSearch
```
Replace with:
```ts
    if (events.length >= eventCount) break;
  }

  return events;
}

function parseEventsFromGenericSearch
```

Note: `parseEventsFromGenericSearch` caps at 5 (it's a fallback top-up, not the primary source) — leave that cap unchanged.

- [ ] **Step 5: Verify no remaining hard-coded `10` caps used as event limits in serve()**

Read `supabase/functions/event-discovery/index.ts` and confirm no `slice(0, 10)` remains in the `serve()` handler (the helpers outside serve can keep their internal guards).

### 4b — meetup-discovery

- [ ] **Step 6: Accept `eventCount` from request body**

Find:
```ts
      const params: MeetupSearchParams = await req.json();
      keywords = params.keywords;
      location = params.location;
```
Replace with:
```ts
      const params: MeetupSearchParams & { eventCount?: number } = await req.json();
      keywords = params.keywords;
      location = params.location;
      eventCount = params.eventCount ?? 10;
```

Before the `try/catch` that parses the body, add a declaration:
```ts
    let eventCount = 10;
```
(Place it right after `const events: DiscoveredEvent[] = [];` so it's in scope.)

- [ ] **Step 7: Use `eventCount` in the URL slice**

Find:
```ts
    for (const { url, name } of meetupUrls.slice(0, 10)) {
```
Replace with:
```ts
    for (const { url, name } of meetupUrls.slice(0, eventCount)) {
```

- [ ] **Step 8: Build check (TypeScript on Deno files — syntax only)**

Run: `npm run build`
Expected: Vite build succeeds (Deno files are not compiled by Vite, but this confirms no accidental breakage in the frontend)

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/event-discovery/index.ts supabase/functions/meetup-discovery/index.ts
git commit -m "feat(discovery): respect eventCount limit from request body"
```

---

## Task 5: Pass `eventCount` and Add `handleGoBack` to the Hook

**Files:**
- Modify: `src/hooks/useSponsorWorkflow.ts`

### 5a — Pass `eventCount` to edge functions

- [ ] **Step 1: Pass `eventCount` in the event-discovery invocation**

In `handleEventSubmit`, find:
```ts
          ? supabase.functions.invoke('event-discovery', {
              body: { keywords, location: details.location },
            })
```
Replace with:
```ts
          ? supabase.functions.invoke('event-discovery', {
              body: { keywords, location: details.location, eventCount: details.eventCount ?? 10 },
            })
```

- [ ] **Step 2: Pass `eventCount` in the meetup-discovery invocation**

Find:
```ts
          ? supabase.functions.invoke('meetup-discovery', {
              body: { keywords, location: details.location },
            })
```
Replace with:
```ts
          ? supabase.functions.invoke('meetup-discovery', {
              body: { keywords, location: details.location, eventCount: details.eventCount ?? 10 },
            })
```

### 5b — Add `handleGoBack`

- [ ] **Step 3: Add the `handleGoBack` callback**

Find the `handleToggleEvent` callback:
```ts
  const handleToggleEvent = useCallback((eventId: string) => {
```
Add `handleGoBack` immediately before it:
```ts
  const handleGoBack = useCallback(() => {
    const prevStep = currentStep - 1;
    setCurrentStep(prevStep);
    updateStepStatus(currentStep + 1, 'pending');
    updateStepStatus(prevStep + 1, 'active');
  }, [currentStep, updateStepStatus]);

  const handleToggleEvent = useCallback((eventId: string) => {
```

Note on the arithmetic (both use 1-based `stepId`):
- `updateStepStatus(currentStep + 1, 'pending')` marks the step we're leaving as pending
- `updateStepStatus(prevStep + 1, 'active')` = `updateStepStatus(currentStep, 'active')` marks the step we're going to as active
- Example: currentStep=2 → marks stepId 3 pending, stepId 2 active ✓

- [ ] **Step 4: Add `handleGoBack` to the return value**

Find the return statement of `useSponsorWorkflow`. It currently returns an object with several handlers. Add `handleGoBack` to it:
```ts
    handleGoBack,
```
Place it alongside the other `handle*` exports (e.g., after `handleToggleEvent`).

- [ ] **Step 5: TypeScript compile check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Build check**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useSponsorWorkflow.ts
git commit -m "feat(workflow): pass eventCount to discovery; add handleGoBack"
```

---

## Task 6: Back Button in Index.tsx

**Files:**
- Modify: `src/pages/Index.tsx`

Show a Back button on steps 2–5 (when `currentStep > 0`), positioned to the left of each step's primary action button.

- [ ] **Step 1: Import `ChevronLeft` icon**

Find:
```ts
import { Search, RotateCcw, ArrowRight } from "lucide-react";
```
Replace with:
```ts
import { Search, RotateCcw, ArrowRight, ChevronLeft } from "lucide-react";
```

- [ ] **Step 2: Destructure `handleGoBack` from the hook**

Find the destructured return from `useSponsorWorkflow()`:
```ts
    resetWorkflow,
  } = useSponsorWorkflow();
```
Replace with:
```ts
    resetWorkflow,
    handleGoBack,
  } = useSponsorWorkflow();
```

- [ ] **Step 3: Add Back button to Step 2 (Event Discovery)**

Step 2's action area currently reads:
```tsx
                <div className="mt-6 flex justify-end">
                  <Button
                    onClick={handleProceedToSponsors}
```
Replace with:
```tsx
                <div className="mt-6 flex justify-between">
                  <Button variant="outline" onClick={handleGoBack}>
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Back
                  </Button>
                  <Button
                    onClick={handleProceedToSponsors}
```

- [ ] **Step 4: Add Back button to Step 3 (Sponsors)**

Step 3's action area:
```tsx
              <div className="mt-6 flex justify-end">
                <Button
                  onClick={handleGenerateEmails}
```
Replace with:
```tsx
              <div className="mt-6 flex justify-between">
                <Button variant="outline" onClick={handleGoBack}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
                <Button
                  onClick={handleGenerateEmails}
```

- [ ] **Step 5: Add Back button to Step 4 (Email Generation)**

Step 4's action area:
```tsx
              <div className="mt-6 flex justify-end">
                <Button onClick={handleProceedToExport} variant="gradient">
```
Replace with:
```tsx
              <div className="mt-6 flex justify-between">
                <Button variant="outline" onClick={handleGoBack}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
                <Button onClick={handleProceedToExport} variant="gradient">
```

- [ ] **Step 6: Add Back button to Step 5 (Export)**

Step 5's card currently has only `<ExportPanel ... />` with no action row. Add a Back button below the panel:
```tsx
            <div className="rounded-xl border border-border bg-card p-6 shadow-card">
              <ExportPanel
                onExport={handleExport}
                exportingFormat={exportingFormat}
                completedFormats={completedExports}
              />
              <div className="mt-6 flex justify-start">
                <Button variant="outline" onClick={handleGoBack}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              </div>
            </div>
```

- [ ] **Step 7: TypeScript compile check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 8: Build check**

Run: `npm run build`
Expected: `✓ built in X.XXs` with no errors

- [ ] **Step 9: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "feat(nav): add Back button on steps 2-5"
```

---

## Task 7: Verification

**Files:** None modified — build and browser verification

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: server starts, no build errors

- [ ] **Step 2: Verify event count buttons**

Open the app at `http://localhost:8080`. On the form:
- Default selected button should be [10]
- Click [25] — button becomes highlighted, others un-highlight
- Submit the form — network request to `event-discovery` should contain `"eventCount": 25`

- [ ] **Step 3: Verify Back button absence on step 1**

On step 1 (form), confirm no Back button is rendered.

- [ ] **Step 4: Verify Back button presence on steps 2–5**

Submit the form to advance to step 2. Confirm Back button appears to the left of the primary action.
Click Back — returns to step 1. Form fields should still be blank (EventInputForm has its own local state; going back re-shows the form).

- [ ] **Step 5: Verify data preserved on back navigation**

Submit form → wait for discovery → select events → click Extract Sponsors → wait for step 3.
On step 3: click Back. App returns to step 2. Events should still be listed and selected.

- [ ] **Step 6: Verify email generation falls back gracefully**

If `ANTHROPIC_API_KEY` is not set in Supabase secrets: emails are still generated using templates, `usedAI: false`.
(Full AI test requires deploying to Supabase with the key set — covered in the Supabase setup checklist.)

- [ ] **Step 7: Final build check**

Run: `npm run build`
Expected: `✓ built in X.XXs` with no errors
