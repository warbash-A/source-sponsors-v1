import { Building2, Globe, Linkedin, Mail, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EnrichedSponsor } from "@/types/sponsor";

interface SponsorListProps {
  sponsors: EnrichedSponsor[];
  showEnrichment?: boolean;
}

const tierConfig = {
  platinum: { label: "Platinum", color: "bg-[hsl(45,100%,60%)]/20 text-[hsl(45,100%,70%)] border-[hsl(45,100%,60%)]/30" },
  gold: { label: "Gold", color: "bg-warning/20 text-warning border-warning/30" },
  silver: { label: "Silver", color: "bg-muted text-muted-foreground border-border" },
  bronze: { label: "Bronze", color: "bg-[hsl(25,70%,50%)]/20 text-[hsl(25,70%,60%)] border-[hsl(25,70%,50%)]/30" },
  unknown: { label: "Sponsor", color: "bg-secondary text-secondary-foreground border-border" },
};

export function SponsorList({ sponsors, showEnrichment = false }: SponsorListProps) {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            {showEnrichment ? "Enriched Sponsors" : "Identified Sponsors"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {sponsors.length} unique sponsors across all events
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Company
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Tier
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Events
                </th>
                {showEnrichment && (
                  <>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Contacts
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sponsors.map((sponsor, index) => {
                const tier = tierConfig[sponsor.tier];
                
                return (
                  <tr
                    key={sponsor.id}
                    className="bg-card hover:bg-secondary/30 transition-colors animate-slide-in"
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                          {sponsor.logo ? (
                            <img
                              src={sponsor.logo}
                              alt={sponsor.name}
                              className="h-6 w-6 object-contain"
                            />
                          ) : (
                            <Building2 className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{sponsor.name}</p>
                          {sponsor.website && (
                            <a
                              href={sponsor.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                            >
                              <Globe className="h-3 w-3" />
                              {sponsor.domain || new URL(sponsor.website).hostname}
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={cn("border", tier.color)}>
                        {tier.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-muted-foreground">
                        {sponsor.events.length} event{sponsor.events.length !== 1 ? 's' : ''}
                      </span>
                    </td>
                    {showEnrichment && (
                      <>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {sponsor.emails.length > 0 && (
                              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Mail className="h-3.5 w-3.5" />
                                {sponsor.emails.length}
                              </span>
                            )}
                            {sponsor.linkedinUrl && (
                              <a
                                href={sponsor.linkedinUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-primary"
                              >
                                <Linkedin className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <EnrichmentStatusBadge status={sponsor.enrichmentStatus} />
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function EnrichmentStatusBadge({ status }: { status: EnrichedSponsor['enrichmentStatus'] }) {
  const config = {
    pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
    processing: { label: "Processing", className: "bg-primary/20 text-primary" },
    complete: { label: "Complete", className: "bg-success/20 text-success" },
    failed: { label: "Failed", className: "bg-destructive/20 text-destructive" },
  };

  const { label, className } = config[status];

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium", className)}>
      {status === 'processing' && <Loader2 className="h-3 w-3 animate-spin" />}
      {label}
    </span>
  );
}
