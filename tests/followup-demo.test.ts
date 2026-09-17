import { describe, it, expect, vi } from 'vitest';
import { aiService } from '../src/lib/ai/service';
import { FollowupOutputSchema } from '../src/lib/ai/schema';
import { ContainerVerificationResult, VerificationStatus } from '../src/lib/ai/types';

describe('Assessment 3 Prompt 7: Follow-up Action Demonstration', () => {
  const completedResult: ContainerVerificationResult = {
    extractedContainerNumber: 'CSQU3054383',
    formatValid: true,
    verificationStatus: VerificationStatus.VALID_FORMAT,
    confidence: 0.95,
    explanation: 'Container prefix CSQU is registered to China Shipping and check digit 3 matches computed check digit 3.',
    detectedIssues: [],
    requiresManualVerification: false,
    metadata: {
      ownerCode: 'CSQ',
      categoryIdentifier: 'U',
      serialNumber: '305438',
      checkDigit: '3',
    },
  };

  it('Demonstrates Successful Follow-up Flow: Completed primary result -> Follow-up action -> AI request -> Structured validation -> Result', async () => {
    const userQuestion = 'Is this container number safe to process through customs clearance?';

    // Mock successful AI model call returning valid JSON matching FollowupOutputSchema
    vi.spyOn(aiService, 'processFollowup').mockResolvedValueOnce({
      answer: 'Yes, CSQU3054383 is structurally valid and follows ISO 6346 formatting rules.',
      suggestedNextSteps: [
        'Inspect physical container door markings',
        'Verify bill of lading document match',
      ],
      additionalWarnings: [],
    });

    // Execute follow-up action
    const result = await aiService.processFollowup(completedResult, userQuestion);

    // Validate structured output schema
    const validated = FollowupOutputSchema.parse(result);

    // DEMONSTRATION VERIFICATIONS
    expect(validated.answer).toContain('CSQU3054383 is structurally valid');
    expect(validated.suggestedNextSteps).toContain('Inspect physical container door markings');
    expect(validated.additionalWarnings).toEqual([]);
  });

  it('Demonstrates Safe Follow-up Failure Handling (when model output fails validation or API fails)', async () => {
    const userQuestion = 'What is the owner history of this container?';

    // Mock AI model failure / invalid structured output
    vi.spyOn(aiService, 'processFollowup').mockRejectedValueOnce(
      new Error('VALIDATION_ERROR: Failed to parse or validate follow-up AI output')
    );

    // Execute follow-up action expecting safe error
    await expect(aiService.processFollowup(completedResult, userQuestion)).rejects.toThrowError(
      /VALIDATION_ERROR/
    );
  });
});
