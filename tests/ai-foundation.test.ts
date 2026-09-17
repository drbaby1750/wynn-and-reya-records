import { describe, it, expect } from 'vitest';
import { computeIso6346CheckDigit, VerificationOutputSchema } from '../src/lib/ai/schema';
import { validateUploadedFile, validateMagicBytes, FileValidationError } from '../src/lib/storage/restrictions';
import { LocalStorageService, StorageServiceError } from '../src/lib/storage/service';
import { ServerRateLimiter } from '../src/lib/ai/rate-limit';
import { VerificationStatus } from '../src/lib/ai/types';
import { assertUserOwnership, AuthorizationError } from '../src/lib/auth/session';

describe('Assessment 3 - AI Architecture & Foundation Tests', () => {

  describe('1. ISO 6346 Check Digit Logic', () => {
    it('correctly calculates check digit for standard valid container prefix CSQU305438', () => {
      // CSQU305438 -> check digit is 0 per ISO 6346 algorithm
      const checkDigit = computeIso6346CheckDigit('CSQU305438');
      expect(checkDigit).toBe(0);
    });

    it('returns null for malformed or invalid format prefixes', () => {
      expect(computeIso6346CheckDigit('INVALID123')).toBeNull();
      expect(computeIso6346CheckDigit('1234567890')).toBeNull();
    });
  });

  describe('2. Server-side File Validation & Security Restrictions', () => {
    it('passes valid PNG image with correct magic bytes', () => {
      const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      expect(validateMagicBytes(pngHeader, 'image/png')).toBe(true);
      expect(() => validateUploadedFile(pngHeader, 'invoice.png', 'image/png')).not.toThrow();
    });

    it('rejects forbidden file types like .exe or .sh', () => {
      const dummyBuf = Buffer.from('executable binary code');
      expect(() => validateUploadedFile(dummyBuf, 'script.sh', 'application/x-sh')).toThrow(FileValidationError);
    });

    it('rejects files with spoofed extension failing magic bytes verification', () => {
      const fakePng = Buffer.from('THIS IS TEXT CONTENT NOT PNG');
      expect(validateMagicBytes(fakePng, 'image/png')).toBe(false);
      expect(() => validateUploadedFile(fakePng, 'fake.png', 'image/png')).toThrow(FileValidationError);
    });
  });

  describe('3. File Storage Path Traversal Security', () => {
    it('prevents path traversal outside storage directory', async () => {
      const storage = new LocalStorageService('./storage/test');
      await expect(storage.getFile('../../etc/passwd')).rejects.toThrow(StorageServiceError);
    });
  });

  describe('4. AI Output Schema Application Guard', () => {
    it('successfully parses valid verification result JSON', () => {
      const sampleAiJson = {
        extractedContainerNumber: 'CSQU3054383',
        formatValid: true,
        verificationStatus: VerificationStatus.VALID_FORMAT,
        confidence: 0.95,
        explanation: 'Container prefix CSQU adheres to ISO 6346 standard and check digit 3 matches computed checksum.',
        detectedIssues: [],
        requiresManualVerification: false,
      };

      const parsed = VerificationOutputSchema.parse(sampleAiJson);
      expect(parsed.verificationStatus).toBe(VerificationStatus.VALID_FORMAT);
      expect(parsed.formatValid).toBe(true);
    });

    it('fails when verification result JSON is missing mandatory fields', () => {
      const invalidJson = {
        extractedContainerNumber: 'CSQU3054383',
        // missing formatValid, verificationStatus
      };

      expect(() => VerificationOutputSchema.parse(invalidJson)).toThrow();
    });
  });

  describe('5. Rate Limiter Server-side Enforcement', () => {
    it('throttles requests exceeding window limit', () => {
      const limiter = new ServerRateLimiter(2, 60000); // Max 2 per window

      expect(() => limiter.enforce('user_123')).not.toThrow();
      expect(() => limiter.enforce('user_123')).not.toThrow();
      expect(() => limiter.enforce('user_123')).toThrow();
    });
  });

  describe('6. Authorization Ownership Isolation', () => {
    it('throws error when user attempts to access another user resource', () => {
      expect(() => assertUserOwnership('user_A', 'user_B')).toThrow(AuthorizationError);
      expect(() => assertUserOwnership('user_A', 'user_A')).not.toThrow();
    });
  });

});
