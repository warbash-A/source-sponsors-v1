import { useState } from "react";
import { ExternalLink, Calendar, MapPin, Users, Plus, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DiscoveredEvent } from "@/types/sponsor";

const sourceLabels: Record<string, string> = {
  manual: 'Manual',
  meetup: 'Meetup',
  web: 'Conference site',
  directory: 'Directory',
};

interface EventDiscoveryResultsProps {
  events: DiscoveredEvent[];
  selectedEvents: string[];
  onToggleEvent: (eventId: string) => void;
  isLoading: boolean;
  researchMode?: 'mine' | 'similar';
  searchQueries?: string[];
  onAddEventFromUrl?: (url: string) => void | Promise<void>;
}

export function EventDiscoveryResults({
  events,
  selectedEvents,
  onToggleEvent,
  isLoading,
  researchMode = 'mine',
  searchQueries = [],
  onAddEventFromUrl,
}: EventDiscoveryResultsProps) {
  const [manualUrl, setManualUrl] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAddUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualUrl.trim() || !onAddEventFromUrl) return;
    setAdding(true);
    try {
      await onAddEventFromUrl(manualUrl.trim());
      setManualUrl("");
    } finally {
      setAdding(false);
    }
  };

  const similarMode = researchMode === 'similar';

  const groupedEvents = events.reduce<Record<string, DiscoveredEvent[]>>((acc, event) => {
    const key = event.query || event.source || 'Events';
    if (!acc[key]) acc[key] = [];
    acc[key].push(event);
    return acc;
  }, {});

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {events.length} event{events.length === 1 ? '' : 's'} found
        </p>
        <p className="text-sm font-medium text-foreground">
          {selectedEvents.length} selected
        </p>
      </div>

      {similarMode && searchQueries.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Search queries used</p>
          <div className="flex flex-wrap gap-2">
            {searchQueries.map((query) => (
              <Badge
                key={query}
                variant="outline"
                className="border-primary/30 bg-primary/10 text-primary"
              >
                {query}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {onAddEventFromUrl && (
        <form onSubmit={handleAddUrl} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="url"
              placeholder="Paste an event URL (Meetup, Luma, conference site...)"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              className="pl-9 bg-secondary/50 border-border focus:border-primary"
            />
          </div>
          <Button
            type="submit"
            disabled={!manualUrl.trim() || adding || isLoading}
            variant="outline"
            size="sm"
          >
            {adding ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Plus className="h-4 w-4 mr-1" />
            )}
            Add
          </Button>
        </form>
      )}

      <div className="space-y-4">
        {similarMode && (
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Similar Events</h3>
            {isPrescanning && (
              <span className="text-xs text-muted-foreground">Checking sponsor counts…</span>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            {similarMode
              ? "No similar events found yet. Try adding a description, changing focus tags, or paste event URLs above."
              : "No events found."}
          </p>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedEvents).map(([group, groupEvents]) => (
              <div key={group} className="space-y-3">
                {similarMode && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {group === 'manual' ? 'Added manually' : `Query: ${group}`}
                    </span>
                    <Badge variant="outline" className="text-[10px] border-border bg-secondary text-muted-foreground">
                      {groupEvents.length}
                    </Badge>
                  </div>
                )}
                <div className="grid gap-3">
                  {groupEvents.map((event, index) => {
                    const isSelected = selectedEvents.includes(event.id);
                    return (
                      <div
                        key={event.id}
                        onClick={() => onToggleEvent(event.id)}
                        className={cn(
                          "group relative cursor-pointer rounded-lg border p-4 transition-all duration-200 animate-slide-in",
                          isSelected
                            ? "border-primary bg-primary/5 shadow-glow"
                            : "border-border bg-card hover:border-primary/50 hover:bg-secondary/30"
                        )}
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-medium text-foreground group-hover:text-primary transition-colors">
                                {event.name}
                              </h4>
                              {event.url && (
                                <a
                                  href={event.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-muted-foreground hover:text-primary"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              )}
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px]",
                                  event.source === 'manual'
                                    ? "border-warning/30 bg-warning/10 text-warning"
                                    : "border-primary/30 bg-primary/10 text-primary"
                                )}
                              >
                                {sourceLabels[event.source] ?? 'Event'}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
                                {event.date}
                              </span>
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {event.location}
                              </span>
                              {event.sponsorCount !== undefined && (
                                <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                                  <Users className="h-3.5 w-3.5 mr-1" />
                                  {event.sponsorCount} sponsors
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all",
                              isSelected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border"
                            )}
                          >
                            {isSelected && (
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
