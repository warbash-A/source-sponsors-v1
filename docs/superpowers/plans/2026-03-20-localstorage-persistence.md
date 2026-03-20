# localStorage Workflow Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the active SponsorScout workflow to localStorage so users can refresh or close the browser and return to exactly where they left off.

**Architecture:** All changes are confined to `src/hooks/useSponsorWorkflow.ts`. Three private helpers (`readFromStorage`, `writeToStorage`, `deriveSteps`) and one interface (`PersistedWorkflow`) are added above the hook function. The hook's `useState` initializers are updated to read from storage on first render. A single `useEffect` writes the full blob on any state change. `resetWorkflow` gets one extra line to clear the storage item.

**Tech Stack:** React 18, TypeScript, browser `localStorage` API

---

## File Structure

One file modified, nothing created:

| File | Change |
|---|---|
| `src/hooks/useSponsorWorkflow.ts` | Add types, helpers, update `useState` inits, add `useEffect`, update `resetWorkflow` |

---

### Task 1: Add persistence types and helper functions

**Files:**
- Modify: `src/hooks/useSponsorWorkflow.ts:1-19`

Add the `PersistedWorkflow` interface, constants, and three helper functions immediately after the existing imports and before `initialSteps`. These are pure functions — no React, no side effects.

- [ ] **Step 1: Add the following block after the import block (after line 11, before `const initialSteps`):**

```ts
// ─── localStorage persistence ────────────────────────────────────────────────

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

function readFromStorage(): PersistedWorkflow {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return STORAGE_DEFAULTS;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return STORAGE_DEFAULTS;
    }
    return {
      // eventDetails may legitimately be null (not yet submitted); the check below
      // falls through to STORAGE_DEFAULTS.eventDetails (also null) in that case.
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

// ─────────────────────────────────────────────────────────────────────────────
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSponsorWorkflow.ts
git commit -m "feat(persistence): add localStorage helpers and PersistedWorkflow type"
```

---

### Task 2: Wire read-on-mount into useState initializers

**Files:**
- Modify: `src/hooks/useSponsorWorkflow.ts` — the `useState` block at the top of the hook function (lines 21–35 in the original file; after Task 1 these lines shift down by ~78 — use the named anchor "existing useState block" rather than line numbers)

Replace the hard-coded empty defaults with values read from storage. `readFromStorage()` is called once at the top of the hook body — React's `useState` only uses the initial value on the first call, so subsequent renders discard it (minor overhead, acceptable per spec).

- [ ] **Step 1: Replace the existing useState block (lines 21–35) with:**

```ts
export function useSponsorWorkflow() {
  const stored = readFromStorage();

  const [currentStep, setCurrentStep] = useState<number>(stored.currentStep);
  const [steps, setSteps] = useState<WorkflowStep[]>(() => deriveSteps(stored.currentStep));
  const [eventDetails, setEventDetails] = useState<EventDetails | null>(stored.eventDetails);
  const [eventbriteEvents, setEventbriteEvents] = useState<DiscoveredEvent[]>(stored.eventbriteEvents);
  const [meetupEvents, setMeetupEvents] = useState<DiscoveredEvent[]>(stored.meetupEvents);
  const [isLoadingEventbrite, setIsLoadingEventbrite] = useState(false);
  const [isLoadingMeetup, setIsLoadingMeetup] = useState(false);
  // Keep a separate isLoading for downstream steps (sponsors, emails, export)
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>(stored.selectedEventIds);
  const [sponsors, setSponsors] = useState<EnrichedSponsor[]>(stored.sponsors);
  const [emails, setEmails] = useState<EmailDraft[]>([]);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [completedExports, setCompletedExports] = useState<ExportFormat[]>([]);
  // ... rest of function unchanged
```

Note: `emails`, `exportingFormat`, `completedExports`, and the loading flags keep their hard-coded defaults — they are not persisted.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSponsorWorkflow.ts
git commit -m "feat(persistence): hydrate hook state from localStorage on mount"
```

---

### Task 3: Add write-on-change useEffect

**Files:**
- Modify: `src/hooks/useSponsorWorkflow.ts` — add `useEffect` import and the persistence effect

A single `useEffect` watches all six persisted state slices and writes the full blob on any change. One effect (not six) avoids read-modify-write races when multiple slices change in the same render cycle.

- [ ] **Step 1: Add `useEffect` to the import on line 1:**

Change:
```ts
import { useState, useCallback } from "react";
```
To:
```ts
import { useState, useCallback, useEffect } from "react";
```

- [ ] **Step 2: Add the persistence effect immediately after the `updateStepStatus` callback (after line 41 in the original file — now shifted down by the helpers added in Task 1). Place it before `handleEventSubmit`:**

```ts
  // Persist workflow state to localStorage on every relevant change.
  // Single effect (not one per slice) to avoid read-modify-write races
  // when multiple slices update in the same render cycle (React 18 batching).
  useEffect(() => {
    writeToStorage({ eventDetails, eventbriteEvents, meetupEvents, selectedEventIds, sponsors, currentStep });
  }, [eventDetails, eventbriteEvents, meetupEvents, selectedEventIds, sponsors, currentStep]);
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Verify build succeeds**

Run: `npm run build`
Expected: `✓ built in X.XXs` with no errors

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSponsorWorkflow.ts
git commit -m "feat(persistence): write workflow state to localStorage on change"
```

---

### Task 4: Update resetWorkflow to clear storage

**Files:**
- Modify: `src/hooks/useSponsorWorkflow.ts` — `resetWorkflow` callback

One line added at the top of `resetWorkflow` to remove the storage item before resetting state.

- [ ] **Step 1: Find `resetWorkflow` (currently around line 293) and add `localStorage.removeItem(STORAGE_KEY);` as the first line:**

Change from:
```ts
  const resetWorkflow = useCallback(() => {
    setCurrentStep(0);
    setSteps(initialSteps);
```

To:
```ts
  const resetWorkflow = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setCurrentStep(0);
    setSteps(initialSteps);
```

- [ ] **Step 2: Verify TypeScript compiles with no errors**

Run: `npx tsc --noEmit`
Expected: no output (clean)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSponsorWorkflow.ts
git commit -m "feat(persistence): clear localStorage on workflow reset"
```

---

### Task 5: Verification

**Files:** None modified — browser-only verification

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: server starts, no build errors, URL shown (typically http://localhost:8080)

- [ ] **Step 2: Verify empty state on first load**

Open the app. Open DevTools → Application → Local Storage → `http://localhost:8080`.
Expected: no `sponsorscout_workflow` key yet (or key absent).

- [ ] **Step 3: Verify form data persists**

Fill in the event form (name, type, industry, location). Submit.
Check localStorage: `sponsorscout_workflow` key should exist; `eventDetails` should contain the submitted values; `currentStep` should be `1`.

- [ ] **Step 4: Verify discovery results persist**

Wait for discovery to complete (step 2). Check localStorage.
Expected: `eventbriteEvents` and/or `meetupEvents` arrays populated; `selectedEventIds` populated; `currentStep: 1`.

- [ ] **Step 5: Verify page refresh restores state**

With discovery results showing, hard-refresh the page (`Cmd+Shift+R` / `Ctrl+Shift+R`).
Expected: app loads directly to the discovery results step (step 2 active, step 1 complete), events still showing, selected events still checked.

- [ ] **Step 6: Verify sponsor step persists**

Click "Extract Sponsors". Wait for step 3 to complete.
Hard-refresh the page.
Expected: app loads at step 3 (sponsors active or complete), sponsor list visible without re-fetching.

- [ ] **Step 7: Verify reset clears storage**

Click the reset/start-over button in the UI. If no reset button is visible, open the browser console and run:
```js
// Trigger reset by navigating back to step 1 via the UI, or:
localStorage.removeItem('sponsorscout_workflow'); location.reload();
```
Check localStorage: `sponsorscout_workflow` key should be absent.
Expected: app returns to step 1 with empty form.

- [ ] **Step 8: Verify malformed storage is handled**

In DevTools → Application → Local Storage, manually set `sponsorscout_workflow` to the string `"not valid json{{"`.
Refresh the page.
Expected: app loads normally at step 1 with no crash.

- [ ] **Step 9: Verify wrong field type is handled gracefully**

In DevTools → Application → Local Storage, manually edit `sponsorscout_workflow` and change `"currentStep": 1` to `"currentStep": "two"` (a string). Save. Refresh.
Expected: app loads at step 1 (currentStep defaults to 0), no crash. Other fields (events, sponsors) that were valid should still be restored.

- [ ] **Step 10: Final build check**

Run: `npm run build`
Expected: `✓ built in X.XXs` with no errors or TypeScript complaints.
