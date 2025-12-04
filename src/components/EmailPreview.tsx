import { useState } from "react";
import { Mail, Sparkles, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EmailDraft } from "@/types/sponsor";

interface EmailPreviewProps {
  emails: EmailDraft[];
}

export function EmailPreview({ emails }: EmailPreviewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(emails[0]?.sponsorId);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            Generated Emails
          </h3>
          <p className="text-sm text-muted-foreground">
            {emails.length} personalized outreach emails ready
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {emails.map((email, index) => (
          <EmailCard
            key={email.sponsorId}
            email={email}
            isExpanded={expandedId === email.sponsorId}
            onToggle={() => setExpandedId(expandedId === email.sponsorId ? null : email.sponsorId)}
            index={index}
          />
        ))}
      </div>
    </div>
  );
}

function EmailCard({
  email,
  isExpanded,
  onToggle,
  index,
}: {
  email: EmailDraft;
  isExpanded: boolean;
  onToggle: () => void;
  index: number;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="rounded-lg border border-border bg-card overflow-hidden animate-slide-in"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Mail className="h-4 w-4 text-primary" />
          </div>
          <div className="text-left">
            <p className="font-medium text-foreground">{email.sponsorName}</p>
            <p className="text-sm text-muted-foreground truncate max-w-[300px]">
              {email.subject}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "border",
              email.generatedWith === 'ai'
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-muted text-muted-foreground border-border"
            )}
          >
            {email.generatedWith === 'ai' ? (
              <>
                <Sparkles className="h-3 w-3 mr-1" />
                AI Generated
              </>
            ) : (
              "Template"
            )}
          </Badge>
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-border px-4 py-4 space-y-4 animate-fade-in">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Subject Line
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(email.subject)}
                className="h-7 px-2"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-success" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <p className="text-foreground font-medium bg-secondary/50 rounded-lg px-3 py-2">
              {email.subject}
            </p>
          </div>

          {email.subjectVariations.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Subject Variations
              </label>
              <div className="space-y-1.5">
                {email.subjectVariations.map((variation, idx) => (
                  <p
                    key={idx}
                    className="text-sm text-muted-foreground bg-secondary/30 rounded px-3 py-1.5"
                  >
                    {variation}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Email Body
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(email.body)}
                className="h-7 px-2"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-success" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <div className="bg-secondary/50 rounded-lg px-4 py-3 text-sm text-foreground whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto">
              {email.body}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
