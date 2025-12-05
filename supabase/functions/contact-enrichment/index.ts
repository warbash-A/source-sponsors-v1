import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Sponsor {
  id: string;
  name: string;
  tier: string;
  website?: string;
  eventIds: string[];
  eventCount: number;
}

interface EnrichedSponsor extends Sponsor {
  domain?: string;
  emails: string[];
  linkedinUrl?: string;
  enrichmentStatus: 'pending' | 'enriched' | 'partial' | 'failed';
  contacts?: Contact[];
}

interface Contact {
  name?: string;
  title?: string;
  email?: string;
  linkedin?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sponsors }: { sponsors: Sponsor[] } = await req.json();
    console.log('Contact enrichment for sponsors:', sponsors.length);

    const enrichedSponsors: EnrichedSponsor[] = [];

    for (const sponsor of sponsors) {
      console.log('Enriching sponsor:', sponsor.name);
      
      const enriched: EnrichedSponsor = {
        ...sponsor,
        emails: [],
        enrichmentStatus: 'pending',
        contacts: [],
      };

      try {
        // Extract/infer domain
        const domain = sponsor.website || inferDomain(sponsor.name);
        enriched.domain = domain;

        if (domain) {
          // Try to scrape company website for contact info
          const companyUrl = domain.startsWith('http') ? domain : `https://${domain}`;
          
          try {
            // Scrape about/contact page
            const contactPageUrls = [
              `${companyUrl}/contact`,
              `${companyUrl}/about`,
              `${companyUrl}/team`,
              `${companyUrl}/about-us`,
            ];

            for (const pageUrl of contactPageUrls) {
              try {
                const jinaResponse = await fetch(`https://r.jina.ai/${pageUrl}`, {
                  headers: { 'Accept': 'text/plain' },
                });

                if (jinaResponse.ok) {
                  const content = await jinaResponse.text();
                  
                  // Extract emails
                  const emails = extractEmails(content);
                  enriched.emails.push(...emails.filter(e => !enriched.emails.includes(e)));
                  
                  // Extract contacts/team members
                  const contacts = extractContacts(content);
                  enriched.contacts?.push(...contacts);
                  
                  // Extract LinkedIn URL
                  if (!enriched.linkedinUrl) {
                    enriched.linkedinUrl = extractLinkedIn(content, sponsor.name);
                  }
                  
                  if (enriched.emails.length > 0 || enriched.contacts!.length > 0) {
                    break; // Found good data, stop trying other pages
                  }
                }
              } catch (e) {
                // Continue to next URL
              }
              
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          } catch (error) {
            console.error('Error scraping company website:', error);
          }

          // Generate email variants if no emails found
          if (enriched.emails.length === 0 && domain) {
            enriched.emails = generateEmailVariants(domain);
          }

          // Generate LinkedIn search URL if not found
          if (!enriched.linkedinUrl) {
            enriched.linkedinUrl = `https://www.linkedin.com/company/${sponsor.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`;
          }
        }

        // Set enrichment status
        if (enriched.emails.length > 0 && enriched.contacts!.length > 0) {
          enriched.enrichmentStatus = 'enriched';
        } else if (enriched.emails.length > 0 || enriched.contacts!.length > 0) {
          enriched.enrichmentStatus = 'partial';
        } else {
          enriched.enrichmentStatus = 'partial'; // At least have generated emails
        }

      } catch (error) {
        console.error('Error enriching sponsor:', sponsor.name, error);
        enriched.enrichmentStatus = 'failed';
      }

      enrichedSponsors.push(enriched);
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return new Response(JSON.stringify({ 
      sponsors: enrichedSponsors,
      totalEnriched: enrichedSponsors.filter(s => s.enrichmentStatus === 'enriched').length,
      totalPartial: enrichedSponsors.filter(s => s.enrichmentStatus === 'partial').length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in contact-enrichment:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function inferDomain(companyName: string): string {
  // Simple domain inference from company name
  const cleaned = companyName
    .toLowerCase()
    .replace(/\s+(inc|llc|ltd|corp|corporation|company|co)\.?$/i, '')
    .replace(/[^a-z0-9]/g, '');
  
  return `${cleaned}.com`;
}

function extractEmails(content: string): string[] {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const matches = content.match(emailRegex) || [];
  
  // Filter out common non-contact emails
  const filtered = matches.filter(email => {
    const lower = email.toLowerCase();
    return !lower.includes('example') && 
           !lower.includes('test@') &&
           !lower.includes('noreply') &&
           !lower.includes('no-reply');
  });
  
  return [...new Set(filtered)].slice(0, 5);
}

function extractContacts(content: string): Contact[] {
  const contacts: Contact[] = [];
  
  // Look for patterns like "Name - Title" or "Name, Title"
  const patterns = [
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*[-–|,]\s*(CEO|CTO|CMO|CFO|VP|Director|Manager|Head|Chief|President|Founder|Co-Founder)[^,\n]*/gi,
    /(?:contact|reach|email)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
  ];
  
  for (const pattern of patterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const name = match[1]?.trim();
      const title = match[2]?.trim();
      
      if (name && name.length < 50) {
        contacts.push({ name, title });
      }
      
      if (contacts.length >= 5) break;
    }
  }
  
  return contacts;
}

function extractLinkedIn(content: string, companyName: string): string | undefined {
  // Look for LinkedIn company URL
  const linkedinMatch = content.match(/https?:\/\/(?:www\.)?linkedin\.com\/company\/([a-z0-9-]+)/i);
  if (linkedinMatch) {
    return linkedinMatch[0];
  }
  return undefined;
}

function generateEmailVariants(domain: string): string[] {
  const cleanDomain = domain.replace(/^www\./, '');
  
  // Common email patterns for outreach
  return [
    `info@${cleanDomain}`,
    `contact@${cleanDomain}`,
    `hello@${cleanDomain}`,
    `partnerships@${cleanDomain}`,
    `marketing@${cleanDomain}`,
  ];
}
