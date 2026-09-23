import { useState } from "react";
import { MapPin, Building2, Tag, Sparkles, Search, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { EventDetails, EventSource } from "@/types/sponsor";

interface EventInputFormProps {
  onSubmit: (details: EventDetails) => void;
  isLoading?: boolean;
  initialValues?: EventDetails | null;
}

const eventTypes = [
  "Conference",
  "Trade Show",
  "Summit",
  "Expo",
  "Workshop",
  "Meetup",
  "Networking Event",
  "Hackathon",
  "Awards Ceremony",
];

const industries = [
  "Technology",
  "Healthcare",
  "Finance",
  "Marketing",
  "Education",
  "Real Estate",
  "Manufacturing",
  "Entertainment",
  "Sports",
  "Non-Profit",
];

const focusTagOptions = [
  "Hackathon",
  "Demo Day",
  "Meetup",
  "Workshop",
  "Conference",
  "Founder Night",
  "Networking",
  "Webinar",
];

const sourceOptions: { value: EventSource; label: string; hint: string }[] = [
  { value: "web", label: "Conference sites", hint: "Official event websites" },
  { value: "luma", label: "Luma events", hint: "Professional tech and startup events" },
];

export function EventInputForm({ onSubmit, isLoading, initialValues }: EventInputFormProps) {
  const [selectedSources, setSelectedSources] = useState<EventSource[]>(
    initialValues?.sources?.length ? initialValues.sources : ["web", "luma"]
  );

  const toggleSource = (source: EventSource) => {
    setSelectedSources((prev) =>
      prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]
    );
  };

  const [formData, setFormData] = useState<EventDetails>({
    name: initialValues?.name ?? "",
    type: initialValues?.type ?? "",
    industry: initialValues?.industry ?? "",
    location: initialValues?.location ?? "",
    researchMode: initialValues?.researchMode ?? "mine",
    description: initialValues?.description ?? "",
    focusTags: initialValues?.focusTags ?? [],
  });

  const [eventCount, setEventCount] = useState<number>(initialValues?.eventCount ?? 10);

  const handleChange = (field: keyof EventDetails, value: string | string[] | undefined) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleFocusTag = (tag: string) => {
    setFormData((prev) => {
      const current = prev.focusTags ?? [];
      const lowerTag = tag.toLowerCase();
      if (current.includes(lowerTag)) {
        return { ...prev, focusTags: current.filter((t) => t !== lowerTag) };
      }
      return { ...prev, focusTags: [...current, lowerTag] };
    });
  };

  const isValid =
    formData.name &&
    formData.type &&
    formData.industry &&
    formData.location &&
    selectedSources.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ ...formData, eventCount, sources: selectedSources });
  };

  const similarMode = formData.researchMode === "similar";

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-fade-in">
      <div className="rounded-lg border border-border bg-secondary/30 p-4">
        <Label className="text-foreground text-sm font-medium mb-3 block">What do you want to research?</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleChange("researchMode", "mine")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm font-medium transition-all",
              formData.researchMode === "mine"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-secondary/50"
            )}
          >
            <Search className="h-4 w-4" />
            Find sponsors for my event
          </button>
          <button
            type="button"
            onClick={() => handleChange("researchMode", "similar")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm font-medium transition-all",
              formData.researchMode === "similar"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-secondary/50"
            )}
          >
            <Lightbulb className="h-4 w-4" />
            Find sponsors of similar events
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          {similarMode
            ? "We'll discover complementary events that attract the same audience, then extract their sponsors so you can see who already sponsors events like yours."
            : "We'll search for events matching your details and extract their sponsors."}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name" className="flex items-center gap-2 text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            Event Name
          </Label>
          <Input
            id="name"
            placeholder="e.g., AI Tinkerers"
            value={formData.name}
            onChange={(e) => handleChange("name", e.target.value)}
            className="bg-secondary/50 border-border focus:border-primary"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="type" className="flex items-center gap-2 text-foreground">
            <Tag className="h-4 w-4 text-primary" />
            Event Type
          </Label>
          <Select
            value={formData.type}
            onValueChange={(value) => handleChange("type", value)}
          >
            <SelectTrigger className="bg-secondary/50 border-border focus:border-primary">
              <SelectValue placeholder="Select event type" />
            </SelectTrigger>
            <SelectContent>
              {eventTypes.map((type) => (
                <SelectItem key={type} value={type.toLowerCase()}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="industry" className="flex items-center gap-2 text-foreground">
            <Building2 className="h-4 w-4 text-primary" />
            Industry
          </Label>
          <Select
            value={formData.industry}
            onValueChange={(value) => handleChange("industry", value)}
          >
            <SelectTrigger className="bg-secondary/50 border-border focus:border-primary">
              <SelectValue placeholder="Select industry" />
            </SelectTrigger>
            <SelectContent>
              {industries.map((industry) => (
                <SelectItem key={industry} value={industry.toLowerCase()}>
                  {industry}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="location" className="flex items-center gap-2 text-foreground">
            <MapPin className="h-4 w-4 text-primary" />
            Location
          </Label>
          <Input
            id="location"
            placeholder="e.g., San Francisco, CA"
            value={formData.location}
            onChange={(e) => handleChange("location", e.target.value)}
            className="bg-secondary/50 border-border focus:border-primary"
          />
        </div>

      </div>

      {similarMode && (
        <div className="space-y-4 rounded-lg border border-border bg-card p-4 animate-fade-in">
          <div className="space-y-2">
            <Label htmlFor="description" className="text-foreground">
              Event description / audience
            </Label>
            <Textarea
              id="description"
              placeholder="e.g., A monthly gathering of AI builders, tinkerers, and founders who demo side projects and LLM experiments."
              value={formData.description ?? ""}
              onChange={(e) => handleChange("description", e.target.value)}
              className="bg-secondary/50 border-border focus:border-primary min-h-[80px]"
            />
            <p className="text-xs text-muted-foreground">
              This helps us find events with a matching audience.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Complementary event formats</Label>
            <div className="flex flex-wrap gap-2">
              {focusTagOptions.map((tag) => {
                const active = (formData.focusTags ?? []).includes(tag.toLowerCase());
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleFocusTag(tag)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-secondary text-muted-foreground hover:bg-secondary/80"
                    )}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <Label className="text-foreground text-sm font-medium">Where to search</Label>
        <div className="grid gap-2 sm:grid-cols-3">
          {sourceOptions.map((option) => {
            const active = selectedSources.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggleSource(option.value)}
                className={cn(
                  "rounded-md border px-3 py-2.5 text-left transition-all",
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:bg-secondary/50"
                )}
              >
                <span className={cn("block text-sm font-medium", active ? "text-primary" : "text-foreground")}>
                  {option.label}
                </span>
                <span className="block text-xs text-muted-foreground mt-0.5">{option.hint}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          We search conference websites and Luma for professional tech events. You can also paste any
          event link directly on the next screen.
        </p>
      </div>

      <div className="space-y-3">
        <Label className="text-foreground text-sm font-medium">Number of events</Label>
        <div className="flex items-center gap-2">
          {[5, 10].map((count) => (
            <Button
              key={count}
              type="button"
              variant={eventCount === count ? "default" : "outline"}
              size="sm"
              onClick={() => setEventCount(count)}
            >
              {count}
            </Button>
          ))}
        </div>
      </div>

      <Button
        type="submit"
        disabled={!isValid || isLoading}
        variant="gradient"
        size="lg"
        className="w-full"
      >
        {isLoading ? (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Discovering Events...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            {similarMode ? "Find Similar Events" : "Start Discovery"}
          </>
        )}
      </Button>
    </form>
  );
}
