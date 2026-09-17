import { getAiConfig } from '../ai/config';

export class FileValidationError extends Error {
  constructor(message: string, public readonly code: 'TYPE_NOT_ALLOWED' | 'SIZE_EXCEEDED' | 'MAGIC_BYTES_MISMATCH' | 'MALFORMED_NAME') {
    super(message);
    this.name = 'FileValidationError';
  }
}

export const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
];

/**
 * Validate Magic Byte Headers for uploaded file buffer
 */
export function validateMagicBytes(buffer: Buffer, declaredMimeType: string): boolean {
  if (buffer.length < 4) return false;

  const hex = buffer.toString('hex', 0, 4).toUpperCase();

  switch (declaredMimeType) {
    case 'image/png':
      return hex === '89504E47'; // %PNG
    case 'image/jpeg':
      return hex.startsWith('FFD8FF'); // JPEG SOI
    case 'image/webp':
      return buffer.toString('utf8', 0, 4) === 'RIFF' && buffer.toString('utf8', 8, 12) === 'WEBP';
    case 'application/pdf':
      return buffer.toString('utf8', 0, 4) === '%PDF';
    default:
      return false;
  }
}

/**
 * Server-side File Restrictions Guard
 */
export function validateUploadedFile(
  buffer: Buffer,
  originalName: string,
  declaredMimeType: string
): void {
  const config = getAiConfig();

  // 1. Max size check
  if (buffer.length > config.maxUploadSizeBytes) {
    throw new FileValidationError(
      `File size (${(buffer.length / 1024 / 1024).toFixed(2)}MB) exceeds maximum limit of ${(config.maxUploadSizeBytes / 1024 / 1024).toFixed(2)}MB`,
      'SIZE_EXCEEDED'
    );
  }

  // 2. MIME type check
  if (!ALLOWED_MIME_TYPES.includes(declaredMimeType)) {
    throw new FileValidationError(
      `File type '${declaredMimeType}' is not allowed. Supported formats: PNG, JPEG, WebP, PDF.`,
      'TYPE_NOT_ALLOWED'
    );
  }

  // 3. Magic Bytes check
  if (!validateMagicBytes(buffer, declaredMimeType)) {
    throw new FileValidationError(
      `File header magic bytes do not match the declared MIME type '${declaredMimeType}'. Upload rejected for security.`,
      'MAGIC_BYTES_MISMATCH'
    );
  }

  // 4. Filename sanity check
  if (/[<>:"/\\|?*\x00-\x1F]/.test(originalName)) {
    throw new FileValidationError(
      `Filename contains forbidden characters.`,
      'MALFORMED_NAME'
    );
  }
}
