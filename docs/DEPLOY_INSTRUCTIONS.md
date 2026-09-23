# Deploy Luma Discovery Function to Supabase

## ⚡ Quick Deploy (Dashboard Method)

### Step 1: Open Supabase Dashboard
Visit: https://supabase.com/dashboard/project/ljnwiyfixcoybwacmnfj/functions

### Step 2: Create New Function
1. Click **"Create Function"** or **"Deploy new function"**
2. Function name: `luma-discovery`
3. Upload the following files:

**Main file:** `supabase/functions/luma-discovery/index.ts`
**Dependencies:** 
- `supabase/functions/_shared/scrape.ts`
- `supabase/functions/_shared/ai-extract.ts`

### Step 3: Deploy
Click **"Deploy"** and wait ~30 seconds

### Step 4: Test Deployment
```bash
curl -X POST "https://ljnwiyfixcoybwacmnfj.supabase.co/functions/v1/luma-discovery" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqbndpeWZpeGNveWJ3YWNtbmZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4Nzg1NzcsImV4cCI6MjA4MDQ1NDU3N30.uSBPrO1GEkB2Mxj6YBWgDO48xbZ-n4N_OYG5KlkngmA" \
  -H "Content-Type: application/json" \
  -d '{"keywords":"AI Conference","location":"San Francisco","eventCount":5}'
```

✅ Success: Returns JSON with events
❌ Failed: Returns error message

---

## 🔧 Alternative: CLI Method (If you want)

### Link Project First
```bash
# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref ljnwiyfixcoybwacmnfj

# Deploy
supabase functions deploy luma-discovery
```

---

## 📋 What to Upload

The function file is already created at:
`supabase/functions/luma-discovery/index.ts`

It depends on these shared files:
- `supabase/functions/_shared/scrape.ts` (JinaAI scraping)
- `supabase/functions/_shared/ai-extract.ts` (AI extraction with Lovable AI Gateway)

---

## ✅ After Deployment

### Test in the App
1. Open http://localhost:8080/
2. Fill in event details:
   - Name: "AI Conference"
   - Industry: "Technology"
   - Location: "San Francisco"
   - Event count: 5
3. Make sure **"Luma events"** is checked ✓
4. Click "Find Events"
5. You should see Luma events with URLs like `https://lu.ma/event-name`

### Verify Other Functions
While you're in the dashboard, check these functions are also deployed:
- ✅ contact-enrichment
- ✅ email-generation
- ✅ event-from-url
- ✅ export-data
- ✅ sponsor-identification
- ✅ web-event-discovery
- ✅ similar-event-queries

---

## 🔑 Environment Variables

Make sure these are set in Supabase Dashboard → Functions → Secrets:

```env
LOVABLE_API_KEY=<your-lovable-api-key>
```

Without this, AI extraction will fail.

---

## 🐛 Troubleshooting

### "Function not found"
- Function isn't deployed yet
- Check spelling: must be exactly `luma-discovery`

### "AI credits exhausted" 
- LOVABLE_API_KEY not set or invalid
- Check Supabase → Functions → Secrets

### "Could not read page"
- JinaAI Reader might be down
- Check `_shared/scrape.ts` has correct JinaAI URL

### No events returned
- Luma might have changed their layout
- Try "Conference sites" instead
- Check function logs in Supabase Dashboard

---

## 📊 Expected Results

After deployment, a search for "AI Conference" in "San Francisco" should return:
- 2-5 Luma events (lu.ma URLs)
- 3-5 Conference website events
- Mix of both sources
- Event names, dates, locations
- Valid URLs for each event

---

## 🎯 Next Steps After Deploy

1. ✅ Deploy luma-discovery
2. ✅ Test with real search
3. ✅ Run full workflow (Steps 1-3)
4. ✅ Verify sponsor identification works
5. 📤 Deploy frontend to Lovable (if sharing)

---

## 💬 Need Help?

If deployment fails, check:
1. Supabase Dashboard → Logs (for error messages)
2. Browser console (F12) for frontend errors
3. Network tab (to see API calls)

Common fixes:
- Refresh Supabase dashboard
- Clear browser cache
- Re-authenticate Supabase CLI
- Check project permissions
