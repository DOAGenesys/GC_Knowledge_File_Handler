/**
 * Smoke workflow — exists solely to validate that the `"use workflow"` /
 * `"use step"` SWC transforms compile in this project. The real sync
 * orchestrator lives in `src/workflows/sync-workflow.ts`.
 */

async function smokeStep(input: string): Promise<string> {
  'use step';
  return `ok:${input}`;
}

export async function smokeWorkflow(input: string): Promise<string> {
  'use workflow';
  const result = await smokeStep(input);
  return result;
}
