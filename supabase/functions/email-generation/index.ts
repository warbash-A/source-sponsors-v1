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

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const emails: EmailDraft[] = [];

    for (const sponsor of sponsors) {
      console.log('Generating email for:', sponsor.name);
      
      const primaryEmail = sponsor.emails[0] || `contact@${sponsor.domain || 'company.com'}`;
      
      let emailBody: string;
      let subject: string;

      if (ANTHROPIC_API_KEY) {
        try {
          const prompt = buildEmailPrompt(sponsor, eventName, senderName, senderOrganization, template);

          const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": ANTHROPIC_API_KEY,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-6",
              max_tokens: 500,
              system: "You are an expert at writing professional, personalized business outreach emails. Write concise, compelling emails that feel genuine and not generic. Keep emails under 200 words.",
              messages: [{ role: "user", content: prompt }],
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const generatedContent = data.content[0]?.text || '';
            const parsed = parseEmailContent(generatedContent);
            subject = parsed.subject || generateSubject(sponsor, eventName, template);
            emailBody = parsed.body || generateTemplateEmail(sponsor, eventName, senderName, senderOrganization, template);
          } else {
            console.log('Anthropic API failed with status:', response.status);
            subject = generateSubject(sponsor, eventName, template);
            emailBody = generateTemplateEmail(sponsor, eventName, senderName, senderOrganization, template);
          }
        } catch (error) {
          console.error('Anthropic generation error:', error);
          subject = generateSubject(sponsor, eventName, template);
          emailBody = generateTemplateEmail(sponsor, eventName, senderName, senderOrganization, template);
        }
      } else {
        // No API key, use template
        subject = generateSubject(sponsor, eventName, template);
        emailBody = generateTemplateEmail(sponsor, eventName, senderName, senderOrganization, template);
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
      usedAI: !!ANTHROPIC_API_KEY,
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
