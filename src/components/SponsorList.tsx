import { useState, useMemo } from "react";
import { Building2, Globe, Linkedin, Mail, Loader2, ArrowUpDown, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EnrichedSponsor } from "@/types/sponsor";

interface SponsorListProps {
  sponsors: EnrichedSponsor[];
  showEnrichment?: boolean;
}

const tierConfig = {
  platinum: { label: "Platinum", color: "bg-[hsl(45,100%,60%)]/20 text-[hsl(45,100%,70%)] border-[hsl(45,100%,60%)]/30", order: 1 },
  gold: { label: "Gold", color: "bg-warning/20 text-warning border-warning/30", order: 2 },
  silver: { label: "Silver", color: "bg-muted text-muted-foreground border-border", order: 3 },
  bronze: { label: "Bronze", color: "bg-[hsl(25,70%,50%)]/20 text-[hsl(25,70%,60%)] border-[hsl(25,70%,50%)]/30", order: 4 },
  unknown: { label: "Sponsor", color: "bg-secondary text-secondary-foreground border-border", order: 5 },
};

type TierFilter = "all" | keyof typeof tierConfig;
type StatusFilter = "all" | EnrichedSponsor["enrichmentStatus"];
type SortOption = "name" | "tier" | "events" | "status";

export function SponsorList({ sponsors, showEnrichment = false }: SponsorListProps) {
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("tier");
  const [sortAsc, setSortAsc] = useState(true);

  const filteredAndSortedSponsors = useMemo(() => {
    let result = [...sponsors];

    // Apply tier filter
    if (tierFilter !== "all") {
      result = result.filter((s) => s.tier === tierFilter);
    }

    // Apply status filter
    if (statusFilter !== "all" && showEnrichment) {
      result = result.filter((s) => s.enrichmentStatus === statusFilter);
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "tier":
          comparison = tierConfig[a.tier].order - tierConfig[b.tier].order;
          break;
        case "events":
          comparison = b.events.length - a.events.length;
          break;
        case "status":
          const statusOrder = { complete: 1, partial: 2, processing: 3, pending: 4, failed: 5 };
          comparison = statusOrder[a.enrichmentStatus] - statusOrder[b.enrichmentStatus];
          break;
      }
      return sortAsc ? comparison : -comparison;
    });

    return result;
  }, [sponsors, tierFilter, statusFilter, sortBy, sortAsc, showEnrichment]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            {showEnrichment ? "Enriched Sponsors" : "Identified Sponsors"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {filteredAndSortedSponsors.length} of {sponsors.length} sponsors
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={tierFilter} onValueChange={(v) => setTierFilter(v as TierFilter)}>
              <SelectTrigger className="w-[120px] h-8 text-xs bg-card border-border">
                <SelectValue placeholder="Tier" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="all">All Tiers</SelectItem>
                <SelectItem value="platinum">Platinum</SelectItem>
                <SelectItem value="gold">Gold</SelectItem>
                <SelectItem value="silver">Silver</SelectItem>
                <SelectItem value="bronze">Bronze</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showEnrichment && (
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-[120px] h-8 text-xs bg-card border-border">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="w-[120px] h-8 text-xs bg-card border-border">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="tier">Tier</SelectItem>
                <SelectItem value="events">Events</SelectItem>
                {showEnrichment && <SelectItem value="status">Status</SelectItem>}
              </SelectContent>
            </Select>
            <button
              onClick={() => setSortAsc(!sortAsc)}
              className="h-8 px-2 rounded border border-border bg-card hover:bg-secondary/50 text-xs text-muted-foreground"
            >
              {sortAsc ? "↑" : "↓"}
            </button>
          </div>
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
              {filteredAndSortedSponsors.map((sponsor, index) => {
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
                      <div className="flex flex-col gap-1">
                        {sponsor.events.length > 0 ? (
                          sponsor.events.map((event, idx) => (
                            <span key={idx} className="text-sm text-muted-foreground">
                              {event}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </div>
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
    partial: { label: "Partial", className: "bg-warning/20 text-warning" },
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
