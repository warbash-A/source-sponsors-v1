import { Search, RotateCcw, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkflowStepper } from "@/components/WorkflowStepper";
import { EventInputForm } from "@/components/EventInputForm";
import { EventDiscoveryResults } from "@/components/EventDiscoveryResults";
import { SponsorList } from "@/components/SponsorList";
import { EmailPreview } from "@/components/EmailPreview";
import { ExportPanel } from "@/components/ExportPanel";
import { useSponsorWorkflow } from "@/hooks/useSponsorWorkflow";

const Index = () => {
  const {
    currentStep,
    steps,
    events,
    isLoadingEvents,
    isLoading,
    eventDetails,
    selectedEventIds,
    sponsors,
    emails,
    exportingFormat,
    completedExports,
    researchMode,
    searchQueries,
    handleEventSubmit,
    handleAddEventFromUrl,
    handleToggleEvent,
    handleProceedToSponsors,
    handleGenerateEmails,
    handleProceedToExport,
    handleExport,
    resetWorkflow,
    maxStepReached,
    goToStep,
    handleGoBack,
  } = useSponsorWorkflow();

  const similarMode = researchMode === 'similar';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-primary shadow-glow">
                <Search className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">
                  Sponsor<span className="text-gradient">Scout</span>
                </h1>
                <p className="text-xs text-muted-foreground">
                  Event Sponsorship Research Tool
                </p>
              </div>
            </div>
            {currentStep > 0 && (
              <Button variant="outline" size="sm" onClick={resetWorkflow}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Start Over
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Workflow Stepper */}
        <div className="mb-8">
          <WorkflowStepper
            steps={steps}
            currentStep={currentStep}
            maxStepReached={maxStepReached}
            onStepClick={goToStep}
          />
        </div>

        {/* Step Content */}
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Step 1: Event Input */}
          {currentStep === 0 && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-card">
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground">
                  Enter Your Event Details
                </h2>
                <p className="text-muted-foreground mt-1">
                  {similarMode
                    ? "Tell us about your event to find complementary events and their sponsors"
                    : "Tell us about your event to find similar conferences and their sponsors"}
                </p>
              </div>
              <EventInputForm onSubmit={handleEventSubmit} isLoading={isLoadingEvents} initialValues={eventDetails} />
            </div>
          )}

          {/* Step 2: Event Discovery */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-6 shadow-card">
                <EventDiscoveryResults
                  events={events}
                  selectedEvents={selectedEventIds}
                  onToggleEvent={handleToggleEvent}
                  isLoading={isLoadingEvents}
                  researchMode={researchMode}
                  searchQueries={searchQueries}
                  onAddEventFromUrl={handleAddEventFromUrl}
                />
                <div className="mt-6 flex justify-between gap-3">
                  <Button variant="outline" onClick={handleGoBack}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>

                  <Button
                    onClick={handleProceedToSponsors}
                    disabled={selectedEventIds.length === 0 || isLoadingEvents || isLoading}
                    variant="gradient"
                  >
                    {isLoading ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Identifying Sponsors...
                      </>
                    ) : (
                      <>
                        Extract Sponsors
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Sponsor Identification & Enrichment */}
          {currentStep === 2 && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-card">
              <SponsorList sponsors={sponsors} showEnrichment />
              <div className="mt-6 flex justify-between gap-3">
                <Button variant="outline" onClick={handleGoBack}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>

                <Button
                  onClick={handleGenerateEmails}
                  disabled={sponsors.length === 0 || isLoading}
                  variant="gradient"
                >
                  {isLoading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Generating Emails...
                    </>
                  ) : (
                    <>
                      Generate Outreach Emails
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Email Generation */}
          {currentStep === 3 && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-card">
              <EmailPreview emails={emails} />
              <div className="mt-6 flex justify-between gap-3">
                <Button variant="outline" onClick={handleGoBack}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>

                <Button onClick={handleProceedToExport} variant="gradient">
                  Proceed to Export
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 5: Export */}
          {currentStep === 4 && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-card">
              <ExportPanel
                onExport={handleExport}
                exportingFormat={exportingFormat}
                completedFormats={completedExports}
              />
              <div className="mt-6 flex justify-start">
                <Button variant="outline" onClick={handleGoBack}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-16">
        <div className="container mx-auto px-4 py-6">
          <p className="text-center text-sm text-muted-foreground">
            SponsorScout — Find and connect with event sponsors effortlessly
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
