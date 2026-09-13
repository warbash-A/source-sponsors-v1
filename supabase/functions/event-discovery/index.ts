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
    const keywords: string = (body.keywords ?? '').toString().trim();
    const location: string | undefined = body.location?.toString().trim() || undefined;
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
          'Eventbrite is not connected. Add an Eventbrite API token to search Eventbrite; its public pages block automated reading.',
      });
    }

    const params = new URLSearchParams({
      q: keywords,
      expand: 'venue',
      'page_size': String(Math.min(eventCount, 50)),
    });
    if (location) {
      params.set('location.address', location);
      params.set('location.within', '100km');
    }

    const apiUrl = `https://www.eventbriteapi.com/v3/events/search/?${params.toString()}`;
    console.log('Calling Eventbrite API:', apiUrl);

    const res = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('Eventbrite API error', res.status, detail.substring(0, 400));
      const message =
        res.status === 401 || res.status === 403
          ? 'Eventbrite rejected the API token. Check that the token is valid.'
          : `Eventbrite search failed (${res.status}).`;
      return json({ events: [], status: 'error', message });
    }

    const payload = await res.json();
    const rawEvents: EventbriteApiEvent[] = payload.events ?? [];

    const events: DiscoveredEvent[] = rawEvents.slice(0, eventCount).map((e) => ({
      id: e.id ?? generateId(),
      name: e.name?.text ?? 'Untitled event',
      url: e.url ?? '',
      date: e.start?.local ? formatDate(e.start.local) : 'TBD',
      location: e.online_event
        ? 'Online'
        : e.venue?.address?.localized_address_display ?? e.venue?.name ?? location ?? 'See event page',
      source: 'eventbrite' as const,
    }));

    console.log('Eventbrite events found:', events.length);

    return json({
      events,
      status: events.length > 0 ? 'ok' : 'no_results',
      source: 'eventbrite',
      totalFound: events.length,
      message: events.length === 0 ? 'Eventbrite returned no matching events.' : undefined,
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
