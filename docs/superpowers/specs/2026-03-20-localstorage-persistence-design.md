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
- On change: write updated blob to `localStorage` via a single `useEffect` watching all persisted slices
- On reset: remove the item from `localStorage`

Storage key: `sponsorscout_workflow`

---

## What Gets Persisted

Stored as a single JSON object under `sponsorscout_workflow`:

| Field | Type | Notes |
|---|---|---|
| `eventDetails` | `EventDetails \| null` | The submitted event form values; `null` if not yet submitted |
| `eventbriteEvents` | `DiscoveredEvent[]` | Eventbrite discovery results |
| `meetupEvents` | `DiscoveredEvent[]` | Meetup discovery results |
| `selectedEventIds` | `string[]` | User's selected event IDs |
| `sponsors` | `EnrichedSponsor[]` | Enriched sponsor list |
| `currentStep` | `number` | 0-indexed view index; used to restore workflow position |

**Not persisted:** `emails`, loading flags (`isLoading*`), `steps` status array. These are transient or derivable. `emails` are not persisted because they require an explicit user action (navigating to step 4 and clicking Generate) to produce — they are not automatically derivable from the sponsor list.

---

## Type

A local `PersistedWorkflow` interface defined at the top of the hook (not exported):

```ts
interface PersistedWorkflow {
  eventDetails: EventDetails | null;
  eventbriteEvents: DiscoveredEvent[];
  meetupEvents: DiscoveredEvent[];
  selectedEventIds: string[];
  sponsors: EnrichedSponsor[];
  currentStep: number;
}

const STORAGE_KEY = 'sponsorscout_workflow';

const STORAGE_DEFAULTS: PersistedWorkflow = {
  eventDetails: null,
  eventbriteEvents: [],
  meetupEvents: [],
  selectedEventIds: [],
  sponsors: [],
  currentStep: 0,
};
```

---

## Helpers

Two private helpers used by the hook — not exported:

```ts
function readFromStorage(): PersistedWorkflow {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return STORAGE_DEFAULTS;
    const parsed = JSON.parse(raw);
    // Validate shape: must be a plain object
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return STORAGE_DEFAULTS;
    }
    // Per-field duck-type validation: use stored value if correct type, default otherwise.
    // Note: eventDetails may be stored as null (not-yet-submitted state), which is a valid
    // value. The check below falls through to STORAGE_DEFAULTS.eventDetails (also null)
    // in that case, so the outcome is correct either way.
    return {
      eventDetails: typeof parsed.eventDetails === 'object' && parsed.eventDetails !== null
        ? parsed.eventDetails as EventDetails
        : STORAGE_DEFAULTS.eventDetails,
      eventbriteEvents: Array.isArray(parsed.eventbriteEvents)
        ? parsed.eventbriteEvents
        : STORAGE_DEFAULTS.eventbriteEvents,
      meetupEvents: Array.isArray(parsed.meetupEvents)
        ? parsed.meetupEvents
        : STORAGE_DEFAULTS.meetupEvents,
      selectedEventIds: Array.isArray(parsed.selectedEventIds)
        ? parsed.selectedEventIds
        : STORAGE_DEFAULTS.selectedEventIds,
      sponsors: Array.isArray(parsed.sponsors)
        ? parsed.sponsors
        : STORAGE_DEFAULTS.sponsors,
      currentStep: typeof parsed.currentStep === 'number' && Number.isFinite(parsed.currentStep)
        ? Math.max(0, Math.min(4, Math.round(parsed.currentStep)))
        : STORAGE_DEFAULTS.currentStep,
    };
  } catch {
    return STORAGE_DEFAULTS;
  }
}

function writeToStorage(data: PersistedWorkflow): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Quota exceeded or storage disabled — fail silently
  }
}
```

---

## Read on Mount

On first render, the hook calls `readFromStorage()` outside of any state initializer, then passes the values as initial state. A helper function `deriveSteps` derives the `steps` array from `currentStep` so the workflow stepper renders the correct completed/active/pending state immediately without a second render:

```ts
function deriveSteps(currentStep: number): WorkflowStep[] {
  return initialSteps.map((s) => ({
    ...s,
    status: s.id < currentStep + 1
      ? 'complete'
      : s.id === currentStep + 1
        ? 'active'
        : 'pending',
  }));
}
```

State initialization at mount:

```ts
const stored = readFromStorage();

const [currentStep, setCurrentStep] = useState<number>(stored.currentStep);
const [steps, setSteps] = useState<WorkflowStep[]>(() => deriveSteps(stored.currentStep));
const [eventDetails, setEventDetails] = useState<EventDetails | null>(stored.eventDetails);
const [eventbriteEvents, setEventbriteEvents] = useState<DiscoveredEvent[]>(stored.eventbriteEvents);
const [meetupEvents, setMeetupEvents] = useState<DiscoveredEvent[]>(stored.meetupEvents);
const [selectedEventIds, setSelectedEventIds] = useState<string[]>(stored.selectedEventIds);
const [sponsors, setSponsors] = useState<EnrichedSponsor[]>(stored.sponsors);
```

`steps` uses a lazy initializer (`() => deriveSteps(...)`) so `deriveSteps` runs only once at mount, not on every render.

**Derivation rule** — `steps` uses 1-indexed `id` values (1–5), `currentStep` is 0-indexed (0–4):

- Step with `id <= currentStep`: `complete`
- Step with `id === currentStep + 1`: `active`
- Step with `id > currentStep + 1`: `pending`

Examples:
- `currentStep = 0` → step 1 `active`, steps 2–5 `pending` (matches existing default)
- `currentStep = 2` → steps 1–2 `complete`, step 3 `active`, steps 4–5 `pending`
- `currentStep = 4` → steps 1–4 `complete`, step 5 `active`

After mount, `steps` continues to be updated by the existing `updateStepStatus` calls during live workflow execution — the derivation only applies at initial mount.

**`'error'` status:** `WorkflowStep.status` includes `'error'` but `deriveSteps` never produces it — error states are transient and not meaningful to restore. If a user closed the browser mid-step during an error, on restore that step will show as `active` (as if the step was in progress). This is acceptable.

**Restored state is fully live:** All existing action handlers (`handleEventSubmit`, `handleProceedToSponsors`, etc.) reset their relevant state slices before running. Restored state is not read-only — it will be overwritten by any new user action exactly as if the user had produced it in the current session. No changes to action handlers are needed.

**`readFromStorage` is called at the top level of the hook body**, so it runs on every render. React's `useState` only uses the initial value on the first call, so values from subsequent renders are discarded. This is a minor overhead (one `localStorage.getItem` + `JSON.parse` per render) and is acceptable given the small payload size.

---

## Write on Change

A **single** `useEffect` watching all six persisted values writes the full blob on every change. Using one effect (rather than six) avoids read-modify-write races that would occur if multiple slices changed in the same render cycle and each effect tried to merge its slice into a shared blob:

```ts
useEffect(() => {
  writeToStorage({ eventDetails, eventbriteEvents, meetupEvents, selectedEventIds, sponsors, currentStep });
}, [eventDetails, eventbriteEvents, meetupEvents, selectedEventIds, sponsors, currentStep]);
```

No debounce — payloads are small (a few KB at most for realistic sponsor list sizes).

**React 18 batching:** This implementation assumes React 18, where state updates inside callbacks are automatically batched. This means a `resetWorkflow` call that sets multiple state slices will cause the `useEffect` to fire only once, with the final settled values — not once per slice. This is the intended behaviour.

**Storage quota:** `localStorage` is capped at ~5 MB per origin. Silent failure on quota exceeded is acceptable for v1 — the app continues working, just without persisting that write. No user-visible warning is shown.

---

## Reset

`resetWorkflow` already resets all state to empty defaults. One line added before the state resets:

```ts
localStorage.removeItem(STORAGE_KEY);
```

User starts a fresh workflow with no restored state.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| No stored item | `readFromStorage` returns `STORAGE_DEFAULTS`; unchanged behaviour |
| Malformed JSON | `JSON.parse` throws; caught; returns `STORAGE_DEFAULTS` |
| Wrong top-level type (not a plain object) | Returns `STORAGE_DEFAULTS` |
| Field present but wrong type (e.g. `currentStep` is `"2"`) | That field falls back to its default; other valid fields are used |
| `localStorage` disabled (private browsing) | `getItem` throws; caught; returns `STORAGE_DEFAULTS` on read; write fails silently |
| Storage quota exceeded on write | `setItem` throws; caught; fails silently; app continues |

---

## What Does Not Change

- All edge function calls — unchanged
- All component props and interfaces — unchanged
- `useSponsorWorkflow` return value — unchanged (no new fields added)
- `resetWorkflow` — all existing state resets remain unchanged; only `localStorage.removeItem(STORAGE_KEY)` is added before them
- `emails`, `exportingFormat`, `completedExports` — not persisted; transient; existing reset logic for these is unchanged
- All action handlers (`handleEventSubmit`, `handleProceedToSponsors`, etc.) — unchanged; they reset their relevant slices before running as they do today

---

## Testing

- **Mount with valid stored data:** `currentStep = 2`, `sponsors` array populated → state hydrates; steps 1–2 are `complete`, step 3 is `active`, steps 4–5 are `pending`; sponsors render without re-fetching
- **Mount with no stored data:** `readFromStorage` returns defaults → step 1 active, all arrays empty (unchanged existing behaviour)
- **Mount with malformed JSON:** `readFromStorage` returns defaults → no crash, step 1 active
- **Mount with correct shape but wrong field type** (e.g. `currentStep: "2"`): that field defaults to `0`; other valid fields are restored
- **After form submit:** `eventDetails` written to storage
- **After discovery:** `eventbriteEvents` and `meetupEvents` written to storage
- **After toggling event:** `selectedEventIds` updated in storage
- **After sponsor identification:** `sponsors` written to storage
- **After navigation to step 2** (`currentStep` changes to `1`): storage reflects `currentStep: 1`
- **After reset:** storage item removed; all state resets to defaults; step 1 active
- **Storage quota error on write:** error caught silently; app continues; no crash
- **Multiple state changes in one render** (e.g. reset clears 5 slices): single effect fires once after all state updates settle; one write to storage with the final values
