# Luma Integration Plan

## Current State

### ✅ What Works Now
- **Manual Luma URLs**: Users can already paste Luma event URLs on Step 2
- The `event-from-url` function handles any event URL including Luma
- Example: Paste `https://lu.ma/your-event` → extracts event details

### ❌ What's Missing
- **No automated Luma discovery**: Can't search Luma like we do with Meetup
- Users must manually find and paste Luma URLs

---

## Why Luma is Attractive

### 1. **Better Event Quality**
- Curated tech/startup events
- Professional conferences
- Clear sponsor information
- High-quality event pages

### 2. **Structured Pages**
- Consistent layout across events
- Sponsors often listed clearly
- Better scraping potential than Meetup

### 3. **Tech-Focused Audience**
- SaaS, startups, tech conferences
- Higher-value sponsorship opportunities
- More relevant for B2B event organizers

---

## Integration Options

### Option A: Automated Luma Search (Recommended)
**What:** Create `luma-discovery` edge function (like `meetup-discovery`)

**How:**
1. Search Luma's public event listings
2. Use JinaAI Reader to scrape search results
3. Extract events with AI like we do for Meetup

**Pros:**
- Automated discovery
- Consistent with current architecture
- Users select events from list

**Cons:**
- Need to reverse-engineer Luma's search
- May have rate limits
- Luma might change their layout

**Estimated Effort:** 2-3 hours

---

### Option B: Luma Category Browsing
**What:** Browse Luma's category pages (e.g., lu.ma/discover/tech)

**How:**
```typescript
// Example categories
const LUMA_CATEGORIES = [
  'tech',
  'startup',
  'saas',
  'product',
  'marketing',
  'design'
];

// Scrape category page
const url = `https://lu.ma/discover/${category}`;
```

**Pros:**
- More stable than search
- Curated events
- Easy to implement

**Cons:**
- Limited to Luma's categories
- May not match user's specific event type

**Estimated Effort:** 1-2 hours

---

### Option C: Enhanced Manual Input (Quick Win)
**What:** Make manual Luma URL input more prominent

**How:**
1. Add "Paste Luma URL" button on Step 1
2. Pre-fill form from Luma event details
3. Add Luma logo/branding to indicate support

**Pros:**
- Works right now (no backend changes)
- Simple and reliable
- User controls which events

**Cons:**
- Manual process
- Users must find events first

**Estimated Effort:** 30 minutes

---

## Recommended Approach

### Phase 1: Quick Win (Do Now) ⚡
**Option C**: Enhance manual Luma input

```typescript
// Add to EventInputForm.tsx
<div className="mt-4 p-4 border rounded-lg">
  <h3>Quick Start: Paste a Luma Event URL</h3>
  <Input 
    placeholder="https://lu.ma/your-event"
    onBlur={(e) => autoFillFromLumaUrl(e.target.value)}
  />
  <p className="text-xs text-muted-foreground mt-2">
    We'll extract event details and find similar events
  </p>
</div>
```

**Benefits:**
- Zero backend work
- Works immediately
- Tests user interest in Luma

---

### Phase 2: Automated Discovery (Later) 🚀
**Option A or B**: Build `luma-discovery` function

**Decision criteria:**
- Did users use manual Luma input in Phase 1?
- Is Luma scraping reliable?
- Does Luma have public search/API?

---

## Technical Details

### Luma URL Patterns
```
Event page: https://lu.ma/event-slug
Calendar: https://lu.ma/@username
Discover: https://lu.ma/discover/category
```

### Scraping Luma Events
**Current approach** (via `event-from-url`):
1. User pastes Luma URL
2. JinaAI Reader scrapes page
3. AI extracts: name, date, location, sponsors

**Proposed automated discovery:**
```typescript
// Search approach
const searchUrl = `https://lu.ma/discover?q=${keywords}&location=${location}`;

// Category approach  
const categoryUrl = `https://lu.ma/discover/${category}`;

// Use JinaAI + AI extraction (same as Meetup)
const content = await readPage(searchUrl, 40000);
const events = await aiExtract({ /* ... */ });
```

---

## Comparison: Meetup vs Luma

| Feature | Meetup | Luma | Winner |
|---------|--------|------|--------|
| Event quality | Mixed | High | Luma |
| Sponsor info | Sometimes | Often | Luma |
| Search UI | Public | Public | Tie |
| Scraping ease | Medium | Medium | Tie |
| Tech events | Some | Many | Luma |
| Community events | Many | Few | Meetup |
| Rate limits | Unknown | Unknown | Tie |

**Verdict:** Luma is better for **professional tech/SaaS events** with sponsors

---

## Test Cases

### Manual Luma Input (Phase 1)
```
Test URLs:
1. https://lu.ma/saasgrowth2024
2. https://lu.ma/techcrunch-disrupt
3. https://lu.ma/producthunt-meetup

Expected:
- Event details extracted
- Sponsor identification works
- Similar events found
```

### Automated Discovery (Phase 2)
```
Test inputs:
- Keywords: "SaaS conference"
- Location: "San Francisco"
- Expected: 5-10 Luma events returned
```

---

## Implementation Steps (Phase 1 - Quick Win)

### Step 1: Add Luma Quick Start to EventInputForm
```tsx
// In EventInputForm.tsx, add before the submit button:
<div className="mt-6 p-4 bg-muted/50 rounded-lg border-2 border-dashed">
  <div className="flex items-center gap-2 mb-2">
    <Info className="h-4 w-4" />
    <Label>Have a Luma event? Paste URL here</Label>
  </div>
  <Input 
    placeholder="https://lu.ma/your-event"
    onPaste={(e) => handleLumaUrl(e.clipboardData.getData('text'))}
  />
</div>
```

### Step 2: Auto-fill from Luma
```typescript
const handleLumaUrl = async (url: string) => {
  if (!url.includes('lu.ma')) return;
  
  // Call event-from-url to extract details
  const { data } = await supabase.functions.invoke('event-from-url', {
    body: { url }
  });
  
  // Pre-fill form
  if (data?.event) {
    setFormData({
      name: data.event.name,
      location: data.event.location,
      // ... extract type/industry from name
    });
  }
};
```

### Step 3: Update UI messaging
```tsx
<p className="text-sm text-muted-foreground">
  Works with Meetup, Luma, and conference websites
</p>
```

---

## Next Steps

### Immediate (5 minutes)
1. ✅ Test current manual Luma URL support
2. ✅ Verify sponsor extraction works on Luma pages

### Quick Win (30 minutes)
3. Add Luma quick-start section to EventInputForm
4. Add auto-fill from Luma URL
5. Update messaging to highlight Luma support

### Future (2-3 hours)
6. Build `luma-discovery` edge function
7. Add Luma as event source option
8. Test with real Luma events

---

## Questions to Answer

1. **Does Luma have better sponsor data than Meetup?**
   - Test with real Luma events
   - Compare sponsor extraction quality

2. **Can we reliably scrape Luma search/categories?**
   - Test JinaAI Reader on Luma pages
   - Check for rate limits

3. **Do users prefer Luma or Meetup events?**
   - Track which source they select
   - Monitor Phase 1 manual Luma usage

---

## Recommendation

**Start with Phase 1 (Quick Win)**
- Enhance manual Luma URL input (30 min work)
- Test with real users
- Measure adoption

**Then decide on Phase 2**
- If users love Luma → build automated discovery
- If Meetup is enough → skip Phase 2
- If both are valuable → support both

**Why this approach:**
- No risk (builds on working code)
- Fast to implement
- Validates user interest
- Can scale to automation later
