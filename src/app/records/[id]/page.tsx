'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

type RecordDetail = {
  publicId: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: string | number;
  updatedAt: string | number;
};

type RecordDetailPageProps = {
  params: {
    id: string; // Safe public UUID identifier
  };
};

export default function RecordDetailPage({ params }: RecordDetailPageProps) {
  const publicId = params.id;

  const [record, setRecord] = useState<RecordDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRecordDetail() {
      setIsLoading(true);
      setNotFound(false);
      setErrorMessage(null);

      try {
        const response = await fetch(`/api/records/${publicId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const data = await response.json();

        if (!response.ok) {
          if (response.status === 404) {
            setNotFound(true);
          } else if (response.status === 401) {
            setErrorMessage('Unauthorized: Please log in to view record details.');
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

  return (
    <main style={styles.container}>
      <div style={styles.card}>
        {/* 1. Loading State */}
        {isLoading && (
          <div style={styles.stateBox} role="status" aria-live="polite">
            <p style={styles.loadingText}>Loading record details...</p>
          </div>
        )}

        {/* 2. 404 Not Found State */}
        {!isLoading && notFound && (
          <div style={styles.stateBox} role="alert">
            <div style={styles.notFoundIcon}>🔍</div>
            <h1 style={styles.notFoundTitle}>Record Not Found</h1>
            <p style={styles.notFoundText}>
              The requested record does not exist or you do not have permission to view it.
            </p>
            <div style={styles.navGroup}>
              <Link href="/records" style={styles.primaryButtonLink}>
                ← Back to Records List
              </Link>
            </div>
          </div>
        )}

        {/* 3. Server Error State */}
        {!isLoading && !notFound && errorMessage && (
          <div style={styles.errorBox} role="alert">
            <h2 style={styles.errorTitle}>Error Loading Record</h2>
            <p style={styles.errorText}>{errorMessage}</p>
            <div style={styles.navGroup}>
              <Link href="/records" style={styles.secondaryLink}>
                ← Return to Records List
              </Link>
            </div>
          </div>
        )}

        {/* 4. Record Detail Content State */}
        {!isLoading && !notFound && !errorMessage && record && (
          <article style={styles.article}>
            <header style={styles.header}>
              <div style={styles.titleRow}>
                <h1 style={styles.title}>{record.title}</h1>
                <span style={styles.statusBadge}>{record.status}</span>
              </div>
              <p style={styles.publicIdLabel}>
                Public ID: <code style={styles.code}>{record.publicId}</code>
              </p>
            </header>

            <section style={styles.section}>
              <h2 style={styles.sectionHeading}>Record Details</h2>
              <div style={styles.infoGrid}>
                <div style={styles.infoItem}>
                  <span style={styles.infoLabel}>Description:</span>
                  <p style={styles.infoValue}>
                    {record.description || 'No description provided.'}
                  </p>
                </div>

                <div style={styles.infoItem}>
                  <span style={styles.infoLabel}>Created At:</span>
                  <p style={styles.infoValue}>
                    {new Date(record.createdAt).toLocaleString('en-US', {
                      dateStyle: 'full',
                      timeStyle: 'medium',
                    })}
                  </p>
                </div>

                <div style={styles.infoItem}>
                  <span style={styles.infoLabel}>Last Updated:</span>
                  <p style={styles.infoValue}>
                    {new Date(record.updatedAt).toLocaleString('en-US', {
                      dateStyle: 'full',
                      timeStyle: 'medium',
                    })}
                  </p>
                </div>
              </div>
            </section>

            <footer style={styles.footer}>
              <Link href="/records" style={styles.secondaryLink}>
                ← Back to Records List
              </Link>
              <Link href={`/records/${record.publicId}/delete`} style={styles.deleteButtonLink}>
                Delete Record
              </Link>
            </footer>
          </article>
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
    maxWidth: '680px',
    width: '100%',
    padding: '32px',
    boxShadow: 'var(--effect-soft-shadow, 0 4px 12px rgba(0, 0, 0, 0.05))',
  },
  article: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  header: {
    borderBottom: '1px solid var(--sys-color-border, #E5DFD6)',
    paddingBottom: '16px',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    marginBottom: '8px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 600,
    color: 'var(--sys-color-primary, #1E3A5F)',
  },
  statusBadge: {
    backgroundColor: '#E8EEF5',
    color: 'var(--sys-color-primary, #1E3A5F)',
    fontSize: '12px',
    fontWeight: 600,
    padding: '4px 12px',
    borderRadius: '12px',
    textTransform: 'uppercase',
  },
  publicIdLabel: {
    fontSize: '13px',
    color: 'var(--sys-color-text-secondary, #6B6B6B)',
  },
  code: {
    fontFamily: 'monospace',
    fontWeight: 600,
    backgroundColor: '#E2E8F0',
    padding: '2px 6px',
    borderRadius: '4px',
    color: 'var(--sys-color-text-primary, #1C1C1C)',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  sectionHeading: {
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--sys-color-primary, #1E3A5F)',
    borderBottom: '1px solid #F1F5F9',
    paddingBottom: '6px',
  },
  infoGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  infoItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  infoLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--sys-color-text-secondary, #6B6B6B)',
  },
  infoValue: {
    fontSize: '15px',
    color: 'var(--sys-color-text-primary, #1C1C1C)',
    lineHeight: '1.5',
  },
  footer: {
    marginTop: '12px',
    paddingTop: '20px',
    borderTop: '1px solid var(--sys-color-border, #E5DFD6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  secondaryLink: {
    color: 'var(--sys-color-primary, #1E3A5F)',
    fontWeight: 600,
    fontSize: '14px',
    textDecoration: 'none',
  },
  primaryButtonLink: {
    backgroundColor: 'var(--sys-color-primary, #1E3A5F)',
    color: 'var(--sys-color-on-primary, #FFFFFF)',
    padding: '10px 18px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    textDecoration: 'none',
    display: 'inline-block',
  },
  deleteButtonLink: {
    backgroundColor: '#FDF2F2',
    color: 'var(--sys-color-danger, #C0392B)',
    border: '1px solid var(--sys-color-danger, #C0392B)',
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    textDecoration: 'none',
    display: 'inline-block',
  },
  stateBox: {
    padding: '40px 20px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
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
    maxWidth: '400px',
    marginBottom: '20px',
    lineHeight: '1.5',
  },
  errorBox: {
    padding: '24px',
    backgroundColor: '#FDF2F2',
    border: '1px solid var(--sys-color-danger, #C0392B)',
    borderRadius: '8px',
  },
  errorTitle: {
    fontSize: '18px',
    color: 'var(--sys-color-danger, #C0392B)',
    marginBottom: '6px',
  },
  errorText: {
    fontSize: '14px',
    color: 'var(--sys-color-text-primary, #1C1C1C)',
    marginBottom: '16px',
  },
  navGroup: {
    marginTop: '12px',
  },
};
