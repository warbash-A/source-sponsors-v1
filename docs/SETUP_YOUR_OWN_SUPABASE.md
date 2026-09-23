# Set Up Your Own Supabase Project

## 🎯 Quick Setup (15 minutes)

### Step 1: Create Supabase Project

1. **Sign up/Login:** https://supabase.com/dashboard
2. **Click:** "New Project"
3. **Fill in:**
   - Project name: `sponsorscout`
   - Database password: [create strong password - save it!]
   - Region: Choose closest to your location
4. **Click:** "Create new project"
5. **Wait:** ~2 minutes for project to initialize

---

### Step 2: Get Your Credentials

Once project is ready:

1. Go to **Settings → API** in left sidebar
2. Copy these values:

```
Project URL: https://xxxxx.supabase.co
              ↑ your project ID

Project API keys:
- anon public: eyJhbGc... (long key)
- service_role: eyJhbGc... (different long key)
```

---

### Step 3: Update Your .env File

Open `.env` in your project and replace with YOUR credentials:

```env
VITE_SUPABASE_PROJECT_ID="your-project-id"
VITE_SUPABASE_PUBLISHABLE_KEY="your-anon-public-key"
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
```

**Save the file!**

---

### Step 4: Restart Your Dev Server

```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm run dev
```

---

### Step 5: Deploy Functions

#### Option A: Supabase CLI (Recommended)

```bash
# Link to YOUR new project
supabase link --project-ref your-project-id

# Deploy all functions at once
supabase functions deploy --all

# Or deploy one by one
supabase functions deploy luma-discovery
supabase functions deploy web-event-discovery
supabase functions deploy sponsor-identification
supabase functions deploy contact-enrichment
supabase functions deploy event-from-url
supabase functions deploy similar-event-queries
```

#### Option B: Dashboard (Manual)

For each function, go to:
https://supabase.com/dashboard/project/your-project-id/functions

**Deploy these 6 functions:**

1. **luma-discovery**
   - Upload: `supabase/functions/luma-discovery/index.ts`
   - Dependencies: `_shared/scrape.ts`, `_shared/ai-extract.ts`

2. **web-event-discovery**
   - Upload: `supabase/functions/web-event-discovery/index.ts`
   - Dependencies: `_shared/scrape.ts`, `_shared/ai-extract.ts`

3. **sponsor-identification**
   - Upload: `supabase/functions/sponsor-identification/index.ts`
   - Dependencies: `_shared/scrape.ts`, `_shared/ai-extract.ts`

4. **contact-enrichment**
   - Upload: `supabase/functions/contact-enrichment/index.ts`
   - Dependencies: `_shared/scrape.ts`

5. **event-from-url**
   - Upload: `supabase/functions/event-from-url/index.ts`
   - Dependencies: `_shared/scrape.ts`, `_shared/ai-extract.ts`

6. **similar-event-queries**
   - Upload: `supabase/functions/similar-event-queries/index.ts`
   - Dependencies: `_shared/ai-extract.ts`

---

### Step 6: Set Environment Variable

**IMPORTANT:** Add your Lovable API key

1. Go to **Functions → Manage Secrets** in Supabase dashboard
2. Add secret:
   ```
   Name: LOVABLE_API_KEY
   Value: [your Lovable API key]
   ```

Without this, AI extraction will fail!

---

### Step 7: Test It Works

```bash
# Test luma-discovery
curl -X POST "https://your-project-id.supabase.co/functions/v1/luma-discovery" \
  -H "Authorization: Bearer your-anon-key" \
  -H "Content-Type: application/json" \
  -d '{"keywords":"AI Conference","location":"San Francisco","eventCount":5}'
```

✅ **Success:** Returns JSON with events  
❌ **Error:** Check function logs in Supabase dashboard

---

### Step 8: Test Full App

1. Open http://localhost:8080/
2. Enter event details
3. Click "Find Events"
4. Should see Luma + Conference site events

---

## 🔑 Where to Get LOVABLE_API_KEY?

If you don't have one:

1. **Go to:** https://lovable.dev (or https://ai.gateway.lovable.dev)
2. **Sign in/up**
3. **Get API key** from dashboard
4. **Add to Supabase** as described above

**Free tier includes:**
- AI extraction calls
- Good enough for testing

---

## 💰 Supabase Free Tier

Your new project includes:
- ✅ 500 MB database storage
- ✅ 2 GB file storage  
- ✅ 50,000 monthly active users
- ✅ 2 million Edge Function invocations
- ✅ No credit card required

**This covers:**
- 10-50 users easily
- Testing and development
- Small production apps

---

## 🐛 Troubleshooting

### "Function not found"
- Functions not deployed yet
- Run `supabase functions deploy --all`

### "LOVABLE_API_KEY not configured"
- Add it in Supabase → Functions → Manage Secrets

### "Could not read page"
- JinaAI might be rate limiting
- Try again in a few minutes

### App still shows old errors
- Clear browser cache (Cmd+Shift+R or Ctrl+Shift+R)
- Restart dev server
- Check .env file has new values

---

## ✅ Checklist

- [ ] Created new Supabase project
- [ ] Copied project URL and anon key
- [ ] Updated .env file
- [ ] Restarted dev server
- [ ] Deployed all 6 functions
- [ ] Added LOVABLE_API_KEY secret
- [ ] Tested with curl
- [ ] Tested in app (full workflow)

---

## 🎉 Once Working

You now have:
- ✅ Your own Supabase backend
- ✅ Full control over functions
- ✅ Can share with others
- ✅ Ready to deploy frontend to Lovable

**To share:**
1. Deploy frontend to Lovable
2. Share URL with others
3. They use your Supabase backend automatically
