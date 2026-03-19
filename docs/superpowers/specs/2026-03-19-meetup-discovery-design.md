# Meetup Event Discovery — Design Spec

**Date:** 2026-03-19
**Status:** Approved

---

## Overview

Add Meetup.com as an optional event discovery source alongside Eventbrite. Users select which sources to query on the event input form. Results are displayed in separate sections. Only Meetup events with explicit sponsor mentions are surfaced. The downstream sponsor pipeline (identification, enrichment, email generation, export) is unchanged.

---

## Architecture

### New: `supabase/functions/meetup-discovery/`

A Deno edge function mirroring the structure of the existing `event-discovery` function.

- Uses Apify's Meetup scraper actor to find events matching the user's input (name, type, industry, location)
- Filters results to only events where sponsor information is explicitly present on the event page
- Returns `DiscoveredEvent[]` with `source: "meetup"`
- Falls back to an empty array (not sample data) on failure

### Modified: `EventInputForm.tsx`

- Adds two checkboxes: **Eventbrite** and **Meetup** (both checked by default)
- Submit button is disabled if both sources are unchecked, with hint: "Select at least one source"
- Selected sources are passed as `sources: ("eventbrite" | "meetup")[]` in the form output

### Modified: `useSponsorWorkflow.ts`

- Replaces single `discoveredEvents` state with two arrays: `eventbriteEvents` and `meetupEvents`
- Fires `event-discovery` and `meetup-discovery` in parallel based on selected sources
- Partial failure is handled gracefully: a failed source produces an empty array + toast notification; the successful source still populates

### Modified: `EventDiscoveryResults.tsx`

- Renders two distinct sections: **Eventbrite Events** and **Meetup Events**
- Each section has its own loading, error, and empty state
- Meetup empty state message: "No sponsored Meetup events found"
- Events selected from either section flow unchanged into the existing sponsor pipeline

---

## Data & Types

### `EventDetails` (modified)

```ts
sources: ("eventbrite" | "meetup")[]  // new field, defaults to both
```

### `DiscoveredEvent` (unchanged)

The existing `source` field already accommodates `"meetup"` as a value. No structural changes needed.

### `meetup-discovery` function

- **Input:** `EventDetails` (same shape as `event-discovery`)
- **Output:** `DiscoveredEvent[]` — only events with explicit sponsor mentions
- **Source value:** `"meetup"` on each result

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Both sources unchecked | Submit disabled, hint shown |
| Eventbrite fails, Meetup succeeds | Show Meetup results; toast: "Eventbrite search failed — showing Meetup results only" |
| Meetup fails, Eventbrite succeeds | Show Eventbrite results; toast: "Could not reach Meetup — try again" |
| Both fail | Existing fallback behavior (sample data for Eventbrite); empty array for Meetup |
| Meetup returns events but none have sponsors | Empty state: "No sponsored Meetup events found" |
| Apify timeout | Return empty array with error flag; do not hang workflow |

---

## Testing

### `meetup-discovery` edge function
- Parses Apify response correctly: events with sponsors included, events without sponsors filtered out
- Handles malformed/empty Apify responses gracefully
- Integration test against a known Meetup event (skippable in CI via env flag)

### `EventInputForm`
- Submit disabled when both checkboxes unchecked
- Correct `sources` array passed to workflow hook

### `useSponsorWorkflow`
- Both functions called in parallel when both sources selected
- Only one function called when single source selected
- Partial failure leaves successful source results intact

### `EventDiscoveryResults`
- Both sections render when both have results
- Meetup empty state renders when `meetupEvents` is empty
- Selected events from either section feed correctly into next step

---

## What Does Not Change

- `sponsor-identification` — source-agnostic, no changes needed
- `contact-enrichment` — source-agnostic, no changes needed
- `email-generation` — source-agnostic, no changes needed
- `export-data` — source-agnostic, no changes needed
- Existing Eventbrite fallback to sample data — unchanged
