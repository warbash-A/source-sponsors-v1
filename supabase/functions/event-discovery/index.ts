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

// Blacklist for filtering out UI elements and non-event content
const UI_ELEMENT_BLACKLIST = [
  'skip to main content', 'skip to content', 'accessibility', 'feedback',
  'read more', 'view more', 'see more', 'load more', 'show more',
  'next', 'previous', 'back', 'forward', 'close', 'open', 'menu',
  'navigation', 'footer', 'header', 'sidebar', 'search', 'filter',
  'terms', 'privacy', 'cookie', 'accept', 'decline', 'settings',
  'sign in', 'sign up', 'log in', 'log out', 'register', 'subscribe',
  'follow us', 'share', 'like', 'comment', 'download', 'upload',
  'image', 'photo', 'video', 'play', 'pause', 'mute', 'volume',
  'arrow', 'icon', 'button', 'link', 'click here', 'learn more',
  'get started', 'try now', 'buy now', 'shop now', 'add to cart',
  'home', 'about', 'contact', 'help', 'faq', 'support',
];

// Keywords that indicate an actual event
const EVENT_INDICATORS = [
  'conference', 'summit', 'expo', 'convention', 'symposium', 'forum',
  'workshop', 'seminar', 'meetup', 'hackathon', 'festival', 'fair',
  'congress', 'assembly', 'gathering', 'retreat', 'bootcamp', 'camp',
  'awards', 'gala', 'ceremony', 'launch', 'showcase', 'demo day',
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keywords, location, dateRange }: EventSearchParams = await req.json();
    console.log('Event discovery request:', { keywords, location, dateRange });

    const events: DiscoveredEvent[] = [];
    
    // Build search query for Eventbrite
    const locationSlug = location?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'online';
    const searchQuery = encodeURIComponent(`${keywords} conference`.trim());
    const eventbriteUrl = `https://www.eventbrite.com/d/${locationSlug}/${searchQuery}/`;
    
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
        console.log('Content preview:', content.substring(0, 500));
        
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

    // If few events found, try a generic search
    if (events.length < 3) {
      try {
        const genericQuery = encodeURIComponent(`${keywords} ${location || ''} conference 2025 sponsors`);
        const genericUrl = `https://www.google.com/search?q=${genericQuery}`;
        const jinaResponse = await fetch(`https://r.jina.ai/${genericUrl}`, {
          headers: { 'Accept': 'text/plain' },
        });
        
        if (jinaResponse.ok) {
          const content = await jinaResponse.text();
          const parsedEvents = parseEventsFromGenericSearch(content, keywords, events.map(e => e.url));
          events.push(...parsedEvents);
          console.log('Parsed events from generic search:', parsedEvents.length);
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
      events: events.slice(0, 10), // Limit to 10 events
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
  const seenUrls = new Set<string>();
  const seenNames = new Set<string>();
  
  // Split content into lines for processing
  const lines = content.split('\n');
  
  // Strategy 1: Look for Eventbrite event URLs directly
  const eventbriteUrlPattern = /https?:\/\/(?:www\.)?eventbrite\.com\/e\/([a-z0-9-]+)-(\d+)/gi;
  const urlMatches = content.matchAll(eventbriteUrlPattern);
  
  for (const match of urlMatches) {
    const url = match[0];
    const slug = match[1];
    
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    
    // Extract event name from slug
    const eventName = cleanEventSlug(slug);
    
    if (!isValidEventName(eventName, keywords)) continue;
    if (seenNames.has(eventName.toLowerCase())) continue;
    seenNames.add(eventName.toLowerCase());
    
    // Try to find date near this URL in content
    const urlIndex = content.indexOf(url);
    const contextStart = Math.max(0, urlIndex - 200);
    const contextEnd = Math.min(content.length, urlIndex + 200);
    const context = content.substring(contextStart, contextEnd);
    
    const date = extractDateFromContext(context);
    const location = extractLocationFromContext(context);
    
    events.push({
      id: generateId(),
      name: eventName,
      url: url,
      date: date || 'TBD',
      location: location || 'See event page',
      source: 'eventbrite',
    });
    
    if (events.length >= 10) break;
  }
  
  // Strategy 2: Look for markdown links with event-like titles
  const linkPattern = /\[([^\]]{10,100})\]\((https?:\/\/[^\)]+)\)/g;
  const linkMatches = content.matchAll(linkPattern);
  
  for (const match of linkMatches) {
    const [, title, url] = match;
    
    if (seenUrls.has(url)) continue;
    
    // Must be an event-related URL
    if (!url.includes('eventbrite.com') && 
        !url.includes('meetup.com') && 
        !url.includes('conference') &&
        !url.includes('summit') &&
        !url.includes('expo')) continue;
    
    const cleanedTitle = cleanTitle(title);
    
    if (!isValidEventName(cleanedTitle, keywords)) continue;
    if (seenNames.has(cleanedTitle.toLowerCase())) continue;
    
    seenUrls.add(url);
    seenNames.add(cleanedTitle.toLowerCase());
    
    events.push({
      id: generateId(),
      name: cleanedTitle,
      url: url,
      date: 'TBD',
      location: 'See event page',
      source: 'eventbrite',
    });
    
    if (events.length >= 10) break;
  }
  
  return events;
}

function parseEventsFromGenericSearch(content: string, keywords: string, existingUrls: string[]): DiscoveredEvent[] {
  const events: DiscoveredEvent[] = [];
  const seenUrls = new Set<string>(existingUrls);
  const seenNames = new Set<string>();
  
  // Extract URLs that look like event pages
  const linkPattern = /\[([^\]]{10,100})\]\((https?:\/\/[^\)]+)\)/g;
  const urlMatches = content.matchAll(linkPattern);
  
  for (const match of urlMatches) {
    const [, title, url] = match;
    
    if (seenUrls.has(url)) continue;
    
    // Filter to event-like URLs only
    const urlLower = url.toLowerCase();
    const isEventUrl = urlLower.includes('eventbrite') || 
                       urlLower.includes('meetup') ||
                       urlLower.includes('conference') ||
                       urlLower.includes('summit') ||
                       urlLower.includes('expo') ||
                       urlLower.includes('symposium') ||
                       urlLower.includes('2024') ||
                       urlLower.includes('2025');
    
    if (!isEventUrl) continue;
    
    // Skip non-event pages
    if (urlLower.includes('google.com') ||
        urlLower.includes('facebook.com') ||
        urlLower.includes('twitter.com') ||
        urlLower.includes('linkedin.com') ||
        urlLower.includes('youtube.com') ||
        urlLower.includes('wikipedia.org')) continue;
    
    const cleanedTitle = cleanTitle(title);
    
    if (!isValidEventName(cleanedTitle, keywords)) continue;
    if (seenNames.has(cleanedTitle.toLowerCase())) continue;
    
    seenUrls.add(url);
    seenNames.add(cleanedTitle.toLowerCase());
    
    events.push({
      id: generateId(),
      name: cleanedTitle,
      url: url,
      date: 'TBD',
      location: 'See event page',
      source: 'web',
    });
    
    if (events.length >= 5) break;
  }
  
  return events;
}

function cleanEventSlug(slug: string): string {
  // Convert slug like "tech-summit-2025-tickets-123456" to "Tech Summit 2025"
  return slug
    .replace(/-tickets.*$/, '') // Remove ticket ID suffix
    .replace(/-registration.*$/, '')
    .replace(/-\d+$/, '') // Remove trailing numbers
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .trim();
}

function isValidEventName(name: string, keywords: string): boolean {
  if (!name || name.length < 5 || name.length > 100) return false;
  
  const nameLower = name.toLowerCase();
  const keywordsLower = keywords.toLowerCase();
  
  // Must not be a UI element
  for (const blacklisted of UI_ELEMENT_BLACKLIST) {
    if (nameLower === blacklisted || nameLower.startsWith(blacklisted + ' ')) {
      return false;
    }
  }
  
  // Reject generic UI patterns
  if (/^(image|photo|video|icon|button|link)\s*\d*$/i.test(name)) return false;
  if (/^(page|item|card|row|col)\s*\d+$/i.test(name)) return false;
  if (/^[a-z]\s*$/i.test(name)) return false; // Single letters
  if (/^\d+$/.test(name)) return false; // Only numbers
  
  // Should contain event indicator OR match keywords
  const hasEventIndicator = EVENT_INDICATORS.some(indicator => 
    nameLower.includes(indicator)
  );
  
  const matchesKeywords = keywordsLower.split(/\s+/).some(kw => 
    kw.length > 2 && nameLower.includes(kw)
  );
  
  // Must have at least one criteria
  if (!hasEventIndicator && !matchesKeywords) return false;
  
  // Should have proper capitalization (at least 2 capital letters)
  const capitalCount = (name.match(/[A-Z]/g) || []).length;
  if (capitalCount < 1) return false;
  
  return true;
}

function extractDateFromContext(context: string): string | null {
  // Common date patterns
  const patterns = [
    // "March 15-17, 2025" or "Mar 15-17, 2025"
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:\s*[-–]\s*\d{1,2})?,?\s*\d{4}\b/i,
    // "15-17 March 2025"
    /\b\d{1,2}(?:\s*[-–]\s*\d{1,2})?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\b/i,
    // "2025-03-15"
    /\b\d{4}[-\/]\d{2}[-\/]\d{2}\b/,
  ];
  
  for (const pattern of patterns) {
    const match = context.match(pattern);
    if (match) {
      return match[0];
    }
  }
  
  return null;
}

function extractLocationFromContext(context: string): string | null {
  // Look for "City, ST" or "City, State" patterns
  const patterns = [
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z]{2})\b/, // San Francisco, CA
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z][a-z]+)\b/, // Austin, Texas
  ];
  
  for (const pattern of patterns) {
    const match = context.match(pattern);
    if (match) {
      return match[0];
    }
  }
  
  // Check for "Online" or "Virtual"
  if (/\b(online|virtual|remote)\b/i.test(context)) {
    return 'Online';
  }
  
  return null;
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
  return title
    .replace(/\s+/g, ' ')
    .replace(/[|\-–—].*$/, '') // Remove everything after separator
    .replace(/\.\.\.$/, '') // Remove trailing ellipsis
    .trim()
    .substring(0, 100);
}
