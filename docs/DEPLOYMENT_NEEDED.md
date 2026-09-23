# ⚠️ Deployment Required

## Status: Luma Discovery Function Not Deployed

### What We Built
✅ Created `luma-discovery` edge function locally  
✅ Updated UI to show Luma events instead of Meetup  
✅ Updated workflow to call luma-discovery  
❌ Function NOT deployed to Supabase yet  

### The Issue
When testing, the API returns:
```json
{"code":"NOT_FOUND","message":"Requested function was not found"}
```

This means the function exists locally but hasn't been deployed to Supabase's servers.

---

## How to Deploy

### Option 1: Supabase CLI (Recommended)
```bash
# Install Supabase CLI if not installed
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref ljnwiyfixcoybwacmnfj

# Deploy the new function
supabase functions deploy luma-discovery

# Verify deployment
supabase functions list
```

### Option 2: Supabase Dashboard
1. Go to https://supabase.com/dashboard/project/ljnwiyfixcoybwacmnfj/functions
2. Click "Deploy new function"
3. Upload `supabase/functions/luma-discovery/index.ts`
4. Set function name: `luma-discovery`
5. Click Deploy

### Option 3: Deploy All Functions
```bash
# Deploy all functions at once
supabase functions deploy --all
```

---

## What Functions Need Deployment

### ✅ Already Deployed (presumably)
- contact-enrichment
- email-generation
- export-data
- sponsor-identification
- event-from-url
- meetup-discovery (if it was deployed)
- web-event-discovery
- similar-event-queries

### ❌ Need to Deploy
- **luma-discovery** (NEW - just created)

---

## Testing After Deployment

### Test 1: Direct Function Call
```bash
curl -X POST "https://ljnwiyfixcoybwacmnfj.supabase.co/functions/v1/luma-discovery" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": "AI Conference",
    "location": "San Francisco",
    "eventCount": 5
  }'
```

Expected response:
```json
{
  "events": [
    {
      "id": "...",
      "name": "AI Summit 2024",
      "url": "https://lu.ma/ai-summit-2024",
      "date": "Mon, Jan 15 · 6:00 PM PST",
      "location": "San Francisco",
      "source": "luma"
    }
  ],
  "status": "ok"
}
```

### Test 2: Full Workflow in App
1. Open http://localhost:8080/
2. Enter event details:
   - Name: "AI Conference"
   - Type: "Conference"
   - Industry: "Technology"
   - Location: "San Francisco"
   - Event count: 5
3. Sources: Check both ✓ Conference sites ✓ Luma events
4. Click "Find Events"
5. Should see mix of conference websites + Luma events

---

## Workaround: Test Conference Sites Only

While Luma function isn't deployed, you can test with Conference sites:

1. Uncheck "Luma events" 
2. Check only "Conference sites"
3. This uses `web-event-discovery` which should be deployed

---

## Alternative: Manual Luma URLs

The app already supports manual event URLs:

1. Go to Step 2 (Event Discovery)
2. Click "Add event from URL"
3. Paste a Luma event URL like:
   - https://lu.ma/saasgrowth
   - https://lu.ma/ai-summit
   - https://lu.ma/techcrunch-disrupt
4. Event details will be extracted

This works because `event-from-url` function handles any URL including Luma.

---

## Environment Check

### Required Environment Variables
```bash
# In Supabase Dashboard → Settings → API
VITE_SUPABASE_URL=https://ljnwiyfixcoybwacmnfj.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGc...

# In Supabase Dashboard → Functions → Secrets
LOVABLE_API_KEY=<your-key>  # For AI extraction
```

---

## Next Steps

1. **Deploy luma-discovery function** (see options above)
2. **Test with real query** (curl command above)
3. **Test full workflow** in the app
4. **Monitor function logs** in Supabase Dashboard

---

## Deployment Commands Summary

```bash
# One-time setup
npm install -g supabase
supabase login
supabase link --project-ref ljnwiyfixcoybwacmnfj

# Deploy new function
supabase functions deploy luma-discovery

# Check deployment
supabase functions list

# View logs (for debugging)
supabase functions logs luma-discovery
```

---

## If Deployment Fails

### Common Issues

1. **Not logged in**
   ```bash
   supabase login
   ```

2. **Project not linked**
   ```bash
   supabase link --project-ref ljnwiyfixcoybwacmnfj
   ```

3. **Missing dependencies**
   - The function uses `_shared/scrape.ts` and `_shared/ai-extract.ts`
   - Make sure those files exist and are correct

4. **Environment variables not set**
   - Set `LOVABLE_API_KEY` in Supabase Dashboard → Functions → Secrets

---

## Status Check

Run this to verify deployment:
```bash
curl -X POST "https://ljnwiyfixcoybwacmnfj.supabase.co/functions/v1/luma-discovery" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqbndpeWZpeGNveWJ3YWNtbmZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4Nzg1NzcsImV4cCI6MjA4MDQ1NDU3N30.uSBPrO1GEkB2Mxj6YBWgDO48xbZ-n4N_OYG5KlkngmA" \
  -H "Content-Type: application/json" \
  -d '{"keywords":"test","eventCount":1}'
```

✅ **Success:** Returns events JSON  
❌ **Not deployed:** Returns `{"code":"NOT_FOUND"}`  
