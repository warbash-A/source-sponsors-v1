import { Database, Globe, Beaker, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface DataSourceIndicatorProps {
  source: 'eventbrite' | 'apify' | 'sample';
  fallbackReason?: string;
}

const sourceConfig = {
  eventbrite: {
    icon: Database,
    label: "Eventbrite API",
    sublabel: "Primary data source",
    color: "text-success",
    bgColor: "bg-success/10",
    borderColor: "border-success/30",
  },
  apify: {
    icon: Globe,
    label: "Web Scraper",
    sublabel: "Secondary fallback",
    color: "text-warning",
    bgColor: "bg-warning/10",
    borderColor: "border-warning/30",
  },
  sample: {
    icon: Beaker,
    label: "Demo Mode",
    sublabel: "Sample data for testing",
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    borderColor: "border-border",
  },
};

export function DataSourceIndicator({ source, fallbackReason }: DataSourceIndicatorProps) {
  const config = sourceConfig[source];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-4 py-3",
        config.bgColor,
        config.borderColor
      )}
    >
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", config.bgColor)}>
        <Icon className={cn("h-5 w-5", config.color)} />
      </div>
      <div className="flex-1">
        <p className={cn("font-medium", config.color)}>{config.label}</p>
        <p className="text-xs text-muted-foreground">{config.sublabel}</p>
      </div>
      {fallbackReason && source !== 'eventbrite' && (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground max-w-[200px]">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{fallbackReason}</span>
        </div>
      )}
    </div>
  );
}
