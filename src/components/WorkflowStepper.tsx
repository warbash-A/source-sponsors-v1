import { Check, Search, Users, Mail, FileDown, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkflowStep } from "@/types/sponsor";

interface WorkflowStepperProps {
  steps: WorkflowStep[];
  currentStep: number;
  maxStepReached?: number;
  onStepClick?: (step: number) => void;
}

const stepIcons = [Search, Globe, Users, Mail, FileDown];

export function WorkflowStepper({ steps, currentStep, maxStepReached = currentStep, onStepClick }: WorkflowStepperProps) {

  return (
    <div className="w-full py-6">
      <div className="relative flex items-center justify-between">
        {/* Progress line background */}
        <div className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-border" />
        
        {/* Active progress line */}
        <div 
          className="absolute left-0 top-1/2 h-0.5 -translate-y-1/2 bg-gradient-primary transition-all duration-500"
          style={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
        />

        {steps.map((step, index) => {
          const Icon = stepIcons[step.id - 1] ?? stepIcons[index];
          const isComplete = step.status === 'complete';
          const isActive = step.status === 'active';
          const isPending = step.status === 'pending';
          const isError = step.status === 'error';

          const isClickable = Boolean(onStepClick) && index <= maxStepReached;

          return (
            <div key={step.id} className="relative z-10 flex flex-col items-center">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick?.(index)}
                title={isClickable ? `Go to ${step.name}` : undefined}
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all duration-300",
                  isClickable && "cursor-pointer hover:scale-105",
                  !isClickable && "cursor-default",
                  isComplete && "border-primary bg-primary text-primary-foreground",
                  isActive && "border-primary bg-background text-primary animate-pulse-glow",
                  isPending && "border-border bg-background text-muted-foreground",
                  isError && "border-destructive bg-destructive/10 text-destructive"
                )}
              >

                {isComplete ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
              </button>

              <div className="mt-3 text-center">
                <p
                  className={cn(
                    "text-sm font-medium transition-colors",
                    isComplete && "text-primary",
                    isActive && "text-foreground",
                    isPending && "text-muted-foreground",
                    isError && "text-destructive"
                  )}
                >
                  {step.name}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground max-w-[120px]">
                  {step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
