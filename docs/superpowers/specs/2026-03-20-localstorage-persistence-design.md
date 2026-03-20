# localStorage Workflow Persistence — Design Spec

**Date:** 2026-03-20
**Status:** Approved

---

## Overview

Persist the active SponsorScout workflow to `localStorage` so users can close or refresh the browser and return to exactly where they left off. One active workflow at a time — always the latest run. No auth, no backend changes, no new dependencies.

---

## Architecture

Persistence lives entirely inside `src/hooks/useSponsorWorkflow.ts`. No new files or components.

- On mount: read one JSON blob from `localStorage`, hydrate state
- On change: write updated blob to `localStorage` via `useEffect` per slice
- On reset: remove the item from `localStorage`

Storage key: `sponsorscout_workflow`

---

## What Gets Persisted

Stored as a single JSON object under `sponsorscout_workflow`:

| Field | Type | Reason |
|---|---|---|
| `formData` | `EventDetails` | Avoid retyping the event form |
| `eventbriteEvents` | `DiscoveredEvent[]` | Slow to regenerate |
| `meetupEvents` | `DiscoveredEvent[]` | Slow to regenerate |
| `selectedEventIds` | `string[]` | User's selection |
| `sponsors` | `EnrichedSponsor[]` | Most expensive to regenerate |
| `currentStep` | `number` | Restore to the correct workflow step |

**Not persisted:** `emailDrafts`, loading flags (`isLoading*`), `workflowSteps` status array. These are transient or derivable.

---

## Read on Mount

On first render, `useSponsorWorkflow` calls `localStorage.getItem('sponsorscout_workflow')` and parses the JSON.

- If the item is missing: use existing empty defaults (no change to current behaviour)
- If the item is malformed (bad JSON, unexpected shape): catch the error silently, fall back to empty defaults
- If valid: hydrate `formData`, `eventbriteEvents`, `meetupEvents`, `selectedEventIds`, `sponsors`, and `currentStep` from the stored values

`workflowSteps` status is derived from the restored `currentStep`:
- Steps with index < `currentStep`: `complete`
- Step at index `currentStep`: `active`
- Steps with index > `currentStep`: `pending`

---

## Write on Change

Six `useEffect` hooks — one per persisted field — each triggered when that slice changes. Each effect merges its slice into the current stored blob and writes back:

```ts
const saveToStorage = (patch: Partial<PersistedWorkflow>) => {
  try {
    const current = readFromStorage();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // Quota exceeded or private browsing — fail silently
  }
};

useEffect(() => { saveToStorage({ formData }); }, [formData]);
useEffect(() => { saveToStorage({ eventbriteEvents }); }, [eventbriteEvents]);
useEffect(() => { saveToStorage({ meetupEvents }); }, [meetupEvents]);
useEffect(() => { saveToStorage({ selectedEventIds }); }, [selectedEventIds]);
useEffect(() => { saveToStorage({ sponsors }); }, [sponsors]);
useEffect(() => { saveToStorage({ currentStep }); }, [currentStep]);
```

No debounce — payloads are small (kilobytes at most).

Storage quota errors are caught and silently ignored — the app continues working, just without persistence for that write.

---

## Reset

`resetWorkflow` already resets all state to empty defaults. One line added:

```ts
localStorage.removeItem(STORAGE_KEY);
```

User starts a fresh workflow with no restored state.

---

## Type

A local `PersistedWorkflow` interface defined at the top of the hook:

```ts
interface PersistedWorkflow {
  formData: EventDetails;
  eventbriteEvents: DiscoveredEvent[];
  meetupEvents: DiscoveredEvent[];
  selectedEventIds: string[];
  sponsors: EnrichedSponsor[];
  currentStep: number;
}
```

Used only within the hook — not exported.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| No stored item | Fall back to empty defaults (unchanged behaviour) |
| Malformed JSON | Catch, fall back to empty defaults |
| Unexpected shape (missing fields) | Use stored fields that are present, defaults for the rest |
| localStorage quota exceeded on write | Catch, fail silently — app continues without persisting that write |
| Private browsing / storage disabled | Same as quota exceeded — silent failure |

---

## What Does Not Change

- All edge function calls — unchanged
- All component props and interfaces — unchanged
- `useSponsorWorkflow` return value — unchanged
- `resetWorkflow` behaviour — same reset, plus `localStorage.removeItem`
- `emailDrafts` — not persisted; regenerated on demand from the sponsor list

---

## Testing

- On mount with valid stored data: state hydrates correctly, user sees the right step
- On mount with no stored data: empty defaults, step 1 active
- On mount with malformed JSON: empty defaults, no crash
- After form submit: `formData` written to storage
- After discovery: `eventbriteEvents` and `meetupEvents` written to storage
- After toggling event: `selectedEventIds` updated in storage
- After sponsor identification: `sponsors` written to storage
- After reset: storage item removed, state is empty defaults
- Storage quota error on write: caught silently, app continues
