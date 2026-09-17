'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/auth/session';
import { createRecordForUser } from '@/lib/records/service';
import { createRecordSchema } from '@/lib/validation/record';

export type CreateRecordActionResult = {
  success: boolean;
  publicId?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function createRecordAction(
  prevState: CreateRecordActionResult | null,
  formData: FormData
): Promise<CreateRecordActionResult> {
  const cookieStore = cookies();
  const headerList = headers();

  const sessionId =
    cookieStore.get('session')?.value ||
    cookieStore.get('session_id')?.value ||
    headerList.get('x-session-id') ||
    undefined;

  let user;
  try {
    user = await getAuthenticatedUser(sessionId);
  } catch {
    return {
      success: false,
      error: 'Unauthorized: You must be logged in to create records.',
    };
  }

  const rawTitle = formData.get('title');
  const rawDescription = formData.get('description');

  const validation = createRecordSchema.safeParse({
    title: rawTitle,
    description: rawDescription,
  });

  if (!validation.success) {
    return {
      success: false,
      error: 'Validation failed: Please check input fields.',
      fieldErrors: validation.error.flatten().fieldErrors,
    };
  }

  try {
    const record = await createRecordForUser(user.id, validation.data);
    return {
      success: true,
      publicId: record.publicId,
    };
  } catch (err: any) {
    return {
      success: false,
      error: 'Server Error: Failed to create record.',
    };
  }
}
