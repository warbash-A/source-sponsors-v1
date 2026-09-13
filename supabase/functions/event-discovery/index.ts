import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json, generateId } from "../_shared/scrape.ts";

interface DiscoveredEvent {
  id: string;
  name: string;
  url: string;
  date: string;
  location: string;
  sponsorCount?: number;
  source: 'eventbrite';
}

interface EventbriteApiEvent {
  id: string;
  name?: { text?: string };
  url?: string;
  start?: { local?: string };
  venue?: { name?: string; address?: { localized_address_display?: string } };
  online_event?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const keywords: string = (body.keywords ?? '').toString().trim().toLowerCase();
    const location: string | undefined = body.location?.toString().trim().toLowerCase() || undefined;
    const eventCount: number = typeof body.eventCount === 'number' ? Math.min(body.eventCount, 50) : 10;

    if (!keywords) {
      return json({ events: [], status: 'empty', message: 'No search keywords provided.' });
    }

    const token = Deno.env.get('EVENTBRITE_API_TOKEN');
    if (!token) {
      console.log('EVENTBRITE_API_TOKEN not configured — Eventbrite unavailable');
      return json({
        events: [],
        status: 'unavailable',
        message:
          'Eventbrite is not connected. Add an Eventbrite API token to import your Eventbrite events; public Eventbrite search was discontinued.',
      });
    }

    // Eventbrite shut down its public event-search API in 2019. The only
    // keyword-aware discovery still possible with a token is to list the
    // authenticated user's own events and filter them locally.
    const apiUrl = `https://www.eventbriteapi.com/v3/users/me/events/?expand=venue&order_by=start_desc&page_size=50`;
    console.log('Calling Eventbrite API:', apiUrl);

    const res = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('Eventbrite API error', res.status, detail.substring(0, 400));
      const message =
        res.status === 401 || res.status === 403
          ? 'Eventbrite rejected the API token. Check that the token is valid.'
          : `Eventbrite request failed (${res.status}).`;
      return json({ events: [], status: 'error', message });
    }

    const payload = await res.json();
    const rawEvents: EventbriteApiEvent[] = payload.events ?? [];

    const terms = keywords.split(/\s+/).filter(Boolean);
    const filtered = rawEvents.filter((e) => {
      const haystack = `${e.name?.text ?? ''} ${e.venue?.name ?? ''}`.toLowerCase();
      const matchesKeyword = terms.length === 0 || terms.every((t) => haystack.includes(t));
      const matchesLocation = !location ||
        (e.venue?.address?.localized_address_display ?? '').toLowerCase().includes(location) ||
        (e.venue?.name ?? '').toLowerCase().includes(location);
      return matchesKeyword && matchesLocation;
    });

    const events: DiscoveredEvent[] = filtered.slice(0, eventCount).map((e) => ({
      id: e.id ?? generateId(),
      name: e.name?.text ?? 'Untitled event',
      url: e.url ?? '',
      date: e.start?.local ? formatDate(e.start.local) : 'TBD',
      location: e.online_event
        ? 'Online'
        : e.venue?.address?.localized_address_display ?? e.venue?.name ?? 'See event page',
      source: 'eventbrite' as const,
    }));

    console.log('Eventbrite events found:', events.length, 'of', rawEvents.length);

    return json({
      events,
      status: events.length > 0 ? 'ok' : 'no_results',
      source: 'eventbrite',
      totalFound: events.length,
      message: events.length === 0
        ? 'No matching events in this Eventbrite account. Public Eventbrite search is no longer available.'
        : undefined,
    });
  } catch (error) {
    console.error('Error in event-discovery:', error);
    return json({
      events: [],
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

function formatDate(local: string): string {
  const d = new Date(local);
  if (isNaN(d.getTime())) return local;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
