# Meetup Event Discovery — Design Spec

**Date:** 2026-03-19
**Status:** Approved (v2 — reviewer issues resolved)

---

## Overview

Add Meetup.com as an optional event discovery source alongside Eventbrite. Users select which sources to query via checkboxes on the existing event input form. Results are displayed in two separate sections on the discovery results page. Only Meetup events with explicit sponsor mentions are surfaced. The downstream sponsor pipeline (identification, enrichment, email generation, export) is unchanged.

---

## Architecture

### New: `supabase/functions/meetup-discovery/`

A Deno edge function mirroring the structure of `event-discovery`.

- Uses the Apify `maxcopell/meetup-scraper` actor (or equivalent available Meetup actor on Apify) to find events matching the user's keywords and location
- Requires `APIFY_API_TOKEN` environment variable (same token already used by `event-discovery`)
- Filters results to only events where sponsor information is **explicitly present**: the event page contains a "Sponsors" section, a "Sponsored by" label, or company names listed under a named sponsorship tier
- Returns `DiscoveredEvent[]` with `source: "meetup"` on each item
- Falls back to an empty array `[]` on failure (not sample data — unlike Eventbrite, Meetup sample data would not be meaningful without domain context)

### Modified: `src/types/sponsor.ts`

`DiscoveredEvent.source` union type gains `"meetup"`:

```ts
source: 'eventbrite' | 'apify' | 'sample' | 'meetup';
```

`EventDetails` gains one new field:

```ts
sources: ('eventbrite' | 'meetup')[];  // default value set in component, not type
```

### Modified: `src/components/EventInputForm.tsx`

- Adds two checkboxes below existing fields: **Eventbrite** (checked by default) and **Meetup** (checked by default)
- Submit button is disabled when both are unchecked; hint text: "Select at least one source"
- On submit, passes the full `EventDetails` object including `sources: ['eventbrite'] | ['meetup'] | ['eventbrite', 'meetup']`
- Default state initializer: `useState<EventDetails['sources']>(['eventbrite', 'meetup'])`

### Modified: `src/hooks/useSponsorWorkflow.ts`

**State changes:**
- Replace `discoveredEvents: DiscoveredEvent[]` with two separate arrays:
  - `eventbriteEvents: DiscoveredEvent[]`
  - `meetupEvents: DiscoveredEvent[]`
- Replace single `isLoading: boolean` with two booleans:
  - `isLoadingEventbrite: boolean`
  - `isLoadingMeetup: boolean`
- Remove `dataSource` state entirely — source is now derivable per-event from `event.source`
- `selectedEventIds: string[]` remains a single flat array; IDs from Eventbrite and Meetup are distinct (different APIs, different ID namespaces)

**`handleEventSubmit` changes:**
- Accepts updated `EventDetails` (now includes `sources`)
- Fires `event-discovery` and/or `meetup-discovery` in parallel using `Promise.allSettled` based on `details.sources`
- Each call sets its own loading flag independently
- On partial failure: failed source populates its array with `[]`; toast identifies which source failed:
  - `"Eventbrite search failed — showing Meetup results only"`
  - `"Could not reach Meetup — showing Eventbrite results only"`
- `handleProceedToSponsors` filters from both arrays combined:
  ```ts
  const allEvents = [...eventbriteEvents, ...meetupEvents];
  const selectedEvents = allEvents.filter(e => selectedEventIds.includes(e.id));
  ```
- `handleExport` references `[...eventbriteEvents, ...meetupEvents]` in place of `discoveredEvents`
- `resetWorkflow` resets both event arrays and both loading flags

**`handleEventSubmit` parallel fetch pattern:**
```ts
const [ebrResult, meetupResult] = await Promise.allSettled([
  details.sources.includes('eventbrite')
    ? supabase.functions.invoke('event-discovery', { body: { ... } })
    : Promise.resolve({ data: null }),
  details.sources.includes('meetup')
    ? supabase.functions.invoke('meetup-discovery', { body: { ... } })
    : Promise.resolve({ data: null }),
]);
// handle each result independently
```

### Modified: `src/components/EventDiscoveryResults.tsx`

**New props interface:**
```ts
interface EventDiscoveryResultsProps {
  eventbriteEvents: DiscoveredEvent[];
  meetupEvents: DiscoveredEvent[];
  selectedEvents: string[];
  onToggleEvent: (eventId: string) => void;
  isLoadingEventbrite: boolean;
  isLoadingMeetup: boolean;
  showEventbrite: boolean;   // true if eventbrite was in selected sources
  showMeetup: boolean;       // true if meetup was in selected sources
}
```

**Layout:**
- Sections stack vertically, Eventbrite first, Meetup second
- A section is only rendered if its corresponding `show*` prop is `true`
- Each section has its own header ("Eventbrite Events" / "Meetup Events"), loading spinner, error state, and empty state
- Meetup empty state message: "No sponsored Meetup events found"
- Source badge per section derived from `event.source` on the items (replaces the old top-level `dataSource` prop)
- The existing `sourceLabels` map gains a `meetup` entry:
  ```ts
  meetup: { label: "Meetup", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" }
  ```

---

## Data Flow

```
EventInputForm
  sources: ['eventbrite', 'meetup']  (or subset)
      ↓
useSponsorWorkflow.handleEventSubmit
  → Promise.allSettled([event-discovery, meetup-discovery])
  → sets eventbriteEvents, meetupEvents
  → sets isLoadingEventbrite, isLoadingMeetup independently
      ↓
EventDiscoveryResults
  → Eventbrite section (if showEventbrite)
  → Meetup section (if showMeetup)
  → user selects from either
      ↓
handleProceedToSponsors
  → filters [...eventbriteEvents, ...meetupEvents] by selectedEventIds
  → existing sponsor pipeline (unchanged)
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Both sources unchecked | Submit disabled; hint: "Select at least one source" |
| Eventbrite fails, Meetup succeeds | `eventbriteEvents = []`; toast: "Eventbrite search failed — showing Meetup results only" |
| Meetup fails, Eventbrite succeeds | `meetupEvents = []`; toast: "Could not reach Meetup — showing Eventbrite results only" |
| Both fail | Eventbrite falls back to sample data (existing hook behavior, line 76); Meetup remains `[]` |
| Meetup returns events, none have sponsors | `meetupEvents = []`; Meetup section shows empty state |
| Apify call times out | `meetup-discovery` returns `[]` with HTTP 200; hook treats as empty result |

**Fallback responsibility:** Eventbrite sample data fallback lives in the hook (`useSponsorWorkflow`), not in the edge function — this is unchanged. The `meetup-discovery` function itself always returns `[]` on error; no sample data fallback is added at either layer.

---

## Testing

### `meetup-discovery` edge function
- Parses Apify response: events with explicit sponsor mentions are included; events without are filtered out
- Handles malformed/empty Apify responses — returns `[]`
- Handles Apify timeout — returns `[]`
- Integration test against a known sponsored Meetup event (skippable in CI via `SKIP_APIFY_INTEGRATION=true`)

### `EventInputForm`
- Submit disabled when both checkboxes unchecked; re-enabled when either is checked
- `sources` array in submitted `EventDetails` matches checked state

### `useSponsorWorkflow`
- Both functions invoked in parallel when `sources = ['eventbrite', 'meetup']`
- Only `event-discovery` invoked when `sources = ['eventbrite']`
- Only `meetup-discovery` invoked when `sources = ['meetup']`
- Eventbrite failure: `eventbriteEvents = []`, `meetupEvents` populated, toast shown
- Meetup failure: `meetupEvents = []`, `eventbriteEvents` populated, toast shown
- `handleProceedToSponsors` selects from combined `[...eventbriteEvents, ...meetupEvents]`

### `EventDiscoveryResults`
- Eventbrite section renders when `showEventbrite = true`
- Meetup section renders when `showMeetup = true`
- Neither section renders when its `show*` prop is `false`
- Meetup empty state renders when `meetupEvents = []` and `showMeetup = true`
- Loading spinner shows independently per section
- Selecting events from either section populates `selectedEventIds` correctly

---

## What Does Not Change

- `sponsor-identification` — source-agnostic, no changes needed
- `contact-enrichment` — source-agnostic, no changes needed
- `email-generation` — source-agnostic, no changes needed
- `export-data` — source-agnostic, no changes needed
- Eventbrite fallback to sample data (in `useSponsorWorkflow`, line 76) — unchanged
