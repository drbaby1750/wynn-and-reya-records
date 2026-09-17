import { z } from 'zod';
import { VerificationStatus } from './types';

/**
 * ISO 6346 Container Number Validation Helper
 */
export function computeIso6346CheckDigit(containerNumber10: string): number | null {
  if (!/^[A-Z]{4}\d{6}$/i.test(containerNumber10)) return null;

  const charValues: Record<string, number> = {
    A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20,
    K: 21, L: 22, M: 23, N: 24, O: 25, P: 26, Q: 27, R: 28, S: 29, T: 30,
    U: 31, V: 32, W: 33, X: 34, Y: 35, Z: 36
  };

  const upper = containerNumber10.toUpperCase();
  let sum = 0;

  for (let i = 0; i < 10; i++) {
    const char = upper[i];
    const val = /\d/.test(char) ? parseInt(char, 10) : charValues[char];
    if (val === undefined) return null;
    const weight = Math.pow(2, i);
    sum += val * weight;
  }

  const remainder = sum % 11;
  return remainder === 10 ? 0 : remainder;
}

/**
 * Zod Application Validation Schemas for AI structured outputs
 */
export const ExtractionOutputSchema = z.object({
  extractedContainerNumber: z.string().nullable(),
  rawTextFound: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).default(0.5),
  extractionNotes: z.string().optional(),
});

export const VerificationOutputSchema = z.object({
  extractedContainerNumber: z.string().nullable(),
  formatValid: z.boolean(),
  verificationStatus: z.nativeEnum(VerificationStatus),
  confidence: z.number().min(0).max(1),
  explanation: z.string(),
  detectedIssues: z.array(z.string()).default([]),
  requiresManualVerification: z.boolean(),
  metadata: z.object({
    ownerCode: z.string().optional(),
    categoryIdentifier: z.string().optional(),
    serialNumber: z.string().optional(),
    checkDigit: z.string().optional(),
    computedCheckDigit: z.string().optional(),
  }).optional(),
});

export const FollowupOutputSchema = z.object({
  answer: z.string(),
  suggestedNextSteps: z.array(z.string()).default([]),
  additionalWarnings: z.array(z.string()).default([]),
});

export type ExtractionOutput = z.infer<typeof ExtractionOutputSchema>;
export type VerificationOutput = z.infer<typeof VerificationOutputSchema>;
export type FollowupOutput = z.infer<typeof FollowupOutputSchema>;
