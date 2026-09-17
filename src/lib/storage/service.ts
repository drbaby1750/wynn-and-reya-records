import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { getAiConfig } from '../ai/config';
import { StorageFileRef } from '../ai/types';

export class StorageServiceError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'StorageServiceError';
  }
}

export interface IStorageService {
  saveFile(buffer: Buffer, originalName: string, mimeType: string): Promise<StorageFileRef>;
  getFile(storageKey: string): Promise<Buffer>;
  deleteFile(storageKey: string): Promise<void>;
}

export class LocalStorageService implements IStorageService {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = path.resolve(baseDir || getAiConfig().uploadStorageDir);
  }

  private async ensureDir(): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
    } catch (err) {
      throw new StorageServiceError('Failed to initialize upload storage directory', err);
    }
  }

  private sanitizeKey(storageKey: string): string {
    // Prevent path traversal attacks
    const normalized = path.normalize(storageKey).replace(/^(\.\.[\/\\])+/, '');
    const safePath = path.resolve(this.baseDir, normalized);
    
    if (!safePath.startsWith(this.baseDir)) {
      throw new StorageServiceError('Security violation: Storage key attempted path traversal out of storage root.');
    }
    return safePath;
  }

  async saveFile(buffer: Buffer, originalName: string, mimeType: string): Promise<StorageFileRef> {
    await this.ensureDir();
    
    // Generate safe opaque storage key (random UUID + safe ext)
    const ext = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.bin';
    const uuid = crypto.randomUUID();
    const relativeKey = `${uuid}${ext}`;
    const fullPath = path.join(this.baseDir, relativeKey);

    try {
      await fs.writeFile(fullPath, buffer);
      return {
        storageKey: relativeKey,
        originalName,
        mimeType,
        sizeBytes: buffer.length,
      };
    } catch (err) {
      throw new StorageServiceError('Failed to write file to local storage', err);
    }
  }

  async getFile(storageKey: string): Promise<Buffer> {
    const fullPath = this.sanitizeKey(storageKey);
    try {
      return await fs.readFile(fullPath);
    } catch (err) {
      throw new StorageServiceError(`Failed to read file for key ${storageKey}`, err);
    }
  }

  async deleteFile(storageKey: string): Promise<void> {
    const fullPath = this.sanitizeKey(storageKey);
    try {
      await fs.unlink(fullPath);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        throw new StorageServiceError(`Failed to delete file for key ${storageKey}`, err);
      }
    }
  }
}

export const storageService: IStorageService = new LocalStorageService();
