import { z } from 'zod';

const AiConfigSchema = z.object({
  geminiApiKey: z.string().min(1, 'GEMINI_API_KEY must be provided'),
  provider: z.enum(['google']).default('google'),
  model: z.string().default('gemini-3.6-flash'),
  requestTimeoutMs: z.coerce.number().positive().default(30000),
  maxOutputTokens: z.coerce.number().positive().default(2048),
  temperature: z.coerce.number().min(0).max(2).default(0.2),
  maxAiConcurrency: z.coerce.number().positive().default(3),
  maxAiAttempts: z.coerce.number().positive().default(3),
  processingRateLimitMax: z.coerce.number().positive().default(10),
  processingRateLimitWindowMs: z.coerce.number().positive().default(60000),
  followupRateLimitMax: z.coerce.number().positive().default(5),
  followupRateLimitWindowMs: z.coerce.number().positive().default(60000),
  maxUploadSizeBytes: z.coerce.number().positive().default(10485760),
  uploadStorageDir: z.string().default('./storage/uploads'),
});

export type AiConfig = z.infer<typeof AiConfigSchema>;

export function getAiConfig(): AiConfig {
  return AiConfigSchema.parse({
    geminiApiKey: process.env.GEMINI_API_KEY || 'placeholder_api_key_replace_with_real_gemini_key',
    provider: process.env.AI_PROVIDER || 'google',
    model: process.env.AI_MODEL || 'gemini-3.6-flash',
    requestTimeoutMs: process.env.AI_REQUEST_TIMEOUT_MS,
    maxOutputTokens: process.env.AI_MAX_OUTPUT_TOKENS,
    temperature: process.env.AI_TEMPERATURE,
    maxAiConcurrency: process.env.MAX_AI_CONCURRENCY,
    maxAiAttempts: process.env.MAX_AI_ATTEMPTS,
    processingRateLimitMax: process.env.AI_PROCESSING_RATE_LIMIT_MAX,
    processingRateLimitWindowMs: process.env.AI_PROCESSING_RATE_LIMIT_WINDOW_MS,
    followupRateLimitMax: process.env.AI_FOLLOWUP_RATE_LIMIT_MAX,
    followupRateLimitWindowMs: process.env.AI_FOLLOWUP_RATE_LIMIT_WINDOW_MS,
    maxUploadSizeBytes: process.env.MAX_UPLOAD_SIZE_BYTES,
    uploadStorageDir: process.env.UPLOAD_STORAGE_DIR,
  });
}
