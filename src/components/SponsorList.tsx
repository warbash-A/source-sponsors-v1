import { useState, useMemo } from "react";
import { Building2, Globe, Linkedin, Mail, ArrowUpDown, Filter, Download } from "lucide-react";
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
  onDownload?: () => void;
  isDownloading?: boolean;
}

const tierConfig = {
  platinum: { label: "Platinum", color: "bg-[hsl(45,100%,60%)]/20 text-[hsl(45,100%,70%)] border-[hsl(45,100%,60%)]/30", order: 1 },
  gold: { label: "Gold", color: "bg-warning/20 text-warning border-warning/30", order: 2 },
  silver: { label: "Silver", color: "bg-muted text-muted-foreground border-border", order: 3 },
  bronze: { label: "Bronze", color: "bg-[hsl(25,70%,50%)]/20 text-[hsl(25,70%,60%)] border-[hsl(25,70%,50%)]/30", order: 4 },
  unknown: { label: "Sponsor", color: "bg-secondary text-secondary-foreground border-border", order: 5 },
};

type TierFilter = "all" | keyof typeof tierConfig;
type SortOption = "name" | "tier" | "events";
type MinEventsFilter = "all" | "2" | "3" | "4" | "5";

export function SponsorList({ sponsors, showEnrichment = false, onDownload, isDownloading = false }: SponsorListProps) {
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("events");
  const [sortAsc, setSortAsc] = useState(false);
  const [minEventsFilter, setMinEventsFilter] = useState<MinEventsFilter>("all");

  const maxEventCount = useMemo(() => {
    return Math.max(1, ...sponsors.map((s) => s.eventCount ?? s.events.length ?? 1));
  }, [sponsors]);

  const filteredAndSortedSponsors = useMemo(() => {
    let result = [...sponsors];

    // Apply tier filter
    if (tierFilter !== "all") {
      result = result.filter((s) => s.tier === tierFilter);
    }

    // Apply minimum events filter
    if (minEventsFilter !== "all") {
      const min = parseInt(minEventsFilter, 10);
      result = result.filter((s) => (s.eventCount ?? s.events.length ?? 0) >= min);
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
          comparison = (b.eventCount ?? b.events.length ?? 0) - (a.eventCount ?? a.events.length ?? 0);
          break;
      }
      return sortAsc ? comparison : -comparison;
    });

    return result;
  }, [sponsors, tierFilter, sortBy, sortAsc, minEventsFilter]);

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
          {onDownload && (
            <button
              onClick={onDownload}
              disabled={isDownloading || sponsors.length === 0}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded border border-primary/40 bg-primary/10 hover:bg-primary/20 text-xs font-medium text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDownloading ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {isDownloading ? "Downloading..." : "Download List"}
            </button>
          )}
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

          {maxEventCount > 1 && (
            <Select value={minEventsFilter} onValueChange={(v) => setMinEventsFilter(v as MinEventsFilter)}>
              <SelectTrigger className="w-[140px] h-8 text-xs bg-card border-border">
                <SelectValue placeholder="Min events" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="all">All events</SelectItem>
                <SelectItem value="2">2+ events</SelectItem>
                {maxEventCount >= 3 && <SelectItem value="3">3+ events</SelectItem>}
                {maxEventCount >= 4 && <SelectItem value="4">4+ events</SelectItem>}
                {maxEventCount >= 5 && <SelectItem value="5">5+ events</SelectItem>}
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Contacts
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredAndSortedSponsors.map((sponsor, index) => {
                const tier = tierConfig[sponsor.tier];
                const eventCount = sponsor.eventCount ?? sponsor.events.length ?? 0;

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
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground">{sponsor.name}</p>
                            {eventCount > 1 && (
                              <Badge variant="outline" className="border-success/30 bg-success/10 text-success text-[10px] px-1.5 py-0">
                                {eventCount} events
                              </Badge>
                            )}
                          </div>
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
                              <span
                                className="flex items-center gap-1 text-sm text-muted-foreground"
                                title={(sponsor.emailDetails ?? []).map((e) => `${e.email}${e.verified ? '' : ' (guess)'}`).join('\n')}
                              >
                                <Mail className="h-3.5 w-3.5" />
                                {sponsor.emails.length}
                              </span>
                            )}
                            {(sponsor.emailDetails?.length ?? 0) > 0 && (
                              sponsor.emailDetails!.some((e) => e.verified) ? (
                                <Badge variant="outline" className="border-success/30 bg-success/10 text-success text-[10px] px-1.5 py-0">
                                  Verified
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning text-[10px] px-1.5 py-0">
                                  Guessed
                                </Badge>
                              )
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
