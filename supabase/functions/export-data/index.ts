import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExportRequest {
  format: 'csv' | 'json' | 'txt';
  data: {
    events?: any[];
    sponsors?: any[];
    emails?: any[];
  };
  eventName?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { format, data, eventName }: ExportRequest = await req.json();
    console.log('Export request:', format, 'Events:', data.events?.length, 'Sponsors:', data.sponsors?.length, 'Emails:', data.emails?.length);

    let content: string;
    let contentType: string;
    let filename: string;

    switch (format) {
      case 'csv':
        content = generateCSV(data);
        contentType = 'text/csv';
        filename = `sponsor-data-${Date.now()}.csv`;
        break;
      
      case 'json':
        content = JSON.stringify(data, null, 2);
        contentType = 'application/json';
        filename = `sponsor-data-${Date.now()}.json`;
        break;
      
      case 'txt':
        content = generateEmailsText(data.emails || [], eventName);
        contentType = 'text/plain';
        filename = `email-templates-${Date.now()}.txt`;
        break;
      
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    return new Response(JSON.stringify({ 
      content,
      filename,
      contentType,
      size: content.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in export-data:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function generateCSV(data: ExportRequest['data']): string {
  const lines: string[] = [];
  
  // Sponsors section
  if (data.sponsors && data.sponsors.length > 0) {
    lines.push('=== SPONSORS ===');
    lines.push('Name,Tier,Website,Emails,LinkedIn,Event Count,Status');
    
    for (const sponsor of data.sponsors) {
      const row = [
        escapeCsvField(sponsor.name || ''),
        escapeCsvField(sponsor.tier || 'unknown'),
        escapeCsvField(sponsor.website || sponsor.domain || ''),
        escapeCsvField((sponsor.emails || []).join('; ')),
        escapeCsvField(sponsor.linkedinUrl || ''),
        sponsor.eventCount || 1,
        escapeCsvField(sponsor.enrichmentStatus || 'unknown'),
      ];
      lines.push(row.join(','));
    }
    lines.push('');
  }
  
  // Events section
  if (data.events && data.events.length > 0) {
    lines.push('=== EVENTS ===');
    lines.push('Name,URL,Date,Location,Source');
    
    for (const event of data.events) {
      const row = [
        escapeCsvField(event.name || ''),
        escapeCsvField(event.url || ''),
        escapeCsvField(event.date || ''),
        escapeCsvField(event.location || ''),
        escapeCsvField(event.source || ''),
      ];
      lines.push(row.join(','));
    }
    lines.push('');
  }
  
  // Emails section
  if (data.emails && data.emails.length > 0) {
    lines.push('=== EMAIL DRAFTS ===');
    lines.push('Sponsor,To,Subject');
    
    for (const email of data.emails) {
      const row = [
        escapeCsvField(email.sponsorName || ''),
        escapeCsvField(email.to || ''),
        escapeCsvField(email.subject || ''),
      ];
      lines.push(row.join(','));
    }
  }
  
  return lines.join('\n');
}

function generateEmailsText(emails: any[], eventName?: string): string {
  const lines: string[] = [];
  
  lines.push(`Email Templates - ${eventName || 'Sponsor Outreach'}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('=' .repeat(60));
  lines.push('');
  
  for (const email of emails) {
    lines.push('-'.repeat(60));
    lines.push(`TO: ${email.to}`);
    lines.push(`SPONSOR: ${email.sponsorName}`);
    lines.push(`SUBJECT: ${email.subject}`);
    lines.push('-'.repeat(60));
    lines.push('');
    lines.push(email.body);
    lines.push('');
    lines.push('');
  }
  
  return lines.join('\n');
}

function escapeCsvField(field: string): string {
  if (!field) return '';
  
  // If field contains comma, newline, or quote, wrap in quotes and escape internal quotes
  if (field.includes(',') || field.includes('\n') || field.includes('"')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  
  return field;
}
