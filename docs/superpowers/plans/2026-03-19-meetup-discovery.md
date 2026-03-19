# Meetup Discovery Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Meetup.com as an optional event discovery source alongside Eventbrite, with results in separate sections and only sponsored Meetup events surfaced.

**Architecture:** A new `meetup-discovery` Supabase Edge Function uses JinaAI Reader to scrape Meetup (same pattern as `event-discovery`). The form gains source checkboxes; the workflow hook fans out to both functions in parallel for discovery; downstream steps (sponsors, emails, export) keep their own single `isLoading` flag. The results component renders two independent sections.

**Tech Stack:** React 18, TypeScript, Deno (Supabase Edge Functions), JinaAI Reader API, shadcn/ui Checkbox, Tailwind CSS

> **Note:** `event-discovery` uses JinaAI Reader (`https://r.jina.ai/`), not Apify. This plan uses the same approach for Meetup — no new API keys required.

---

## File Map

| File | Change |
|------|--------|
| `src/types/sponsor.ts` | Add `'meetup'` to `DiscoveredEvent.source`; add optional `sources?` to `EventDetails` |
| `supabase/functions/meetup-discovery/index.ts` | **New** — Deno edge function mirroring `event-discovery` |
| `src/components/EventInputForm.tsx` | Add source checkboxes; pass `sources` on submit |
| `src/hooks/useSponsorWorkflow.ts` | Split discovery state; add parallel fetch; update all `discoveredEvents` references |
| `src/components/EventDiscoveryResults.tsx` | New props interface; two-section layout |
| `src/pages/Index.tsx` | Pass new props; remove `DataSourceIndicator` from step 2 |

---

## Task 1: Extend TypeScript Types

**Files:**
- Modify: `src/types/sponsor.ts`

- [ ] **Step 1: Add `'meetup'` to `DiscoveredEvent.source` and add `sources?` to `EventDetails`**

Open `src/types/sponsor.ts`. Make two changes:

Change `DiscoveredEvent.source` (line 14):
```ts
// Before:
source: 'eventbrite' | 'apify' | 'sample';
// After:
source: 'eventbrite' | 'apify' | 'sample' | 'meetup';
```

Add `sources?` to `EventDetails` (make it optional so existing callers that don't pass it don't break):
```ts
// Before:
export interface EventDetails {
  name: string;
  type: string;
  industry: string;
  location: string;
}
// After:
export interface EventDetails {
  name: string;
  type: string;
  industry: string;
  location: string;
  sources?: ('eventbrite' | 'meetup')[];
}
```

`sources` is optional so that `EventInputForm`'s existing `useState<EventDetails>({ name: "", type: "", industry: "", location: "" })` initialiser does not break before Task 3 updates the form.

- [ ] **Step 2: Verify compile — no new errors introduced**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: same errors as before (none in types file itself). If new errors appear, fix before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/types/sponsor.ts
git commit -m "feat(types): add meetup source and optional sources field to EventDetails"
```

---

## Task 2: Create `meetup-discovery` Edge Function

**Files:**
- Create: `supabase/functions/meetup-discovery/index.ts`

- [ ] **Step 1: Create the file**

Create `supabase/functions/meetup-discovery/index.ts`:

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MeetupSearchParams {
  keywords: string;
  location?: string;
}

// Local type — only 'meetup' is valid here
interface DiscoveredEvent {
  id: string;
  name: string;
  url: string;
  date: string;
  location: string;
  sponsorCount?: number;
  source: 'meetup';
}

const SPONSOR_INDICATORS = [
  'sponsored by',
  'our sponsors',
  'thank our sponsors',
  'gold sponsor',
  'silver sponsor',
  'bronze sponsor',
  'platinum sponsor',
  'presenting sponsor',
  'title sponsor',
  'sponsors & partners',
  'sponsors:',
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keywords, location }: MeetupSearchParams = await req.json();
    console.log('Meetup discovery request:', { keywords, location });

    const events: DiscoveredEvent[] = [];

    const searchQuery = encodeURIComponent(keywords.trim());
    const locationQuery = location ? encodeURIComponent(location) : '';
    const meetupSearchUrl = locationQuery
      ? `https://www.meetup.com/find/?keywords=${searchQuery}&location=${locationQuery}&source=EVENTS`
      : `https://www.meetup.com/find/?keywords=${searchQuery}&source=EVENTS`;

    console.log('Fetching Meetup search via JinaAI:', meetupSearchUrl);

    const jinaResponse = await fetch(`https://r.jina.ai/${meetupSearchUrl}`, {
      headers: { 'Accept': 'text/plain' },
    });

    if (!jinaResponse.ok) {
      console.log('JinaAI request failed:', jinaResponse.status);
      return new Response(JSON.stringify({ events: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const content = await jinaResponse.text();
    console.log('JinaAI response length:', content.length);

    const meetupUrls = extractMeetupEventUrls(content);
    console.log('Found Meetup event URLs:', meetupUrls.length);

    // Fetch each event page and filter to only those with explicit sponsor info
    for (const { url, name } of meetupUrls.slice(0, 10)) {
      try {
        const eventResponse = await fetch(`https://r.jina.ai/${url}`, {
          headers: { 'Accept': 'text/plain' },
        });
        if (!eventResponse.ok) continue;

        const eventContent = await eventResponse.text();
        if (!hasSponsorInfo(eventContent)) continue;

        const snippet = eventContent.substring(0, 1000);
        const date = extractDateFromContext(snippet);
        const loc = extractLocationFromContext(snippet);

        events.push({
          id: generateId(),
          name,
          url,
          date: date || 'TBD',
          location: loc || location || 'See event page',
          source: 'meetup',
        });
      } catch (err) {
        console.error('Error fetching event page:', url, err);
      }
    }

    console.log('Meetup events with sponsors found:', events.length);

    return new Response(JSON.stringify({ events }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in meetup-discovery:', error);
    // Always return empty array — no sample data fallback for Meetup
    return new Response(JSON.stringify({ events: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/** Returns true if content contains explicit sponsor mentions */
export function hasSponsorInfo(content: string): boolean {
  const lower = content.toLowerCase();
  return SPONSOR_INDICATORS.some(indicator => lower.includes(indicator));
}

function extractMeetupEventUrls(content: string): { url: string; name: string }[] {
  const results: { url: string; name: string }[] = [];
  const seen = new Set<string>();
  const linkPattern = /\[([^\]]{5,120})\]\((https?:\/\/(?:www\.)?meetup\.com\/[^)]+\/events\/[^)]+)\)/g;
  for (const match of content.matchAll(linkPattern)) {
    const [, name, url] = match;
    if (seen.has(url)) continue;
    seen.add(url);
    const cleanName = name.replace(/\s+/g, ' ').trim();
    if (cleanName.length > 5) results.push({ url, name: cleanName });
  }
  return results;
}

function extractDateFromContext(context: string): string | null {
  const patterns = [
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:\s*[-–]\s*\d{1,2})?,?\s*\d{4}\b/i,
    /\b\d{1,2}(?:\s*[-–]\s*\d{1,2})?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\b/i,
  ];
  for (const pattern of patterns) {
    const match = context.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function extractLocationFromContext(context: string): string | null {
  const patterns = [
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z]{2})\b/,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z][a-z]+)\b/,
  ];
  for (const pattern of patterns) {
    const match = context.match(pattern);
    if (match) return match[0];
  }
  if (/\b(online|virtual|remote)\b/i.test(context)) return 'Online';
  return null;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}
```

- [ ] **Step 2: Verify file exists**

Run: `ls supabase/functions/meetup-discovery/`
Expected: `index.ts`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/meetup-discovery/index.ts
git commit -m "feat(meetup-discovery): add Meetup edge function with JinaAI and sponsor filtering"
```

---

## Task 3: Add Source Checkboxes to `EventInputForm`

**Files:**
- Modify: `src/components/EventInputForm.tsx`

- [ ] **Step 1: Add `Checkbox` import**

Add to the existing shadcn/ui import block at the top of the file:
```ts
import { Checkbox } from "@/components/ui/checkbox";
```

- [ ] **Step 2: Add `sources` state inside the component**

After the existing `formData` state (line ~45), add:
```ts
const [sources, setSources] = useState<('eventbrite' | 'meetup')[]>(['eventbrite', 'meetup']);
```

Note: `sources` is **separate** from `formData` — do NOT add it to the `formData` state object. This avoids conflicts with `handleChange`, which types its `value` param as `string`.

- [ ] **Step 3: Add toggle handler**

After `handleChange`, add:
```ts
const handleSourceToggle = (source: 'eventbrite' | 'meetup') => {
  // Prevent unchecking the last source
  if (sources.length === 1 && sources.includes(source)) return;
  setSources((prev) =>
    prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]
  );
};
```

- [ ] **Step 4: Update `isValid` and `handleSubmit`**

Update `isValid`:
```ts
const isValid =
  formData.name &&
  formData.type &&
  formData.industry &&
  formData.location &&
  sources.length > 0;
```

Update `handleSubmit` to spread `sources` into the submitted object:
```ts
const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  onSubmit({ ...formData, sources });
};
```

- [ ] **Step 5: Add checkbox JSX**

Inside the `<form>`, add a new `<div>` section between the closing `</div>` of the grid and the `<Button>`:
```tsx
<div className="space-y-3">
  <Label className="text-foreground text-sm font-medium">Search Sources</Label>
  <div className="flex items-center gap-6">
    <div className="flex items-center gap-2">
      <Checkbox
        id="source-eventbrite"
        checked={sources.includes('eventbrite')}
        onCheckedChange={() => handleSourceToggle('eventbrite')}
        disabled={sources.length === 1 && sources.includes('eventbrite')}
      />
      <Label htmlFor="source-eventbrite" className="text-sm cursor-pointer">
        Eventbrite
      </Label>
    </div>
    <div className="flex items-center gap-2">
      <Checkbox
        id="source-meetup"
        checked={sources.includes('meetup')}
        onCheckedChange={() => handleSourceToggle('meetup')}
        disabled={sources.length === 1 && sources.includes('meetup')}
      />
      <Label htmlFor="source-meetup" className="text-sm cursor-pointer">
        Meetup
      </Label>
    </div>
  </div>
</div>
```

- [ ] **Step 6: Verify compile — no errors in this file**

Run: `npx tsc --noEmit 2>&1 | grep EventInputForm`
Expected: no output (no errors).

- [ ] **Step 7: Commit**

```bash
git add src/components/EventInputForm.tsx
git commit -m "feat(form): add Eventbrite/Meetup source selection checkboxes"
```

---

## Task 4: Refactor `useSponsorWorkflow` for Parallel Discovery

**Files:**
- Modify: `src/hooks/useSponsorWorkflow.ts`

**Important:** This task touches every place `discoveredEvents`, `isLoading`, and `dataSource` appear. All references are listed explicitly below.

- [ ] **Step 1: Replace discovery-phase state declarations**

Find these three state lines (approx lines 25, 29, 30):
```ts
const [discoveredEvents, setDiscoveredEvents] = useState<DiscoveredEvent[]>([]);
const [dataSource, setDataSource] = useState<'eventbrite' | 'apify' | 'sample'>('sample');
const [isLoading, setIsLoading] = useState(false);
```
Replace with:
```ts
const [eventbriteEvents, setEventbriteEvents] = useState<DiscoveredEvent[]>([]);
const [meetupEvents, setMeetupEvents] = useState<DiscoveredEvent[]>([]);
const [isLoadingEventbrite, setIsLoadingEventbrite] = useState(false);
const [isLoadingMeetup, setIsLoadingMeetup] = useState(false);
// Keep a separate isLoading for downstream steps (sponsors, emails, export)
const [isLoading, setIsLoading] = useState(false);
```

Note: `isLoading` is **kept** for steps 3–5 (sponsor identification, email generation, export). Only the discovery-phase loading is split.

- [ ] **Step 2: Rewrite `handleEventSubmit`**

Replace the entire `handleEventSubmit` callback (lines 40–83) with:
```ts
const handleEventSubmit = useCallback(async (details: EventDetails) => {
  setEventDetails(details);
  updateStepStatus(1, "complete");
  updateStepStatus(2, "active");
  setCurrentStep(1);

  const wantsEventbrite = details.sources?.includes('eventbrite') ?? true;
  const wantsMeetup = details.sources?.includes('meetup') ?? false;

  if (wantsEventbrite) setIsLoadingEventbrite(true);
  if (wantsMeetup) setIsLoadingMeetup(true);

  const keywords = `${details.name} ${details.industry} ${details.type}`;

  const [ebrResult, meetupResult] = await Promise.allSettled([
    wantsEventbrite
      ? supabase.functions.invoke('event-discovery', {
          body: { keywords, location: details.location },
        })
      : Promise.resolve({ data: { events: [] }, error: null }),
    wantsMeetup
      ? supabase.functions.invoke('meetup-discovery', {
          body: { keywords, location: details.location },
        })
      : Promise.resolve({ data: { events: [] }, error: null }),
  ]);

  // --- Eventbrite result ---
  // Use inline narrowing (not a pre-evaluated boolean) so TypeScript narrows
  // ebrResult to PromiseFulfilledResult inside the if-block.
  if (ebrResult.status === 'fulfilled' && !ebrResult.value.error) {
    const events: DiscoveredEvent[] = (ebrResult.value.data?.events ?? []).map((e: any) => ({
      id: e.id,
      name: e.name,
      date: e.date,
      location: e.location,
      url: e.url,
      source: e.source,
      sponsorCount: e.sponsorCount,
    }));
    setEventbriteEvents(events);
    setSelectedEventIds((prev) => [...prev, ...events.map((e) => e.id)]);
  } else if (wantsEventbrite) {
    // Fallback to sample data for Eventbrite (existing behaviour)
    const sample = getSampleEvents();
    setEventbriteEvents(sample);
    setSelectedEventIds((prev) => [...prev, ...sample.map((e) => e.id)]);
    toast.error(
      wantsMeetup
        ? 'Eventbrite search failed — showing Meetup results only'
        : 'Failed to discover events. Using demo data.'
    );
  }

  // --- Meetup result ---
  // Same pattern: inline narrowing for TypeScript to recognise .value
  if (meetupResult.status === 'fulfilled' && wantsMeetup) {
    const events: DiscoveredEvent[] = (meetupResult.value.data?.events ?? []).map((e: any) => ({
      id: e.id,
      name: e.name,
      date: e.date,
      location: e.location,
      url: e.url,
      source: 'meetup' as const,
      sponsorCount: e.sponsorCount,
    }));
    setMeetupEvents(events);
    setSelectedEventIds((prev) => [...prev, ...events.map((e) => e.id)]);
  } else if (wantsMeetup) {
    toast.error('Could not reach Meetup — showing Eventbrite results only');
  }

  setIsLoadingEventbrite(false);
  setIsLoadingMeetup(false);
  updateStepStatus(2, "complete");
  toast.success('Discovery complete');
}, [updateStepStatus]);
```

- [ ] **Step 3: Update `handleProceedToSponsors` — replace `discoveredEvents` reference**

Find inside `handleProceedToSponsors` (approx line 98):
```ts
const selectedEvents = discoveredEvents.filter((e) =>
  selectedEventIds.includes(e.id)
);
```
Replace with:
```ts
const selectedEvents = [...eventbriteEvents, ...meetupEvents].filter((e) =>
  selectedEventIds.includes(e.id)
);
```

Also update the `useCallback` dependencies array — replace `discoveredEvents` with `eventbriteEvents, meetupEvents`.

- [ ] **Step 4: Update `handleExport` — replace `discoveredEvents` reference**

Find inside `handleExport` (approx line 213):
```ts
events: discoveredEvents.filter(e => selectedEventIds.includes(e.id)),
```
Replace with:
```ts
events: [...eventbriteEvents, ...meetupEvents].filter(e => selectedEventIds.includes(e.id)),
```

Also update the `useCallback` dependencies array — replace `discoveredEvents` with `eventbriteEvents, meetupEvents`.

- [ ] **Step 5: Update `resetWorkflow` — replace all old state resets**

Find in `resetWorkflow` (approx lines 254–259):
```ts
setDiscoveredEvents([]);
// ...
setDataSource("sample");
setIsLoading(false);
```
Replace all three with:
```ts
setEventbriteEvents([]);
setMeetupEvents([]);
setIsLoadingEventbrite(false);
setIsLoadingMeetup(false);
setIsLoading(false);
```

- [ ] **Step 6: Update the hook return value**

In the returned object (approx line 264), replace:
```ts
discoveredEvents,
dataSource,
isLoading,
```
With:
```ts
eventbriteEvents,
meetupEvents,
isLoadingEventbrite,
isLoadingMeetup,
isLoading,
eventDetails,
```

Note: `eventDetails` is already set in state but check whether it's in the current return object — if not, add it (it's needed by `Index.tsx` in Task 6 to derive `showEventbrite`/`showMeetup`).

- [ ] **Step 7: Verify compile — no errors in this file**

Run: `npx tsc --noEmit 2>&1 | grep useSponsorWorkflow`
Expected: no output. Errors in `Index.tsx` are still expected (fixed in Task 6).

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useSponsorWorkflow.ts
git commit -m "feat(workflow): parallel Eventbrite+Meetup discovery with split loading state"
```

---

## Task 5: Refactor `EventDiscoveryResults` with Two Sections

**Files:**
- Modify: `src/components/EventDiscoveryResults.tsx`

- [ ] **Step 1: Update props interface**

Replace the existing `EventDiscoveryResultsProps` interface with:
```ts
interface EventDiscoveryResultsProps {
  eventbriteEvents: DiscoveredEvent[];
  meetupEvents: DiscoveredEvent[];
  selectedEvents: string[];
  onToggleEvent: (eventId: string) => void;
  isLoadingEventbrite: boolean;
  isLoadingMeetup: boolean;
  showEventbrite: boolean;
  showMeetup: boolean;
}
```

- [ ] **Step 2: Add `meetup` to `sourceLabels`**

Add to the `sourceLabels` object:
```ts
meetup: { label: "Meetup", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
```

- [ ] **Step 3: Extract `EventSection` helper**

Before the `EventDiscoveryResults` function, add this helper component that wraps the existing card JSX to avoid duplication:
```tsx
function EventSection({
  title,
  events,
  selectedEvents,
  onToggleEvent,
  isLoading,
  emptyText,
  sourceKey,
}: {
  title: string;
  events: DiscoveredEvent[];
  selectedEvents: string[];
  onToggleEvent: (id: string) => void;
  isLoading: boolean;
  emptyText: string;
  sourceKey: keyof typeof sourceLabels;
}) {
  const sourceInfo = sourceLabels[sourceKey] ?? sourceLabels.sample;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <Badge variant="outline" className={cn("border", sourceInfo.color)}>
          {sourceInfo.label}
        </Badge>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">{emptyText}</p>
      ) : (
        <div className="grid gap-3">
          {events.map((event, index) => {
            const isSelected = selectedEvents.includes(event.id);
            return (
              <div
                key={event.id}
                onClick={() => onToggleEvent(event.id)}
                className={cn(
                  "group relative cursor-pointer rounded-lg border p-4 transition-all duration-200 animate-slide-in",
                  isSelected
                    ? "border-primary bg-primary/5 shadow-glow"
                    : "border-border bg-card hover:border-primary/50 hover:bg-secondary/30"
                )}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-foreground group-hover:text-primary transition-colors">
                        {event.name}
                      </h4>
                      {event.url && (
                        <a
                          href={event.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-muted-foreground hover:text-primary"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {event.date}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {event.location}
                      </span>
                      {event.sponsorCount !== undefined && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {event.sponsorCount} sponsors
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border"
                    )}
                  >
                    {isSelected && (
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rewrite the main `EventDiscoveryResults` component**

Replace the entire `EventDiscoveryResults` function with:
```tsx
export function EventDiscoveryResults({
  eventbriteEvents,
  meetupEvents,
  selectedEvents,
  onToggleEvent,
  isLoadingEventbrite,
  isLoadingMeetup,
  showEventbrite,
  showMeetup,
}: EventDiscoveryResultsProps) {
  const totalCount = eventbriteEvents.length + meetupEvents.length;

  return (
    <div className="space-y-8 animate-fade-in">
      <p className="text-sm text-muted-foreground">
        {totalCount} similar events found
      </p>
      {showEventbrite && (
        <EventSection
          title="Eventbrite Events"
          events={eventbriteEvents}
          selectedEvents={selectedEvents}
          onToggleEvent={onToggleEvent}
          isLoading={isLoadingEventbrite}
          emptyText="No Eventbrite events found."
          sourceKey="eventbrite"
        />
      )}
      {showMeetup && (
        <EventSection
          title="Meetup Events"
          events={meetupEvents}
          selectedEvents={selectedEvents}
          onToggleEvent={onToggleEvent}
          isLoading={isLoadingMeetup}
          emptyText="No sponsored Meetup events found."
          sourceKey="meetup"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify compile — no errors in this file**

Run: `npx tsc --noEmit 2>&1 | grep EventDiscoveryResults`
Expected: no output. Errors in `Index.tsx` still expected (fixed in Task 6).

- [ ] **Step 6: Commit**

```bash
git add src/components/EventDiscoveryResults.tsx
git commit -m "feat(results): two-section layout with independent loading states per source"
```

---

## Task 6: Wire Up `Index.tsx`

**Files:**
- Modify: `src/pages/Index.tsx`

- [ ] **Step 1: Update hook destructuring**

Replace:
```ts
discoveredEvents,
dataSource,
isLoading,
```
With:
```ts
eventbriteEvents,
meetupEvents,
isLoadingEventbrite,
isLoadingMeetup,
isLoading,
eventDetails,
```

- [ ] **Step 2: Update `EventInputForm` `isLoading` prop**

```tsx
// Before:
<EventInputForm onSubmit={handleEventSubmit} isLoading={isLoading} />
// After:
<EventInputForm onSubmit={handleEventSubmit} isLoading={isLoadingEventbrite || isLoadingMeetup} />
```

- [ ] **Step 3: Remove `DataSourceIndicator` from step 2**

Delete this block entirely from the step 2 section (source badges are now rendered inside each section of `EventDiscoveryResults`):
```tsx
<DataSourceIndicator
  source={dataSource}
  fallbackReason={
    dataSource === "sample"
      ? "Using demo data. Connect API keys for live data."
      : undefined
  }
/>
```
Also remove the `DataSourceIndicator` import at the top of the file if it's no longer used elsewhere.

- [ ] **Step 4: Replace `EventDiscoveryResults` props**

Replace:
```tsx
<EventDiscoveryResults
  events={discoveredEvents}
  selectedEvents={selectedEventIds}
  onToggleEvent={handleToggleEvent}
  dataSource={dataSource}
/>
```
With:
```tsx
<EventDiscoveryResults
  eventbriteEvents={eventbriteEvents}
  meetupEvents={meetupEvents}
  selectedEvents={selectedEventIds}
  onToggleEvent={handleToggleEvent}
  isLoadingEventbrite={isLoadingEventbrite}
  isLoadingMeetup={isLoadingMeetup}
  showEventbrite={eventDetails?.sources?.includes('eventbrite') ?? true}
  showMeetup={eventDetails?.sources?.includes('meetup') ?? false}
/>
```

- [ ] **Step 5: Update "Extract Sponsors" button disabled state**

```tsx
// Before:
disabled={selectedEventIds.length === 0 || isLoading}
// After:
disabled={selectedEventIds.length === 0 || isLoadingEventbrite || isLoadingMeetup || isLoading}
```

- [ ] **Step 6: Full TypeScript compile check — must be zero errors**

Run: `npx tsc --noEmit`
Expected: **zero errors**. Fix any remaining errors before committing.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "feat(index): wire up parallel source results and remove DataSourceIndicator from step 2"
```

---

## Task 7: Verification

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: no build errors.

- [ ] **Step 2: Default state — both sources checked**

1. Open the form. Confirm Eventbrite and Meetup checkboxes are both checked.
2. Submit with a test event name. Confirm both sections appear in step 2 with independent spinners.
3. Confirm "Extract Sponsors" button stays disabled while either source is loading.

- [ ] **Step 3: Eventbrite only**

1. Uncheck Meetup. Submit.
2. Confirm only the Eventbrite section renders.
3. Confirm Meetup checkbox becomes non-interactive (disabled) when it's the only checked one — test: try unchecking Eventbrite when only Eventbrite is checked; it should not uncheck.

- [ ] **Step 4: Meetup only**

1. Check Meetup, uncheck Eventbrite. Submit.
2. Confirm only the Meetup section renders.
3. If no sponsored Meetup events are found: confirm empty state reads "No sponsored Meetup events found."

- [ ] **Step 5: Proceed through the full pipeline**

1. Select both sources. Submit. Select events from both sections.
2. Click "Extract Sponsors". Confirm sponsor pipeline completes normally.
3. Continue to email generation and export — confirm no errors.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: Meetup discovery integration complete"
```

---

## Quick Reference

| What | Where |
|------|-------|
| `EventDetails` type | `src/types/sponsor.ts:1` |
| `DiscoveredEvent.source` | `src/types/sponsor.ts:14` |
| Hook state declarations | `src/hooks/useSponsorWorkflow.ts:25–32` |
| `handleEventSubmit` | `src/hooks/useSponsorWorkflow.ts:40` |
| `handleProceedToSponsors` | `src/hooks/useSponsorWorkflow.ts:93` |
| `handleExport` | `src/hooks/useSponsorWorkflow.ts:205` |
| `resetWorkflow` | `src/hooks/useSponsorWorkflow.ts:250` |
| Hook return value | `src/hooks/useSponsorWorkflow.ts:264` |
| Form component | `src/components/EventInputForm.tsx:44` |
| Results component | `src/components/EventDiscoveryResults.tsx:19` |
| Page callsite | `src/pages/Index.tsx:98` |
| Meetup edge function | `supabase/functions/meetup-discovery/index.ts` |
| Reference edge function | `supabase/functions/event-discovery/index.ts` |
