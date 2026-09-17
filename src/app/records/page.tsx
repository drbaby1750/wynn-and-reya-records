'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

type RecordItem = {
  publicId: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: string | number;
  updatedAt: string | number;
};

export default function RecordsListPage() {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRecords() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch('/api/records', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const data = await response.json();

        if (!response.ok) {
          if (response.status === 401) {
            setErrorMessage('Unauthorized: Please log in to view your records.');
          } else {
            setErrorMessage(data.error || 'Failed to retrieve records.');
          }
          setIsLoading(false);
          return;
        }

        setRecords(data.records || []);
        setIsLoading(false);
      } catch (err) {
        setErrorMessage('Network error: Unable to connect to server.');
        setIsLoading(false);
      }
    }

    fetchRecords();
  }, []);

  return (
    <main style={styles.container}>
      <div style={styles.wrapper}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.pageTitle}>Wynn &amp; Reya Records</h1>
            <p style={styles.pageSubtitle}>
              Manage and view your authenticated record files
            </p>
          </div>
          <Link href="/records/new" style={styles.createButton}>
            + Create New Record
          </Link>
        </header>

        {/* 1. Loading State */}
        {isLoading && (
          <div style={styles.stateBox} role="status" aria-live="polite">
            <p style={styles.loadingText}>Loading records...</p>
          </div>
        )}

        {/* 2. Error State */}
        {!isLoading && errorMessage && (
          <div style={styles.errorBox} role="alert">
            <h2 style={styles.errorTitle}>Unable to Load Records</h2>
            <p style={styles.errorText}>{errorMessage}</p>
          </div>
        )}

        {/* 3. Genuine Empty State */}
        {!isLoading && !errorMessage && records.length === 0 && (
          <div style={styles.emptyBox}>
            <div style={styles.emptyIcon}>📂</div>
            <h2 style={styles.emptyTitle}>No records yet</h2>
            <p style={styles.emptyDescription}>
              You currently have no records. Create your first record to get started.
            </p>
            <Link href="/records/new" style={styles.createButtonSecondary}>
              Create your first record
            </Link>
          </div>
        )}

        {/* 4. Records List State */}
        {!isLoading && !errorMessage && records.length > 0 && (
          <ul style={styles.recordsList} aria-label="Wynn &amp; Reya Records">
            {records.map((record) => {
              const formattedDate = new Date(record.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <li key={record.publicId} style={styles.recordCard}>
                  <article style={styles.article}>
                    <div style={styles.cardHeader}>
                      <h2 style={styles.recordTitle}>{record.title}</h2>
                      <span style={styles.statusBadge}>{record.status}</span>
                    </div>

                    {record.description && (
                      <p style={styles.recordDesc}>{record.description}</p>
                    )}

                    <div style={styles.cardFooter}>
                      <span style={styles.dateText}>Created {formattedDate}</span>
                      <Link
                        href={`/records/${record.publicId}`}
                        aria-label={`View details for ${record.title}`}
                        style={styles.detailLink}
                      >
                        View Details →
                      </Link>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
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
    padding: '32px 16px',
    display: 'flex',
    justifyContent: 'center',
  },
  wrapper: {
    maxWidth: '800px',
    width: '100%',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '28px',
    borderBottom: '1px solid var(--sys-color-border, #E5DFD6)',
    paddingBottom: '20px',
    flexWrap: 'wrap',
    gap: '16px',
  },
  pageTitle: {
    fontSize: '26px',
    fontWeight: 600,
    color: 'var(--sys-color-primary, #1E3A5F)',
  },
  pageSubtitle: {
    fontSize: '14px',
    color: 'var(--sys-color-text-secondary, #6B6B6B)',
    marginTop: '4px',
  },
  createButton: {
    backgroundColor: 'var(--sys-color-primary, #1E3A5F)',
    color: 'var(--sys-color-on-primary, #FFFFFF)',
    padding: '10px 18px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    textDecoration: 'none',
    display: 'inline-block',
  },
  createButtonSecondary: {
    backgroundColor: 'var(--sys-color-secondary, #C97B3D)',
    color: 'var(--sys-color-on-primary, #FFFFFF)',
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    textDecoration: 'none',
    display: 'inline-block',
    marginTop: '16px',
  },
  stateBox: {
    padding: '48px',
    textAlign: 'center',
    backgroundColor: 'var(--sys-color-surface, #FFFFFF)',
    border: '1px solid var(--sys-color-border, #E5DFD6)',
    borderRadius: '12px',
  },
  loadingText: {
    fontSize: '16px',
    color: 'var(--sys-color-text-secondary, #6B6B6B)',
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
  },
  emptyBox: {
    padding: '48px 24px',
    textAlign: 'center',
    backgroundColor: 'var(--sys-color-surface, #FFFFFF)',
    border: '1px solid var(--sys-color-border, #E5DFD6)',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '12px',
  },
  emptyTitle: {
    fontSize: '20px',
    fontWeight: 600,
    color: 'var(--sys-color-primary, #1E3A5F)',
    marginBottom: '8px',
  },
  emptyDescription: {
    fontSize: '14px',
    color: 'var(--sys-color-text-secondary, #6B6B6B)',
    maxWidth: '420px',
    lineHeight: '1.5',
  },
  recordsList: {
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  recordCard: {
    backgroundColor: 'var(--sys-color-surface, #FFFFFF)',
    border: '1px solid var(--sys-color-border, #E5DFD6)',
    borderRadius: '10px',
    padding: '20px',
    boxShadow: 'var(--effect-soft-shadow, 0 4px 12px rgba(0, 0, 0, 0.03))',
  },
  article: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  },
  recordTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: 'var(--sys-color-primary, #1E3A5F)',
  },
  statusBadge: {
    backgroundColor: '#E8EEF5',
    color: 'var(--sys-color-primary, #1E3A5F)',
    fontSize: '12px',
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: '12px',
    textTransform: 'uppercase',
  },
  recordDesc: {
    fontSize: '14px',
    color: 'var(--sys-color-text-secondary, #6B6B6B)',
    lineHeight: '1.4',
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '6px',
    paddingTop: '12px',
    borderTop: '1px solid #F1F5F9',
  },
  dateText: {
    fontSize: '12px',
    color: '#94A3B8',
  },
  detailLink: {
    color: 'var(--sys-color-primary, #1E3A5F)',
    fontWeight: 600,
    fontSize: '14px',
    textDecoration: 'none',
  },
};
