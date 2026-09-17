import { GoogleGenerativeAI } from '@google/generative-ai';
import { getAiConfig, AiConfig } from './config';
import { ContainerExtractionResult, ContainerVerificationResult, AiFollowupResult, VerificationStatus } from './types';
import { CONTAINER_EXTRACTION_PROMPT, CONTAINER_VERIFICATION_PROMPT, CONTAINER_FOLLOWUP_PROMPT } from './prompts';
import { ExtractionOutputSchema, VerificationOutputSchema, FollowupOutputSchema, computeIso6346CheckDigit } from './schema';
import { db } from '@/db';
import { aiJobs } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { storageService } from '@/lib/storage/service';
import { assertUserOwnership } from '@/lib/auth/session';

export class AiServiceError extends Error {
  constructor(
    message: string,
    public readonly code: 'TIMEOUT' | 'PROVIDER_ERROR' | 'VALIDATION_ERROR' | 'RATE_LIMITED' | 'CONFIG_ERROR' | 'NOT_FOUND' | 'FORBIDDEN',
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'AiServiceError';
  }
}

export class AiService {
  private genAI: GoogleGenerativeAI;
  private config: AiConfig;

  constructor(customConfig?: Partial<AiConfig>) {
    this.config = { ...getAiConfig(), ...customConfig };
    this.genAI = new GoogleGenerativeAI(this.config.geminiApiKey);
  }

  /**
   * Private helper to execute Gemini API call with timeout & safety wrapper
   */
  private async executeWithTimeout<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await fn(controller.signal);
      clearTimeout(timer);
      return result;
    } catch (err: any) {
      clearTimeout(timer);
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        throw new AiServiceError(`AI operation timed out after ${timeoutMs}ms`, 'TIMEOUT', err);
      }
      if (err instanceof AiServiceError) throw err;
      throw new AiServiceError(`AI Provider Error: ${err?.message || err}`, 'PROVIDER_ERROR', err);
    }
  }

  /**
   * Helper to execute AI operations with controlled retry limit, capturing accurate attempt counts
   */
  private async executeWithRetry<T>(
    jobId: string,
    operationName: string,
    operation: (validationFeedback?: string) => Promise<T>
  ): Promise<T> {
    let lastError: any;
    let validationFeedback: string | undefined;

    for (let attempt = 1; attempt <= this.config.maxAiAttempts; attempt++) {
      try {
        // Accurately track each individual AI processing attempt in the database
        await db.update(aiJobs)
          .set({ attemptCount: sql`${aiJobs.attemptCount} + 1` })
          .where(eq(aiJobs.id, jobId));

        return await operation(validationFeedback);
      } catch (err: any) {
        lastError = err;
        const isRetryable = err instanceof AiServiceError && 
          ['TIMEOUT', 'PROVIDER_ERROR', 'VALIDATION_ERROR'].includes(err.code);
        
        if (!isRetryable || attempt === this.config.maxAiAttempts) {
          throw err;
        }

        if (err.code === 'VALIDATION_ERROR') {
          // Pass safe validation feedback to the model to correct its structured output
          validationFeedback = `PREVIOUS ATTEMPT FAILED SCHEMA VALIDATION. ERROR DETAILS: ${err.cause?.toString() || err.message}. PLEASE CORRECT THE OUTPUT TO STRICTLY MATCH THE REQUIRED SCHEMA.`;
        } else {
          validationFeedback = undefined;
          // Add brief backoff delay for transient network/503 provider errors
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
        
        console.warn(`[AI Service] ${operationName} attempt ${attempt} failed with ${err.code}. Retrying...`);
      }
    }
    throw lastError;
  }

  /**
   * ROLE 1: Container Number Extraction
   */
  async extractContainerNumber(
    fileBuffer: Buffer,
    mimeType: string,
    validationFeedback?: string
  ): Promise<ContainerExtractionResult> {
    return this.executeWithTimeout(async () => {
      if (!fileBuffer || fileBuffer.length === 0) {
        throw new AiServiceError('Empty file buffer provided for AI extraction', 'PROVIDER_ERROR');
      }

      const model = this.genAI.getGenerativeModel({
        model: this.config.model,
        systemInstruction: CONTAINER_EXTRACTION_PROMPT,
        generationConfig: {
          temperature: this.config.temperature,
          maxOutputTokens: this.config.maxOutputTokens,
          responseMimeType: 'application/json',
        },
      });

      const imagePart = {
        inlineData: {
          data: fileBuffer.toString('base64'),
          mimeType,
        },
      };

      let prompt = 'Extract the container identification code from this document in JSON format matching schema: { extractedContainerNumber: string|null, rawTextFound: string|null, confidence: number, extractionNotes?: string }';
      if (validationFeedback) {
        prompt += `\n\nSYSTEM FEEDBACK: ${validationFeedback}`;
      }
      
      const result = await model.generateContent([prompt, imagePart]);
      const responseText = result.response.text();

      if (!responseText || responseText.trim().length === 0) {
        throw new AiServiceError('Received empty AI response from model extraction', 'PROVIDER_ERROR');
      }

      try {
        const json = JSON.parse(responseText);
        return ExtractionOutputSchema.parse(json);
      } catch (parseErr) {
        throw new AiServiceError('Failed to parse or validate extraction AI output', 'VALIDATION_ERROR', parseErr);
      }
    }, this.config.requestTimeoutMs);
  }

  /**
   * ROLE 2: Container Verification Analysis
   */
  async verifyContainer(
    extractedContainerNumber: string | null,
    documentContext?: string,
    validationFeedback?: string
  ): Promise<ContainerVerificationResult> {
    // Perform deterministic check digit verification first as application safety baseline
    let isIsoFormatValid = false;
    let computedCheckDigitStr: string | undefined;

    if (extractedContainerNumber) {
      const cleanStr = extractedContainerNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (cleanStr.length === 11) {
        const prefix10 = cleanStr.substring(0, 10);
        const givenCheckDigit = cleanStr[10];
        const computed = computeIso6346CheckDigit(prefix10);
        if (computed !== null) {
          computedCheckDigitStr = String(computed);
          isIsoFormatValid = givenCheckDigit === computedCheckDigitStr;
        }
      }
    }

    return this.executeWithTimeout(async () => {
      const model = this.genAI.getGenerativeModel({
        model: this.config.model,
        systemInstruction: CONTAINER_VERIFICATION_PROMPT,
        generationConfig: {
          temperature: this.config.temperature,
          maxOutputTokens: this.config.maxOutputTokens,
          responseMimeType: 'application/json',
        },
      });

      const userPrompt = JSON.stringify({
        extractedContainerNumber,
        deterministicChecksumValid: isIsoFormatValid,
        computedCheckDigit: computedCheckDigitStr,
        documentContext: documentContext || 'None provided',
        systemFeedback: validationFeedback || undefined
      });

      const result = await model.generateContent(userPrompt);
      const responseText = result.response.text();

      if (!responseText || responseText.trim().length === 0) {
        throw new AiServiceError('Received empty AI response from model verification', 'PROVIDER_ERROR');
      }

      try {
        const json = JSON.parse(responseText);
        const validated = VerificationOutputSchema.parse(json);

        // Enforce application safety boundary override: NEVER claim official auth
        if (validated.verificationStatus === VerificationStatus.VALID_FORMAT && !isIsoFormatValid) {
          validated.verificationStatus = VerificationStatus.SUSPICIOUS_FORMAT;
          validated.formatValid = false;
          validated.detectedIssues.push('Checksum digit calculation mismatch.');
          validated.requiresManualVerification = true;
        }

        return validated;
      } catch (parseErr) {
        throw new AiServiceError('Failed to parse or validate verification AI output', 'VALIDATION_ERROR', parseErr);
      }
    }, this.config.requestTimeoutMs);
  }

  /**
   * Two-Stage AI Processing Orchestrator for Job
   */
  async processJobWithAi(
    jobId: string,
    authenticatedUserId: string
  ): Promise<{
    extraction: ContainerExtractionResult;
    verification: ContainerVerificationResult;
    rawOutputJson: string;
  }> {
    // 1. Fetch Job from DB
    const job = await db.query.aiJobs.findFirst({
      where: eq(aiJobs.id, jobId),
    });

    if (!job) {
      throw new AiServiceError(`Job record ${jobId} not found`, 'NOT_FOUND');
    }

    // 2. Server-side User Ownership Enforcement
    try {
      assertUserOwnership(job.userId, authenticatedUserId);
    } catch {
      throw new AiServiceError(`Unauthorized access to job ${jobId}`, 'FORBIDDEN');
    }

    if (!job.storageKey) {
      throw new AiServiceError(`Job ${jobId} has no associated storageKey`, 'PROVIDER_ERROR');
    }

    // 3. Retrieve Stored File via Storage Abstraction
    const fileBuffer = await storageService.getFile(job.storageKey);
    const mimeType = job.storageKey.endsWith('.pdf') ? 'application/pdf' : 'image/png';

    // 4. STAGE 1: Container Number Extraction with Retry
    const extractionResult = await this.executeWithRetry(
      jobId, 
      'EXTRACTION',
      (feedback) => this.extractContainerNumber(fileBuffer, mimeType, feedback)
    );

    // 5. STAGE 2: Container Verification Analysis with Retry
    const verificationResult = await this.executeWithRetry(
      jobId,
      'VERIFICATION',
      (feedback) => this.verifyContainer(
        extractionResult.extractedContainerNumber,
        extractionResult.rawTextFound || undefined,
        feedback
      )
    );

    // 6. Preserve Raw AI Response JSON
    const rawOutputJson = JSON.stringify({
      stage1_extraction: extractionResult,
      stage2_verification: verificationResult,
      processedAt: new Date().toISOString(),
    });

    return {
      extraction: extractionResult,
      verification: verificationResult,
      rawOutputJson,
    };
  }

  /**
   * FOLLOW-UP ACTION: One follow-up query based on result
   */
  async processFollowup(
    verificationResult: ContainerVerificationResult,
    userQuestion: string
  ): Promise<AiFollowupResult> {
    return this.executeWithTimeout(async () => {
      const model = this.genAI.getGenerativeModel({
        model: this.config.model,
        systemInstruction: CONTAINER_FOLLOWUP_PROMPT,
        generationConfig: {
          temperature: this.config.temperature,
          maxOutputTokens: this.config.maxOutputTokens,
          responseMimeType: 'application/json',
        },
      });

      const payload = JSON.stringify({
        previousResult: verificationResult,
        userQuestion,
      });

      const result = await model.generateContent(payload);
      const responseText = result.response.text();

      try {
        const json = JSON.parse(responseText);
        return FollowupOutputSchema.parse(json);
      } catch (parseErr) {
        throw new AiServiceError('Failed to parse or validate follow-up AI output', 'VALIDATION_ERROR', parseErr);
      }
    }, this.config.requestTimeoutMs);
  }
}

export const aiService = new AiService();
