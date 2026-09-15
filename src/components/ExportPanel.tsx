import { FileSpreadsheet, FileText, Mail, Download, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ExportFormat } from "@/types/sponsor";

interface ExportPanelProps {
  onExport: (format: ExportFormat) => void;
  exportingFormat: ExportFormat | null;
  completedFormats: ExportFormat[];
}

const exportOptions = [
  {
    format: 'csv' as ExportFormat,
    icon: FileText,
    title: 'CSV Export',
    description: 'Single file with all sponsor data',
    details: ['All contact information', 'Event associations', 'Enrichment status'],
  },
  {
    format: 'excel' as ExportFormat,
    icon: FileSpreadsheet,
    title: 'Excel Workbook',
    description: 'Multi-sheet comprehensive export',
    details: [
      'Sheet 1: Event Details',
      'Sheet 2: Sponsor Database',
      'Sheet 3: Email Drafts',
      'Sheet 4: Analytics',
    ],
  },
  {
    format: 'email-templates' as ExportFormat,
    icon: Mail,
    title: 'Email Templates',
    description: 'Individual .txt files per sponsor',
    details: ['Ready-to-send format', 'Personalized content', 'Subject lines included'],
  },
];

export function ExportPanel({
  onExport,
  exportingFormat,
  completedFormats,
}: ExportPanelProps) {
  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h3 className="text-lg font-semibold text-foreground">
          Export Your Data
        </h3>
        <p className="text-sm text-muted-foreground">
          Download your research in multiple formats
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {exportOptions
          .filter(({ format }) => format !== 'email-templates')
          .map(({ format, icon: Icon, title, description, details }, index) => {
          const isExporting = exportingFormat === format;
          const isComplete = completedFormats.includes(format);

          return (
            <div
              key={format}
              className={cn(
                "relative rounded-lg border p-4 transition-all duration-200 animate-slide-in",
                isComplete
                  ? "border-success bg-success/5"
                  : "border-border bg-card hover:border-primary/50"
              )}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg",
                      isComplete ? "bg-success/20" : "bg-primary/10"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-5 w-5",
                        isComplete ? "text-success" : "text-primary"
                      )}
                    />
                  </div>
                  {isComplete && (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-success">
                      <Check className="h-3.5 w-3.5 text-success-foreground" />
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="font-medium text-foreground">{title}</h4>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>

                <ul className="space-y-1">
                  {details.filter((d) => !/email/i.test(d)).map((detail, idx) => (
                    <li
                      key={idx}
                      className="text-xs text-muted-foreground flex items-center gap-1.5"
                    >
                      <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                      {detail}
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => onExport(format)}
                  disabled={isExporting}
                  variant={isComplete ? "outline" : "default"}
                  size="sm"
                  className="w-full"
                >
                  {isExporting ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Exporting...
                    </>
                  ) : isComplete ? (
                    <>
                      <Download className="h-3.5 w-3.5" />
                      Download Again
                    </>
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5" />
                      Export {title.split(' ')[0]}
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
