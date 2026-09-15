# Remove the email-writing step

The workflow drops from five steps to four. Nothing writes outreach emails anymore; the sponsor list is followed directly by the download step.

## New flow

```text
1. Event details  ->  2. Find events  ->  3. Sponsors  ->  4. Download
```

- Step 3 stays exactly as it is, including the contact email addresses found for each sponsor.
- Step 3's button becomes "Proceed to Download" instead of "Generate Outreach Emails".
- Step 4 offers CSV and Excel only. The "Email Templates" download option is removed, and the Excel workbook no longer has an email drafts sheet.

## What goes away

- The "Emails" step and its preview screen.
- The email-templates download format.
- The behind-the-scenes email writing service.

## Technical details

- `src/hooks/useSponsorWorkflow.ts`: drop step 4 from `initialSteps` and renumber Export to id 4; remove `emails` state, `handleGenerateEmails`, and the `EmailDraft` import; add `handleProceedToExport` moving from step 2 to step 3; clamp stored `currentStep` to the new step count; stop sending `emails` in the `export-data` payload.
- `src/pages/Index.tsx`: remove the step-3 email block, shift export to `currentStep === 3`, relabel the sponsor-step button.
- Delete `src/components/EmailPreview.tsx` and `supabase/functions/email-generation/`.
- `src/types/sponsor.ts`: remove `EmailDraft`; `ExportFormat` becomes `'csv' | 'excel'`. Keep `EmailRecord`/`emailDetails` (sponsor contact addresses).
- `src/components/ExportPanel.tsx`: remove the email-templates card and its Excel sheet mention.
- `supabase/functions/export-data/index.ts`: drop the email-templates branch and the email drafts sheet.
- Existing saved progress that sits on the old email step lands on the sponsor list instead.
