import { ExternalLink, Calendar, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DiscoveredEvent } from "@/types/sponsor";

interface EventDiscoveryResultsProps {
  eventbriteEvents: DiscoveredEvent[];
  meetupEvents: DiscoveredEvent[];
  selectedEvents: string[];
  onToggleEvent: (eventId: string) => void;
  isLoadingEventbrite: boolean;
  isLoadingMeetup: boolean;
  showEventbrite: boolean;
  showMeetup: boolean;
}

const sourceLabels = {
  eventbrite: { label: "Eventbrite API", color: "bg-success/20 text-success border-success/30" },
  apify: { label: "Web Scraper", color: "bg-warning/20 text-warning border-warning/30" },
  sample: { label: "Demo Data", color: "bg-muted text-muted-foreground border-border" },
  meetup: { label: "Meetup", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
};

function EventSection({
  title,
  events,
  selectedEvents,
  onToggleEvent,
  isLoading,
  emptyText,
  sourceKey,
}: {
  title: string;
  events: DiscoveredEvent[];
  selectedEvents: string[];
  onToggleEvent: (id: string) => void;
  isLoading: boolean;
  emptyText: string;
  sourceKey: keyof typeof sourceLabels;
}) {
  const sourceInfo = sourceLabels[sourceKey] ?? sourceLabels.sample;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <Badge variant="outline" className={cn("border", sourceInfo.color)}>
          {sourceInfo.label}
        </Badge>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">{emptyText}</p>
      ) : (
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
      )}
    </div>
  );
}

export function EventDiscoveryResults({
  eventbriteEvents,
  meetupEvents,
  selectedEvents,
  onToggleEvent,
  isLoadingEventbrite,
  isLoadingMeetup,
  showEventbrite,
  showMeetup,
}: EventDiscoveryResultsProps) {
  const totalCount = eventbriteEvents.length + meetupEvents.length;

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {totalCount} similar events found
        </p>
        <p className="text-sm font-medium text-foreground">
          {selectedEvents.length} selected
        </p>
      </div>
      {showEventbrite && (
        <EventSection
          title="Eventbrite Events"
          events={eventbriteEvents}
          selectedEvents={selectedEvents}
          onToggleEvent={onToggleEvent}
          isLoading={isLoadingEventbrite}
          emptyText="No Eventbrite events found."
          sourceKey="eventbrite"
        />
      )}
      {showMeetup && (
        <EventSection
          title="Meetup Events"
          events={meetupEvents}
          selectedEvents={selectedEvents}
          onToggleEvent={onToggleEvent}
          isLoading={isLoadingMeetup}
          emptyText="No sponsored Meetup events found."
          sourceKey="meetup"
        />
      )}
    </div>
  );
}
