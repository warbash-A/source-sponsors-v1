import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EventSearchParams {
  keywords: string;
  location?: string;
  dateRange?: string;
}

interface DiscoveredEvent {
  id: string;
  name: string;
  url: string;
  date: string;
  location: string;
  sponsorCount?: number;
  source: 'eventbrite' | 'web' | 'sample';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keywords, location, dateRange }: EventSearchParams = await req.json();
    console.log('Event discovery request:', { keywords, location, dateRange });

    const events: DiscoveredEvent[] = [];
    
    // Build search query for Eventbrite
    const searchQuery = encodeURIComponent(`${keywords} ${location || ''} events`.trim());
    const eventbriteUrl = `https://www.eventbrite.com/d/${location?.toLowerCase().replace(/\s+/g, '-') || 'online'}/${searchQuery}/`;
    
    console.log('Fetching from JinaAI Reader:', eventbriteUrl);
    
    try {
      // Use JinaAI Reader to scrape Eventbrite search results
      const jinaResponse = await fetch(`https://r.jina.ai/${eventbriteUrl}`, {
        headers: {
          'Accept': 'text/plain',
        },
      });
      
      if (jinaResponse.ok) {
        const content = await jinaResponse.text();
        console.log('JinaAI response length:', content.length);
        
        // Parse events from the markdown content
        const parsedEvents = parseEventsFromMarkdown(content, keywords);
        events.push(...parsedEvents);
        console.log('Parsed events from Eventbrite:', parsedEvents.length);
      } else {
        console.log('JinaAI request failed:', jinaResponse.status);
      }
    } catch (error) {
      console.error('Error fetching from JinaAI:', error);
    }

    // If no events found, try a generic search
    if (events.length === 0) {
      try {
        const genericUrl = `https://www.google.com/search?q=${searchQuery}+conference+sponsors`;
        const jinaResponse = await fetch(`https://r.jina.ai/${genericUrl}`, {
          headers: { 'Accept': 'text/plain' },
        });
        
        if (jinaResponse.ok) {
          const content = await jinaResponse.text();
          const parsedEvents = parseEventsFromGenericSearch(content, keywords);
          events.push(...parsedEvents);
        }
      } catch (error) {
        console.error('Error in fallback search:', error);
      }
    }

    // If still no events, return sample data for demo
    if (events.length === 0) {
      console.log('No events found, returning sample data');
      events.push(...getSampleEvents(keywords, location));
    }

    return new Response(JSON.stringify({ 
      events,
      source: events[0]?.source || 'sample',
      totalFound: events.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in event-discovery:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function parseEventsFromMarkdown(content: string, keywords: string): DiscoveredEvent[] {
  const events: DiscoveredEvent[] = [];
  
  // Look for event patterns in markdown - titles with dates and links
  const lines = content.split('\n');
  let currentEvent: Partial<DiscoveredEvent> | null = null;
  
  for (const line of lines) {
    // Look for markdown links that might be events
    const linkMatch = line.match(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/);
    if (linkMatch) {
      const [, title, url] = linkMatch;
      // Check if this looks like an event (has event-related keywords or eventbrite URL)
      if (url.includes('eventbrite.com/e/') || 
          title.toLowerCase().includes('conference') ||
          title.toLowerCase().includes('summit') ||
          title.toLowerCase().includes('expo') ||
          title.toLowerCase().includes(keywords.toLowerCase())) {
        
        currentEvent = {
          id: generateId(),
          name: cleanTitle(title),
          url: url,
          source: 'eventbrite',
        };
      }
    }
    
    // Look for date patterns
    if (currentEvent && !currentEvent.date) {
      const dateMatch = line.match(/(\w+\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4}|\w+\s+\d{1,2}-\d{1,2},?\s+\d{4})/i);
      if (dateMatch) {
        currentEvent.date = dateMatch[1];
      }
    }
    
    // Look for location patterns
    if (currentEvent && !currentEvent.location) {
      const locationMatch = line.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2})/);
      if (locationMatch) {
        currentEvent.location = locationMatch[1];
      }
    }
    
    // Save event if we have enough info
    if (currentEvent && currentEvent.name && currentEvent.url) {
      events.push({
        id: currentEvent.id || generateId(),
        name: currentEvent.name,
        url: currentEvent.url,
        date: currentEvent.date || 'TBD',
        location: currentEvent.location || 'Various Locations',
        source: 'eventbrite',
      });
      currentEvent = null;
      
      if (events.length >= 10) break;
    }
  }
  
  return events;
}

function parseEventsFromGenericSearch(content: string, keywords: string): DiscoveredEvent[] {
  const events: DiscoveredEvent[] = [];
  
  // Extract URLs that look like event pages
  const urlMatches = content.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g);
  
  for (const match of urlMatches) {
    const [, title, url] = match;
    if (url.includes('eventbrite') || 
        url.includes('meetup') || 
        url.includes('conference') ||
        title.toLowerCase().includes('summit') ||
        title.toLowerCase().includes('expo')) {
      events.push({
        id: generateId(),
        name: cleanTitle(title),
        url: url,
        date: 'TBD',
        location: 'See event page',
        source: 'web',
      });
      
      if (events.length >= 5) break;
    }
  }
  
  return events;
}

function getSampleEvents(keywords: string, location?: string): DiscoveredEvent[] {
  return [
    {
      id: generateId(),
      name: `${keywords} Tech Summit 2025`,
      url: 'https://example.com/tech-summit',
      date: 'March 15-17, 2025',
      location: location || 'San Francisco, CA',
      sponsorCount: 12,
      source: 'sample',
    },
    {
      id: generateId(),
      name: `${keywords} Innovation Conference`,
      url: 'https://example.com/innovation-conf',
      date: 'April 20-22, 2025',
      location: location || 'Austin, TX',
      sponsorCount: 8,
      source: 'sample',
    },
    {
      id: generateId(),
      name: `${keywords} Industry Expo`,
      url: 'https://example.com/industry-expo',
      date: 'May 5-7, 2025',
      location: location || 'New York, NY',
      sponsorCount: 15,
      source: 'sample',
    },
  ];
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

function cleanTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim().substring(0, 100);
}
