import assert from 'node:assert';
import { computeIso6346CheckDigit, VerificationOutputSchema } from '../src/lib/ai/schema';
import { validateUploadedFile, validateMagicBytes, FileValidationError } from '../src/lib/storage/restrictions';
import { LocalStorageService, StorageServiceError } from '../src/lib/storage/service';
import { ServerRateLimiter } from '../src/lib/ai/rate-limit';
import { VerificationStatus } from '../src/lib/ai/types';
import { assertUserOwnership, AuthorizationError } from '../src/lib/auth/session';

async function runFoundationTests() {
  console.log('====================================================');
  console.log('WYNN & REYA - ASSESSMENT 3 FOUNDATION TEST SUITE');
  console.log('====================================================\n');

  // 1. ISO 6346 Check Digit
  console.log('[Test 1] Testing ISO 6346 Container Checksum Algorithm...');
  const validCheckDigit = computeIso6346CheckDigit('CSQU305438');
  assert.strictEqual(validCheckDigit, 0, 'CSQU305438 check digit should equal 0');
  assert.strictEqual(computeIso6346CheckDigit('INVALID123'), null, 'Invalid prefix must return null');
  console.log('  -> PASS: ISO 6346 checksum calculation verified.');

  // 2. File Restrictions & Magic Bytes
  console.log('[Test 2] Testing File Validation & Magic Bytes Restrictions...');
  const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  assert.strictEqual(validateMagicBytes(pngHeader, 'image/png'), true);
  assert.doesNotThrow(() => validateUploadedFile(pngHeader, 'invoice.png', 'image/png'));
  
  assert.throws(() => {
    validateUploadedFile(Buffer.from('EXECUTABLE_DATA'), 'script.sh', 'application/x-sh');
  }, FileValidationError);

  const fakePng = Buffer.from('TEXT_CONTENT_NOT_IMAGE');
  assert.throws(() => {
    validateUploadedFile(fakePng, 'spoofed.png', 'image/png');
  }, FileValidationError);
  console.log('  -> PASS: Security file restrictions & magic bytes header check verified.');

  // 3. Storage Security & Path Traversal
  console.log('[Test 3] Testing Storage Boundary Path Traversal Prevention...');
  const storage = new LocalStorageService('./storage/test');
  await assert.rejects(async () => {
    await storage.getFile('../../etc/passwd');
  }, StorageServiceError);
  console.log('  -> PASS: Storage key path traversal protection verified.');

  // 4. AI Structured Output Application Schema Guard
  console.log('[Test 4] Testing Application Zod Schema Guard for AI Outputs...');
  const sampleVerificationData = {
    extractedContainerNumber: 'CSQU3054383',
    formatValid: true,
    verificationStatus: VerificationStatus.VALID_FORMAT,
    confidence: 0.95,
    explanation: 'Container CSQU3054383 adheres to ISO 6346 standard with check digit 3.',
    detectedIssues: [],
    requiresManualVerification: false,
  };
  const parsed = VerificationOutputSchema.parse(sampleVerificationData);
  assert.strictEqual(parsed.verificationStatus, VerificationStatus.VALID_FORMAT);
  
  assert.throws(() => {
    VerificationOutputSchema.parse({ extractedContainerNumber: 'CSQU' }); // missing mandatory fields
  });
  console.log('  -> PASS: Zod AI output schema validation layer verified.');

  // 5. Server-side Rate Limiting
  console.log('[Test 5] Testing Server-side Rate Limiter...');
  const limiter = new ServerRateLimiter(2, 60000);
  limiter.enforce('user_session_1');
  limiter.enforce('user_session_1');
  assert.throws(() => limiter.enforce('user_session_1'));
  console.log('  -> PASS: Server-side rate limiter limits verified.');

  // 6. User Authorization Ownership
  console.log('[Test 6] Testing Session Authorization Ownership Boundary...');
  assert.doesNotThrow(() => assertUserOwnership('user_A', 'user_A'));
  assert.throws(() => assertUserOwnership('user_A', 'user_B'), AuthorizationError);
  console.log('  -> PASS: User resource ownership assertion verified.');

  console.log('\n====================================================');
  console.log('SUMMARY: ALL 6 ARCHITECTURAL FOUNDATION CHECKS PASSED');
  console.log('====================================================');
}

runFoundationTests().catch((err) => {
  console.error('Foundation test failure:', err);
  process.exit(1);
});
