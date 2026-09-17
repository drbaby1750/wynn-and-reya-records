import { z } from 'zod';

export const createRecordSchema = z.object({
  title: z
    .string({ required_error: 'Record title is required.' })
    .trim()
    .min(1, 'Title cannot be empty.')
    .max(200, 'Title cannot exceed 200 characters.'),
  description: z
    .string()
    .trim()
    .max(1000, 'Description cannot exceed 1000 characters.')
    .optional(),
});

export type CreateRecordInput = z.infer<typeof createRecordSchema>;

export const recordPublicIdSchema = z
  .string()
  .uuid('Invalid public identifier format.');
