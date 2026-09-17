'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateRecordPage() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; description?: string }>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [createdPublicId, setCreatedPublicId] = useState<string | null>(null);

  // Client-side validation
  const validateForm = (): boolean => {
    const errors: { title?: string; description?: string } = {};
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      errors.title = 'Title is required and cannot be empty.';
    } else if (trimmedTitle.length > 200) {
      errors.title = 'Title cannot exceed 200 characters.';
    }

    if (description.length > 1000) {
      errors.description = 'Description cannot exceed 1000 characters.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent duplicate submission if already submitting
    if (isSubmitting) return;

    setGeneralError(null);
    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/records', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setGeneralError('Unauthorized: Please log in to create records.');
        } else if (data.details) {
          setFieldErrors({
            title: data.details.title?.[0],
            description: data.details.description?.[0],
          });
          setGeneralError(data.error || 'Validation error.');
        } else {
          setGeneralError(data.error || 'Failed to create record.');
        }
        setIsSubmitting(false);
        return;
      }

      setCreatedPublicId(data.record.publicId);
      setIsSubmitting(false);
    } catch (err) {
      setGeneralError('Network error: Unable to connect to server.');
      setIsSubmitting(false);
    }
  };

  return (
    <main style={styles.container}>
      <div style={styles.card}>
        <header style={styles.header}>
          <h1 style={styles.title}>Create Record</h1>
          <p style={styles.subtitle}>Enter record details to add to your collection</p>
        </header>

        {createdPublicId ? (
          <div style={styles.successBox} role="alert">
            <h2 style={styles.successTitle}>✓ Record Created Successfully</h2>
            <p style={styles.successText}>
              Public Identifier:{' '}
              <code style={styles.code}>{createdPublicId}</code>
            </p>
            <button
              onClick={() => router.push(`/records/${createdPublicId}`)}
              style={styles.primaryButton}
            >
              View Record Details
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate style={styles.form}>
            {generalError && (
              <div style={styles.errorBanner} role="alert">
                {generalError}
              </div>
            )}

            <div style={styles.fieldGroup}>
              <label htmlFor="record-title" style={styles.label}>
                Record Title <span style={styles.requiredStar}>*</span>
              </label>
              <input
                id="record-title"
                name="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={validateForm}
                disabled={isSubmitting}
                aria-required="true"
                aria-invalid={Boolean(fieldErrors.title)}
                aria-describedby={fieldErrors.title ? 'title-error' : undefined}
                placeholder="e.g. Q4 Financial Audit Report"
                style={{
                  ...styles.input,
                  ...(fieldErrors.title ? styles.inputError : {}),
                }}
              />
              {fieldErrors.title && (
                <span id="title-error" style={styles.errorMessage} role="alert">
                  {fieldErrors.title}
                </span>
              )}
            </div>

            <div style={styles.fieldGroup}>
              <label htmlFor="record-description" style={styles.label}>
                Description (Optional)
              </label>
              <textarea
                id="record-description"
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={validateForm}
                disabled={isSubmitting}
                rows={4}
                aria-invalid={Boolean(fieldErrors.description)}
                aria-describedby={fieldErrors.description ? 'desc-error' : undefined}
                placeholder="Additional notes or detailed record context..."
                style={{
                  ...styles.textarea,
                  ...(fieldErrors.description ? styles.inputError : {}),
                }}
              />
              {fieldErrors.description && (
                <span id="desc-error" style={styles.errorMessage} role="alert">
                  {fieldErrors.description}
                </span>
              )}
            </div>

            <div style={styles.actions}>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  ...styles.submitButton,
                  ...(isSubmitting ? styles.buttonDisabled : {}),
                }}
              >
                {isSubmitting ? 'Creating Record...' : 'Create Record'}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: 'var(--sys-color-background, #FAF7F2)',
    color: 'var(--sys-color-text-primary, #1C1C1C)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
  },
  card: {
    backgroundColor: 'var(--sys-color-surface, #FFFFFF)',
    border: '1px solid var(--sys-color-border, #E5DFD6)',
    borderRadius: '12px',
    maxWidth: '560px',
    width: '100%',
    padding: '32px',
    boxShadow: 'var(--effect-soft-shadow, 0 4px 12px rgba(0, 0, 0, 0.05))',
  },
  header: {
    marginBottom: '24px',
    borderBottom: '1px solid var(--sys-color-border, #E5DFD6)',
    paddingBottom: '16px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 600,
    color: 'var(--sys-color-primary, #1E3A5F)',
    marginBottom: '4px',
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--sys-color-text-secondary, #6B6B6B)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--sys-color-text-primary, #1C1C1C)',
  },
  requiredStar: {
    color: 'var(--sys-color-danger, #C0392B)',
  },
  input: {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid var(--sys-color-border, #E5DFD6)',
    fontSize: '15px',
    outline: 'none',
    backgroundColor: '#FFFFFF',
    color: 'var(--sys-color-text-primary, #1C1C1C)',
  },
  textarea: {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid var(--sys-color-border, #E5DFD6)',
    fontSize: '15px',
    outline: 'none',
    backgroundColor: '#FFFFFF',
    color: 'var(--sys-color-text-primary, #1C1C1C)',
    resize: 'vertical',
  },
  inputError: {
    borderColor: 'var(--sys-color-danger, #C0392B)',
  },
  errorMessage: {
    fontSize: '12px',
    color: 'var(--sys-color-danger, #C0392B)',
  },
  errorBanner: {
    padding: '12px 16px',
    borderRadius: '8px',
    backgroundColor: '#FDF2F2',
    border: '1px solid var(--sys-color-danger, #C0392B)',
    color: 'var(--sys-color-danger, #C0392B)',
    fontSize: '14px',
  },
  actions: {
    marginTop: '8px',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  submitButton: {
    backgroundColor: 'var(--sys-color-primary, #1E3A5F)',
    color: 'var(--sys-color-on-primary, #FFFFFF)',
    padding: '12px 24px',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
  },
  primaryButton: {
    backgroundColor: 'var(--sys-color-primary, #1E3A5F)',
    color: 'var(--sys-color-on-primary, #FFFFFF)',
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '16px',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  successBox: {
    padding: '24px',
    backgroundColor: '#F0FDF4',
    border: '1px solid var(--sys-color-success, #2E7D4F)',
    borderRadius: '8px',
    textAlign: 'center',
  },
  successTitle: {
    fontSize: '18px',
    color: 'var(--sys-color-success, #2E7D4F)',
    marginBottom: '8px',
  },
  successText: {
    fontSize: '14px',
    color: 'var(--sys-color-text-primary, #1C1C1C)',
  },
  code: {
    fontFamily: 'monospace',
    fontWeight: 600,
    backgroundColor: '#E2E8F0',
    padding: '2px 6px',
    borderRadius: '4px',
  },
};
