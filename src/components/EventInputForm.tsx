import { useState } from "react";
import { MapPin, Building2, Tag, Sparkles, User, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EventDetails } from "@/types/sponsor";

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

export function EventInputForm({ onSubmit, isLoading, initialValues }: EventInputFormProps) {
  const [formData, setFormData] = useState<EventDetails>({
    name: initialValues?.name ?? "",
    type: initialValues?.type ?? "",
    industry: initialValues?.industry ?? "",
    location: initialValues?.location ?? "",
    senderName: initialValues?.senderName ?? "",
    senderOrganization: initialValues?.senderOrganization ?? "",
  });

  const [sources, setSources] = useState<('eventbrite' | 'meetup')[]>(
    initialValues?.sources?.length ? initialValues.sources : ['meetup']
  );
  const [eventCount, setEventCount] = useState<number>(initialValues?.eventCount ?? 10);


  const handleChange = (field: keyof EventDetails, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSourceToggle = (source: 'eventbrite' | 'meetup') => {
    setSources((prev) =>
      prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]
    );
  };

  const isValid =
    formData.name &&
    formData.type &&
    formData.industry &&
    formData.location &&
    formData.senderName?.trim() &&
    sources.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ ...formData, sources, eventCount });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-fade-in">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name" className="flex items-center gap-2 text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            Event Name
          </Label>
          <Input
            id="name"
            placeholder="e.g., TechCrunch Disrupt 2024"
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

        <div className="space-y-2">
          <Label htmlFor="senderName" className="flex items-center gap-2 text-foreground">
            <User className="h-4 w-4 text-primary" />
            Your Name
          </Label>
          <Input
            id="senderName"
            placeholder="e.g., Alex Rivera"
            value={formData.senderName ?? ""}
            onChange={(e) => handleChange("senderName", e.target.value)}
            className="bg-secondary/50 border-border focus:border-primary"
          />
          <p className="text-xs text-muted-foreground">Used to sign your outreach emails.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="senderOrganization" className="flex items-center gap-2 text-foreground">
            <Briefcase className="h-4 w-4 text-primary" />
            Your Company <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="senderOrganization"
            placeholder="e.g., SponsorScout"
            value={formData.senderOrganization ?? ""}
            onChange={(e) => handleChange("senderOrganization", e.target.value)}
            className="bg-secondary/50 border-border focus:border-primary"
          />
        </div>

      </div>

      <div className="space-y-3">
        <Label className="text-foreground text-sm font-medium">Search Sources</Label>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Checkbox
              id="source-eventbrite"
              checked={sources.includes('eventbrite')}
              onCheckedChange={() => handleSourceToggle('eventbrite')}
            />
            <Label htmlFor="source-eventbrite" className="text-sm cursor-pointer">
              Eventbrite <span className="text-muted-foreground">(your account only)</span>
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="source-meetup"
              checked={sources.includes('meetup')}
              onCheckedChange={() => handleSourceToggle('meetup')}
            />
            <Label htmlFor="source-meetup" className="text-sm cursor-pointer">
              Meetup <span className="text-muted-foreground">(public events)</span>
            </Label>
          </div>
        </div>
        {sources.length === 0 && (
          <p className="text-xs text-muted-foreground">Select at least one source</p>
        )}
        {sources.includes('eventbrite') && (
          <p className="text-xs text-muted-foreground">
            Eventbrite no longer allows searching public events, so it only returns events from your
            own Eventbrite account. Meetup covers public events.
          </p>
        )}
      </div>

      <div className="space-y-3">
        <Label className="text-foreground text-sm font-medium">Number of events</Label>
        <div className="flex items-center gap-2">
          {[5, 10, 25, 50].map((count) => (
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
            Start Discovery
          </>
        )}
      </Button>
    </form>
  );
}
