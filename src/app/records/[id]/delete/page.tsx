'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type RecordDetail = {
  publicId: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: string | number;
};

type DeleteRecordPageProps = {
  params: {
    id: string;
  };
};

export default function DeleteRecordConfirmationPage({ params }: DeleteRecordPageProps) {
  const router = useRouter();
  const publicId = params.id;

  const [record, setRecord] = useState<RecordDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  useEffect(() => {
    async function fetchRecordDetail() {
      setIsLoading(true);
      setNotFound(false);
      setErrorMessage(null);

      try {
        const response = await fetch(`/api/records/${publicId}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        const data = await response.json();

        if (!response.ok) {
          if (response.status === 404) {
            setNotFound(true);
          } else if (response.status === 401) {
            setErrorMessage('Unauthorized: Please log in to delete records.');
          } else {
            setErrorMessage(data.error || 'Failed to retrieve record details.');
          }
          setIsLoading(false);
          return;
        }

        setRecord(data.record);
        setIsLoading(false);
      } catch (err) {
        setErrorMessage('Network error: Unable to connect to server.');
        setIsLoading(false);
      }
    }

    fetchRecordDetail();
  }, [publicId]);

  const handleDeleteConfirm = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/records/${publicId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          setErrorMessage('Record not found or already deleted.');
        } else if (response.status === 401) {
          setErrorMessage('Unauthorized: Session expired.');
        } else {
          setErrorMessage(data.error || 'Failed to delete record.');
        }
        setIsDeleting(false);
        return;
      }

      setDeleteSuccess(true);
      setIsDeleting(false);
      setTimeout(() => {
        router.push('/records');
      }, 1500);
    } catch (err) {
      setErrorMessage('Network error: Failed to execute delete transaction.');
      setIsDeleting(false);
    }
  };

  return (
    <main style={styles.container}>
      <div style={styles.card}>
        {isLoading && (
          <div style={styles.stateBox} role="status" aria-live="polite">
            <p style={styles.loadingText}>Loading record details...</p>
          </div>
        )}

        {!isLoading && notFound && (
          <div style={styles.stateBox} role="alert">
            <div style={styles.notFoundIcon}>🔍</div>
            <h1 style={styles.notFoundTitle}>Record Not Found</h1>
            <p style={styles.notFoundText}>
              The requested record does not exist or you do not have permission to modify it.
            </p>
            <Link href="/records" style={styles.primaryLinkButton}>
              ← Back to Records List
            </Link>
          </div>
        )}

        {!isLoading && !notFound && deleteSuccess && (
          <div style={styles.successBox} role="alert">
            <div style={styles.successIcon}>✓</div>
            <h1 style={styles.successTitle}>Record Deleted</h1>
            <p style={styles.successText}>
              The record has been deleted and recorded in the audit trail. Redirecting to records list...
            </p>
          </div>
        )}

        {!isLoading && !notFound && !deleteSuccess && record && (
          <div style={styles.confirmContent}>
            <header style={styles.header}>
              <h1 style={styles.title}>Delete Record Confirmation</h1>
              <p style={styles.subtitle}>
                Are you sure you want to permanently delete this record?
              </p>
            </header>

            {errorMessage && (
              <div style={styles.errorBox} role="alert">
                <p style={styles.errorText}>{errorMessage}</p>
              </div>
            )}

            <div style={styles.recordPreview}>
              <h2 style={styles.previewTitle}>{record.title}</h2>
              <p style={styles.previewId}>Public ID: <code>{record.publicId}</code></p>
              {record.description && (
                <p style={styles.previewDesc}>{record.description}</p>
              )}
            </div>

            <div style={styles.warningBox}>
              <p style={styles.warningText}>
                ⚠️ <strong>Action cannot be undone:</strong> This will remove the record from your list and create a permanent deletion audit entry.
              </p>
            </div>

            <div style={styles.actions}>
              <Link href={`/records/${record.publicId}`} style={styles.cancelButton}>
                Cancel
              </Link>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                style={{
                  ...styles.deleteButton,
                  ...(isDeleting ? styles.buttonDisabled : {}),
                }}
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete Record'}
              </button>
            </div>
          </div>
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
    padding: '32px 16px',
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
  confirmContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  header: {
    borderBottom: '1px solid var(--sys-color-border, #E5DFD6)',
    paddingBottom: '16px',
  },
  title: {
    fontSize: '22px',
    fontWeight: 600,
    color: 'var(--sys-color-danger, #C0392B)',
    marginBottom: '4px',
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--sys-color-text-secondary, #6B6B6B)',
  },
  recordPreview: {
    backgroundColor: '#F8FAFCEE',
    border: '1px solid #E2E8F0',
    borderRadius: '8px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  previewTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: 'var(--sys-color-primary, #1E3A5F)',
  },
  previewId: {
    fontSize: '13px',
    color: 'var(--sys-color-text-secondary, #6B6B6B)',
  },
  previewDesc: {
    fontSize: '14px',
    color: 'var(--sys-color-text-primary, #1C1C1C)',
    marginTop: '4px',
  },
  warningBox: {
    backgroundColor: '#FDF2F2',
    border: '1px solid var(--sys-color-danger, #C0392B)',
    borderRadius: '8px',
    padding: '14px',
  },
  warningText: {
    fontSize: '13px',
    color: 'var(--sys-color-danger, #C0392B)',
    lineHeight: '1.4',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '8px',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    color: 'var(--sys-color-text-primary, #1C1C1C)',
    border: '1px solid var(--sys-color-border, #E5DFD6)',
    padding: '10px 18px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    textDecoration: 'none',
  },
  deleteButton: {
    backgroundColor: 'var(--sys-color-danger, #C0392B)',
    color: '#FFFFFF',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  stateBox: {
    padding: '40px 20px',
    textAlign: 'center',
  },
  loadingText: {
    fontSize: '15px',
    color: 'var(--sys-color-text-secondary, #6B6B6B)',
  },
  notFoundIcon: {
    fontSize: '48px',
    marginBottom: '12px',
  },
  notFoundTitle: {
    fontSize: '22px',
    fontWeight: 600,
    color: 'var(--sys-color-primary, #1E3A5F)',
    marginBottom: '8px',
  },
  notFoundText: {
    fontSize: '14px',
    color: 'var(--sys-color-text-secondary, #6B6B6B)',
    marginBottom: '20px',
  },
  primaryLinkButton: {
    backgroundColor: 'var(--sys-color-primary, #1E3A5F)',
    color: '#FFFFFF',
    padding: '10px 18px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    textDecoration: 'none',
    display: 'inline-block',
  },
  successBox: {
    padding: '32px 16px',
    textAlign: 'center',
  },
  successIcon: {
    fontSize: '48px',
    color: 'var(--sys-color-success, #2E7D4F)',
    marginBottom: '12px',
  },
  successTitle: {
    fontSize: '22px',
    fontWeight: 600,
    color: 'var(--sys-color-success, #2E7D4F)',
    marginBottom: '8px',
  },
  successText: {
    fontSize: '14px',
    color: 'var(--sys-color-text-primary, #1C1C1C)',
  },
  errorBox: {
    padding: '12px 16px',
    backgroundColor: '#FDF2F2',
    border: '1px solid var(--sys-color-danger, #C0392B)',
    borderRadius: '8px',
  },
  errorText: {
    fontSize: '13px',
    color: 'var(--sys-color-danger, #C0392B)',
  },
};
