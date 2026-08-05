'use client';

import React from 'react';
import { X, Check } from 'lucide-react';
import type { FullGrnFormState } from './grn-form';
import type { VendorOption } from '@/lib/procurement';
import type { GrnRow } from './grn-stats-bar';

import { useGrnWizardForm } from './hooks/use-grn-form';
import { useGrnValidation } from './hooks/use-grn-validation';

import { GrnStepHeader } from './steps/grn-step-header';
import { GrnStepItems } from './steps/grn-step-items';
import { GrnStepReview } from './steps/grn-step-review';

interface GrnWizardProps {
  grn?: GrnRow | null; // active grn (blank if new)
  vendorOptions?: VendorOption[];
  onSubmit: (formData: FullGrnFormState) => Promise<void> | void;
  onCancel: () => void;
  onPrint?: () => void;
}

export function GrnWizard({ grn, vendorOptions, onSubmit, onCancel, onPrint }: GrnWizardProps) {
  const {
    state,
    currentStep,
    updateField,
    updateItem,
    handlePoSelection,
    nextStep,
    prevStep,
    getFullState
  } = useGrnWizardForm();

  const { getLineStatus, step1Valid, step2Valid, step3Valid } = useGrnValidation(state);

  const handleSubmit = (status: FullGrnFormState['status']) => {
    const fullForm = getFullState(status);
    onSubmit(fullForm);
  };

  const steps = [
    { num: 1, title: 'Header & Transport' },
    { num: 2, title: 'Item Quantities' },
    { num: 3, title: 'Review & Submit' }
  ];

  return (
    <div className="mx-auto max-w-7xl rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Wizard Header & Progress */}
      <div className="border-b border-border bg-muted/30 px-6 py-4 flex items-center justify-between">
        <div className="flex flex-col">
          <h2 className="text-lg font-heading font-bold flex items-center gap-2">
            Create Goods Receipt Note (GRN)
          </h2>
          <div className="flex items-center gap-2 mt-2">
            {steps.map((step, idx) => (
              <React.Fragment key={step.num}>
                <div className="flex items-center gap-1.5">
                  <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                    currentStep > step.num 
                      ? 'bg-primary text-primary-foreground' 
                      : currentStep === step.num 
                        ? 'bg-primary/20 text-primary border border-primary'
                        : 'bg-muted text-muted-foreground'
                  }`}>
                    {currentStep > step.num ? <Check className="h-3 w-3" /> : step.num}
                  </div>
                  <span className={`text-xs font-semibold ${currentStep >= step.num ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {step.title}
                  </span>
                </div>
                {idx < steps.length - 1 && (
                  <div className="w-8 h-px bg-border mx-1" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
        
        <button
          onClick={onCancel}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-bold text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" /> Cancel
        </button>
      </div>

      <div className="p-6">
        {currentStep === 1 && (
          <GrnStepHeader 
            state={state}
            updateField={updateField}
            onPoSelect={handlePoSelection}
            onNext={nextStep}
            isValid={step1Valid}
          />
        )}
        
        {currentStep === 2 && (
          <GrnStepItems 
            state={state}
            updateItem={updateItem}
            getLineStatus={getLineStatus}
            onNext={nextStep}
            onBack={prevStep}
            isValid={step2Valid}
          />
        )}
        
        {currentStep === 3 && (
          <GrnStepReview 
            state={state}
            updateField={updateField}
            onBack={prevStep}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  );
}
