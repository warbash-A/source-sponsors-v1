import { ExternalLink, Calendar, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DiscoveredEvent } from "@/types/sponsor";

interface EventDiscoveryResultsProps {
  events: DiscoveredEvent[];
  selectedEvents: string[];
  onToggleEvent: (eventId: string) => void;
  dataSource: 'eventbrite' | 'apify' | 'sample';
}

const sourceLabels = {
  eventbrite: { label: "Eventbrite API", color: "bg-success/20 text-success border-success/30" },
  apify: { label: "Web Scraper", color: "bg-warning/20 text-warning border-warning/30" },
  sample: { label: "Demo Data", color: "bg-muted text-muted-foreground border-border" },
};

export function EventDiscoveryResults({
  events,
  selectedEvents,
  onToggleEvent,
  dataSource,
}: EventDiscoveryResultsProps) {
  const sourceInfo = sourceLabels[dataSource];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            Discovered Events
          </h3>
          <p className="text-sm text-muted-foreground">
            {events.length} similar events found
          </p>
        </div>
        <Badge variant="outline" className={cn("border", sourceInfo.color)}>
          {sourceInfo.label}
        </Badge>
      </div>

      <div className="grid gap-3">
        {events.map((event, index) => {
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
                  <div className="flex items-center gap-2">
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
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {event.sponsorCount} sponsors
                      </span>
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
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
