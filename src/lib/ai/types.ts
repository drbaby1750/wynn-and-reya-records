/**
 * Wynn & Reya AI Integration Slice - Domain Types
 */

export enum VerificationStatus {
  VALID_FORMAT = 'valid_format',
  SUSPICIOUS_FORMAT = 'suspicious_format',
  UNABLE_TO_VERIFY = 'unable_to_verify',
  REQUIRES_MANUAL_VERIFICATION = 'requires_manual_verification',
}

export enum JobState {
  PENDING = 'pending',
  PROCESSING = 'processing',
  DONE = 'done',
  FAILED = 'failed',
}

export enum AiRole {
  CONTAINER_EXTRACTION = 'CONTAINER_EXTRACTION',
  CONTAINER_VERIFICATION = 'CONTAINER_VERIFICATION',
  CONTAINER_FOLLOWUP = 'CONTAINER_FOLLOWUP',
}

export interface ContainerExtractionResult {
  extractedContainerNumber: string | null;
  rawTextFound?: string | null;
  confidence: number; // 0.0 - 1.0
  extractionNotes?: string;
}

export interface ContainerVerificationResult {
  extractedContainerNumber: string | null;
  formatValid: boolean;
  verificationStatus: VerificationStatus;
  confidence: number; // 0.0 - 1.0
  explanation: string;
  detectedIssues: string[];
  requiresManualVerification: boolean;
  metadata?: {
    ownerCode?: string;
    categoryIdentifier?: string;
    serialNumber?: string;
    checkDigit?: string;
    computedCheckDigit?: string;
  };
}

export interface AiFollowupResult {
  answer: string;
  suggestedNextSteps: string[];
  additionalWarnings: string[];
}

export interface StorageFileRef {
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}
