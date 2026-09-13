import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { aiExtract, AiGatewayError } from "../_shared/ai-extract.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EMAIL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['subject', 'body'],
  properties: {
    subject: { type: 'string' },
    body: { type: 'string' },
  },
};

interface EnrichedSponsor {
  id: string;
  name: string;
  tier: string;
  website?: string;
  domain?: string;
  emails: string[];
  eventIds: string[];
  eventCount: number;
}

interface EmailRequest {
  sponsors: EnrichedSponsor[];
  eventName: string;
  senderName: string;
  senderOrganization?: string;
  template?: 'partnership' | 'sponsorship' | 'collaboration';
}

interface EmailDraft {
  sponsorId: string;
  sponsorName: string;
  to: string;
  subject: string;
  body: string;
  status: 'draft' | 'generated';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sponsors, eventName, senderName, senderOrganization, template = 'partnership' }: EmailRequest = await req.json();
    console.log('Email generation for sponsors:', sponsors.length);

    const emails: EmailDraft[] = [];
    const eventLabel = eventName?.trim() || 'your upcoming events';
    let aiCount = 0;
    let aiMessage: string | undefined;

    for (const sponsor of sponsors) {
      console.log('Generating email for:', sponsor.name);

      const primaryEmail = sponsor.emails[0] || `contact@${sponsor.domain || 'company.com'}`;

      let subject = generateSubject(sponsor, eventLabel, template);
      let emailBody = generateTemplateEmail(sponsor, eventLabel, senderName, senderOrganization, template);

      if (!aiMessage) {
        try {
          const generated = await aiExtract<{ subject: string; body: string }>({
            name: 'outreach_email',
            schema: EMAIL_SCHEMA as unknown as Record<string, unknown>,
            instructions:
              'You write professional, personalised sponsorship outreach emails. Keep the body under 180 words, concrete and genuine, never generic filler. Sign off with the sender name. Return a subject line and a plain-text body.',
            content: buildEmailPrompt(sponsor, eventLabel, senderName, senderOrganization, template),
          });
          if (generated.subject?.trim() && generated.body?.trim()) {
            subject = generated.subject.trim();
            emailBody = generated.body.trim();
            aiCount++;
          }
        } catch (error) {
          if (error instanceof AiGatewayError) {
            aiMessage =
              error.status === 402
                ? 'AI credits are exhausted, so the remaining emails use the built-in template.'
                : error.status === 429
                  ? 'Rate limited by the AI service, so the remaining emails use the built-in template.'
                  : 'AI writing was unavailable, so the built-in template was used.';
            console.error('AI email generation blocked:', error.status, error.message);
          } else {
            console.error('Email generation error:', error);
          }
        }
      }

      emails.push({
        sponsorId: sponsor.id,
        sponsorName: sponsor.name,
        to: primaryEmail,
        subject,
        body: emailBody,
        status: 'generated',
      });
    }

    return new Response(JSON.stringify({
      emails,
      totalGenerated: emails.length,
      usedAI: aiCount > 0,
      aiGenerated: aiCount,
      message: aiMessage,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in email-generation:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function buildEmailPrompt(
  sponsor: EnrichedSponsor, 
  eventName: string, 
  senderName: string, 
  senderOrganization?: string,
  template?: string
): string {
  const tierContext = sponsor.tier !== 'unknown' 
    ? `They have been a ${sponsor.tier} tier sponsor at ${sponsor.eventCount} event(s).` 
    : `They have sponsored ${sponsor.eventCount} event(s) in this space.`;

  return `Write a professional outreach email for a ${template || 'partnership'} inquiry.

Details:
- Recipient company: ${sponsor.name}
- Their website: ${sponsor.website || sponsor.domain || 'N/A'}
- ${tierContext}
- Event/organization context: ${eventName}
- Sender: ${senderName}${senderOrganization ? ` from ${senderOrganization}` : ''}

Write a personalized email that:
1. Has a compelling subject line
2. Mentions their past sponsorship involvement naturally
3. Proposes a clear value proposition for partnership
4. Is warm but professional
5. Has a clear call to action

Format your response as:
SUBJECT: [subject line]
BODY:
[email body]`;
}

function parseEmailContent(content: string): { subject?: string; body?: string } {
  const subjectMatch = content.match(/SUBJECT:\s*(.+?)(?:\n|BODY:)/i);
  const bodyMatch = content.match(/BODY:\s*([\s\S]+)/i);
  
  return {
    subject: subjectMatch?.[1]?.trim(),
    body: bodyMatch?.[1]?.trim() || content,
  };
}

function generateSubject(sponsor: EnrichedSponsor, eventName: string, template: string): string {
  const subjects = {
    partnership: `Partnership Opportunity - ${eventName}`,
    sponsorship: `Sponsorship Discussion - ${sponsor.name} x ${eventName}`,
    collaboration: `Collaboration Proposal for ${sponsor.name}`,
  };
  return subjects[template as keyof typeof subjects] || subjects.partnership;
}

function generateTemplateEmail(
  sponsor: EnrichedSponsor, 
  eventName: string, 
  senderName: string, 
  senderOrganization?: string,
  template?: string
): string {
  const tierMention = sponsor.tier !== 'unknown' 
    ? `I noticed ${sponsor.name} has been an active ${sponsor.tier} tier sponsor in the industry` 
    : `I noticed ${sponsor.name} has been actively supporting events in this space`;

  return `Hi there,

I hope this email finds you well. My name is ${senderName}${senderOrganization ? ` from ${senderOrganization}` : ''}.

${tierMention}, and I wanted to reach out about a potential ${template || 'partnership'} opportunity related to ${eventName}.

We believe there could be excellent synergies between our organizations, and I'd love to explore how we might work together to create mutual value.

Would you be open to a brief call this week or next to discuss further? I'm happy to work around your schedule.

Looking forward to hearing from you.

Best regards,
${senderName}${senderOrganization ? `\n${senderOrganization}` : ''}`;
}
