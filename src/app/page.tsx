'use client';

import React, { useState, useEffect, useCallback, ChangeEvent, FormEvent } from 'react';

type UploadState = 'idle' | 'selected' | 'uploading' | 'success' | 'error';
type JobStatus = 'pending' | 'processing' | 'done' | 'failed';

interface UploadedFileRecord {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

interface JobRecord {
  id: string;
  jobType: string;
  status: JobStatus;
  createdAt: string;
  extractedNumber?: string | null;
  result?: any;
  errorMessage?: string | null;
}

interface FollowupResponse {
  answer: string;
  suggestedNextSteps: string[];
  additionalWarnings: string[];
}

export default function ContainerUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [uploadedRecord, setUploadedRecord] = useState<UploadedFileRecord | null>(null);
  const [createdJob, setCreatedJob] = useState<JobRecord | null>(null);
  const [authenticatedUser, setAuthenticatedUser] = useState<{ id: string; email: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [checkingJobStatus, setCheckingJobStatus] = useState(false);
  const [processingJob, setProcessingJob] = useState(false);
  const [followupQuestion, setFollowupQuestion] = useState('');
  const [followupLoading, setFollowupLoading] = useState(false);
  const [followupResult, setFollowupResult] = useState<FollowupResponse | null>(null);
  const [followupError, setFollowupError] = useState<string | null>(null);

  // Auto-poll job status when processing
  const fetchJobStatus = useCallback(async () => {
    if (!createdJob) return;
    setCheckingJobStatus(true);
    try {
      const res = await fetch(`/api/jobs/${createdJob.id}`);
      const data = await res.json();
      if (res.ok && data.job) {
        setCreatedJob(data.job);
      }
    } catch (err) {
      console.error('Failed to refresh job status');
    } finally {
      setCheckingJobStatus(false);
    }
  }, [createdJob]);

  // Auto-poll when job is processing
  useEffect(() => {
    if (createdJob?.status === 'processing') {
      const interval = setInterval(fetchJobStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [createdJob?.status, fetchJobStatus]);

  // Authenticate Demo Session
  const handleDemoAuthenticate = async () => {
    setAuthLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/demo-session', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.user) {
        setAuthenticatedUser(data.user);
      } else {
        setErrorMsg(data.error || 'Failed to authenticate demo user.');
      }
    } catch {
      setErrorMsg('Network error authenticating demo user.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setUploadState('selected');
      setErrorMsg(null);
      setUploadedRecord(null);
      setCreatedJob(null);
      setFollowupResult(null);
      setFollowupError(null);
    }
  };

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setErrorMsg('Please select a container document or image to upload.');
      return;
    }

    setUploadState('uploading');
    setErrorMsg(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setUploadState('success');
        setUploadedRecord(data.file);
        setCreatedJob(data.job);
      } else {
        setUploadState('error');
        setErrorMsg(data.error || 'Upload failed. Please try again.');
      }
    } catch (err) {
      setUploadState('error');
      setErrorMsg('Network error uploading file to server.');
    }
  };

  const handleProcessJob = async () => {
    if (!createdJob) return;
    setProcessingJob(true);
    setErrorMsg(null);

    // Immediately update local job state to processing for instant visual feedback
    setCreatedJob((prev) => (prev ? { ...prev, status: 'processing' } : null));

    try {
      const res = await fetch(`/api/jobs/${createdJob.id}/process`, { method: 'POST' });
      const data = await res.json();
      if (data.job) {
        setCreatedJob(data.job);
      }
      if (!res.ok) {
        // Suppress 409 "Job is already processing" error notification as requested
        if (res.status === 409 || data.job?.status === 'processing') {
          return;
        }
        setErrorMsg(data.error || 'Failed to process job.');
      }
    } catch (err) {
      setErrorMsg('Network error triggering job processing.');
    } finally {
      setProcessingJob(false);
    }
  };

  const handleFollowup = async (e: FormEvent) => {
    e.preventDefault();
    if (!createdJob || !followupQuestion.trim()) return;
    setFollowupLoading(true);
    setFollowupError(null);
    setFollowupResult(null);

    try {
      const res = await fetch(`/api/jobs/${createdJob.id}/followup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: followupQuestion.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFollowupResult(data.followup);
        setFollowupQuestion('');
      } else {
        setFollowupError(data.error || 'Failed to process follow-up.');
      }
    } catch (err) {
      setFollowupError('Network error sending follow-up question.');
    } finally {
      setFollowupLoading(false);
    }
  };

  const resetUpload = () => {
    setFile(null);
    setUploadState('idle');
    setErrorMsg(null);
    setUploadedRecord(null);
    setCreatedJob(null);
    setFollowupResult(null);
    setFollowupError(null);
    setFollowupQuestion('');
  };

  const getStatusDisplay = (status: JobStatus) => {
    switch (status) {
      case 'pending':
        return {
          label: 'Pending',
          bg: '#e0f2fe',
          color: '#0369a1',
          borderColor: '#bae6fd',
          icon: '⏳',
          message: 'Your container document is waiting to be processed.',
        };
      case 'processing':
        return {
          label: 'Processing',
          bg: '#e0f2fe',
          color: '#0284c7',
          borderColor: '#38bdf8',
          icon: '⚙️',
          message: 'AI is analyzing your container document...',
        };
      case 'done':
        return {
          label: 'Completed',
          bg: '#dcfce7',
          color: '#15803d',
          borderColor: '#86efac',
          icon: '✅',
          message: 'Processing completed successfully.',
        };
      case 'failed':
        return {
          label: 'Failed',
          bg: '#fee2e2',
          color: '#b91c1c',
          borderColor: '#fca5a5',
          icon: '❌',
          message: 'Processing failed. You can retry.',
        };
    }
  };

  const getVerificationStatusStyle = (status: string) => {
    switch (status) {
      case 'valid_format':
        return { bg: '#dcfce7', color: '#15803d', border: '#86efac', label: 'Valid Format' };
      case 'suspicious_format':
        return { bg: '#fef3c7', color: '#b45309', border: '#fcd34d', label: 'Suspicious Format' };
      case 'unable_to_verify':
        return { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1', label: 'Unable to Verify' };
      case 'requires_manual_verification':
        return { bg: '#fef3c7', color: '#b45309', border: '#fcd34d', label: 'Manual Verification Required' };
      default:
        return { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1', label: status };
    }
  };

  return (
    <main style={{ padding: '2rem 1rem', maxWidth: '860px', margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <header style={{ marginBottom: '2rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.025em' }}>
              Wynn &amp; Reya
            </h1>
            <p style={{ color: '#0284c7', fontSize: '0.875rem', marginTop: '0.25rem', fontWeight: 500 }}>
              Container &amp; Invoice Verification System
            </p>
          </div>
          <div>
            {authenticatedUser ? (
              <span style={{ fontSize: '0.8125rem', backgroundColor: '#dcfce7', color: '#15803d', padding: '0.375rem 0.75rem', borderRadius: '9999px', border: '1px solid #86efac', fontWeight: 500 }}>
                Session Active: {authenticatedUser.email}
              </span>
            ) : (
              <button
                type="button"
                onClick={handleDemoAuthenticate}
                disabled={authLoading}
                style={{
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '0.8125rem',
                  padding: '0.5rem 1.125rem',
                  borderRadius: '0.375rem',
                  transition: 'background-color 0.2s',
                  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                }}
              >
                {authLoading ? 'Signing in...' : 'Sign In'}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Upload & Job Status Box */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '0.75rem',
          border: '1px solid #e2e8f0',
          padding: '2rem',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)',
        }}
      >
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', color: '#0f172a' }}>
          Upload Container Document
        </h2>
        <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem' }}>
          Upload a container document or photo to automatically extract and verify its ISO container number.
        </p>

        {/* Specifications Box */}
        <div
          style={{
            backgroundColor: '#f0f9ff',
            borderLeft: '4px solid #0284c7',
            padding: '0.875rem 1rem',
            borderRadius: '0.375rem',
            marginBottom: '1.5rem',
            fontSize: '0.8125rem',
            color: '#334155',
          }}
        >
          <div style={{ fontWeight: 600, color: '#0369a1', marginBottom: '0.25rem' }}>Upload Specifications:</div>
          <ul style={{ paddingLeft: '1.25rem', lineHeight: '1.5' }}>
            <li><strong>Allowed Formats:</strong> PNG, JPEG, WebP, PDF</li>
            <li><strong>Max File Size:</strong> 10 MB</li>
          </ul>
        </div>

        {/* Upload Form */}
        <form onSubmit={handleUpload}>
          <div
            style={{
              border: uploadState === 'selected' ? '2px dashed #0284c7' : '2px dashed #cbd5e1',
              borderRadius: '0.5rem',
              padding: '2rem 1rem',
              textAlign: 'center',
              backgroundColor: uploadState === 'selected' ? 'rgba(2, 132, 199, 0.05)' : '#f8fafc',
              transition: 'all 0.2s',
              cursor: 'pointer',
              marginBottom: '1.5rem',
            }}
          >
            <input
              id="file-upload-input"
              type="file"
              accept=".png,.jpeg,.jpg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <label htmlFor="file-upload-input" style={{ cursor: 'pointer', display: 'block', width: '100%' }}>
              {uploadState === 'idle' && (
                <div>
                  <svg style={{ width: '40px', height: '40px', color: '#0284c7', margin: '0 auto 0.75rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span style={{ fontSize: '0.9375rem', fontWeight: 500, color: '#1e293b' }}>
                    Click to select a file or drag &amp; drop
                  </span>
                </div>
              )}

              {uploadState === 'selected' && file && (
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#0284c7', marginBottom: '0.25rem' }}>
                    {file.name}
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                    {(file.size / (1024 * 1024)).toFixed(2)} MB • {file.type || 'Document'}
                  </div>
                </div>
              )}
            </label>
          </div>

          {/* Error Message Alert */}
          {errorMsg && (
            <div
              style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fca5a5',
                color: '#b91c1c',
                padding: '0.75rem 1rem',
                borderRadius: '0.375rem',
                marginBottom: '1.25rem',
                fontSize: '0.875rem',
              }}
            >
              <strong>Error:</strong> {errorMsg}
            </div>
          )}

          {/* Success & Job Status Panel */}
          {uploadState === 'success' && uploadedRecord && createdJob && (
            <div
              style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '0.5rem',
                padding: '1.25rem',
                marginBottom: '1.5rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0f172a' }}>
                  {getStatusDisplay(createdJob.status).icon} AI Verification Job
                </span>
                {(() => {
                  const statusInfo = getStatusDisplay(createdJob.status);
                  return (
                    <span
                      style={{
                        backgroundColor: statusInfo.bg,
                        color: statusInfo.color,
                        border: `1px solid ${statusInfo.borderColor}`,
                        padding: '0.25rem 0.625rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {statusInfo.label}
                    </span>
                  );
                })()}
              </div>

              <div style={{ fontSize: '0.8125rem', color: '#334155', lineHeight: '1.6', marginBottom: '1rem' }}>
                <div><strong>Job ID:</strong> <code style={{ backgroundColor: '#e2e8f0', color: '#1e293b', padding: '0.125rem 0.375rem', borderRadius: '0.25rem', fontSize: '0.75rem' }}>{createdJob.id}</code></div>
                <div><strong>File:</strong> {uploadedRecord.originalName} ({(uploadedRecord.sizeBytes / 1024).toFixed(1)} KB)</div>
                <div style={{ marginTop: '0.5rem', fontStyle: 'italic', color: getStatusDisplay(createdJob.status).color }}>
                  &bull; {getStatusDisplay(createdJob.status).message}
                </div>
              </div>

              {/* Action Buttons for Job */}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {(createdJob.status === 'pending' || createdJob.status === 'failed') && (
                  <button
                    type="button"
                    onClick={handleProcessJob}
                    disabled={processingJob}
                    style={{
                      backgroundColor: '#0284c7',
                      color: '#ffffff',
                      fontWeight: 600,
                      fontSize: '0.8125rem',
                      padding: '0.375rem 0.875rem',
                      borderRadius: '0.375rem',
                      opacity: processingJob ? 0.6 : 1,
                    }}
                  >
                    {processingJob ? 'Starting...' : createdJob.status === 'failed' ? '🔄 Retry Processing' : '🚀 Process with AI'}
                  </button>
                )}
                {createdJob.status === 'processing' && (
                  <span style={{ fontSize: '0.8125rem', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙️</span>
                    Processing... auto-refreshing
                  </span>
                )}
                <button
                  type="button"
                  onClick={fetchJobStatus}
                  disabled={checkingJobStatus}
                  style={{
                    backgroundColor: '#e2e8f0',
                    color: '#1e293b',
                    fontWeight: 500,
                    fontSize: '0.8125rem',
                    padding: '0.375rem 0.875rem',
                    borderRadius: '0.375rem',
                  }}
                >
                  {checkingJobStatus ? 'Refreshing...' : '↻ Refresh Status'}
                </button>
              </div>

              {/* Verification Results */}
              {createdJob.status === 'done' && createdJob.result && (
                <div style={{ marginTop: '1.25rem' }}>
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                    <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.75rem' }}>
                      🔍 Verification Results
                    </h3>

                    {/* Extracted Container Number */}
                    {createdJob.extractedNumber && (
                      <div style={{
                        backgroundColor: '#f0f9ff',
                        border: '1px solid #0284c7',
                        borderRadius: '0.375rem',
                        padding: '0.75rem 1rem',
                        marginBottom: '0.75rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}>
                        <span style={{ fontSize: '0.8125rem', color: '#334155' }}>Container Number</span>
                        <span style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0369a1', fontFamily: 'monospace', letterSpacing: '0.1em' }}>
                          {createdJob.extractedNumber}
                        </span>
                      </div>
                    )}

                    {/* Verification Status */}
                    {createdJob.result.stage2_verification && (() => {
                      const v = createdJob.result.stage2_verification;
                      const vstyle = getVerificationStatusStyle(v.verificationStatus);
                      return (
                        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.375rem', padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>Verification Status</span>
                            <span style={{ backgroundColor: vstyle.bg, color: vstyle.color, border: `1px solid ${vstyle.border}`, padding: '0.2rem 0.5rem', borderRadius: '9999px', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase' }}>
                              {vstyle.label}
                            </span>
                          </div>
                          <p style={{ fontSize: '0.8125rem', color: '#334155', lineHeight: '1.5', marginBottom: '0.5rem' }}>
                            {v.explanation}
                          </p>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            Confidence: {(v.confidence * 100).toFixed(0)}% • Format Valid: {v.formatValid ? '✓' : '✗'}
                            {v.requiresManualVerification && ' • ⚠ Manual Verification Recommended'}
                          </div>
                          {v.detectedIssues && v.detectedIssues.length > 0 && (
                            <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#fffbebeb', borderRadius: '0.25rem', fontSize: '0.75rem', color: '#b45309', border: '1px solid #fcd34d' }}>
                              <strong>Issues:</strong> {v.detectedIssues.join('; ')}
                            </div>
                          )}
                          {v.metadata && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
                              {v.metadata.ownerCode && <span>Owner: {v.metadata.ownerCode} </span>}
                              {v.metadata.categoryIdentifier && <span>• Category: {v.metadata.categoryIdentifier} </span>}
                              {v.metadata.serialNumber && <span>• Serial: {v.metadata.serialNumber} </span>}
                              {v.metadata.checkDigit && <span>• Check: {v.metadata.checkDigit} </span>}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Follow-up Section */}
                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem', marginTop: '0.5rem' }}>
                      <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.5rem' }}>
                        💬 Ask a Follow-up Question
                      </h4>
                      <form onSubmit={handleFollowup} style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                          id="followup-question-input"
                          type="text"
                          value={followupQuestion}
                          onChange={(e) => setFollowupQuestion(e.target.value)}
                          placeholder="e.g., Is this container number safe to process through customs?"
                          style={{
                            flex: 1,
                            backgroundColor: '#ffffff',
                            border: '1px solid #cbd5e1',
                            color: '#0f172a',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.375rem',
                            fontSize: '0.8125rem',
                            fontFamily: 'inherit',
                          }}
                          maxLength={1000}
                        />
                        <button
                          type="submit"
                          disabled={followupLoading || !followupQuestion.trim()}
                          style={{
                            backgroundColor: followupLoading || !followupQuestion.trim() ? '#e2e8f0' : '#0284c7',
                            color: followupLoading || !followupQuestion.trim() ? '#94a3b8' : '#ffffff',
                            fontWeight: 600,
                            fontSize: '0.8125rem',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.375rem',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {followupLoading ? 'Asking...' : 'Ask'}
                        </button>
                      </form>

                      {followupError && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: '#b91c1c' }}>
                          {followupError}
                        </div>
                      )}

                      {followupResult && (
                        <div style={{
                          marginTop: '0.75rem',
                          backgroundColor: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '0.375rem',
                          padding: '0.75rem 1rem',
                        }}>
                          <p style={{ fontSize: '0.8125rem', color: '#334155', lineHeight: '1.6', marginBottom: '0.5rem' }}>
                            {followupResult.answer}
                          </p>
                          {followupResult.suggestedNextSteps.length > 0 && (
                            <div style={{ marginTop: '0.5rem' }}>
                              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0284c7', marginBottom: '0.25rem' }}>Suggested Next Steps:</div>
                              <ul style={{ fontSize: '0.75rem', color: '#475569', paddingLeft: '1rem', lineHeight: '1.5' }}>
                                {followupResult.suggestedNextSteps.map((step, i) => (
                                  <li key={i}>{step}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {followupResult.additionalWarnings.length > 0 && (
                            <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#fffbebeb', borderRadius: '0.25rem', border: '1px solid #fcd34d' }}>
                              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#b45309', marginBottom: '0.25rem' }}>⚠ Warnings:</div>
                              <ul style={{ fontSize: '0.75rem', color: '#b45309', paddingLeft: '1rem', lineHeight: '1.5' }}>
                                {followupResult.additionalWarnings.map((w, i) => (
                                  <li key={i}>{w}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Error Details for Failed Jobs */}
              {createdJob.status === 'failed' && createdJob.errorMessage && (
                <div style={{
                  marginTop: '0.75rem',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fca5a5',
                  borderRadius: '0.375rem',
                  padding: '0.75rem 1rem',
                  fontSize: '0.8125rem',
                  color: '#b91c1c',
                }}>
                  <strong>Error Detail:</strong> {createdJob.errorMessage}
                </div>
              )}
            </div>
          )}

          {/* Form Submit / Reset Actions */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            {uploadState === 'success' ? (
              <button
                type="button"
                onClick={resetUpload}
                style={{
                  backgroundColor: '#e2e8f0',
                  color: '#1e293b',
                  fontWeight: 500,
                  fontSize: '0.875rem',
                  padding: '0.625rem 1.25rem',
                  borderRadius: '0.375rem',
                }}
              >
                Upload Another File
              </button>
            ) : (
              <button
                type="submit"
                disabled={!file || uploadState === 'uploading'}
                style={{
                  backgroundColor: !file || uploadState === 'uploading' ? '#e2e8f0' : '#0284c7',
                  color: !file || uploadState === 'uploading' ? '#94a3b8' : '#ffffff',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  padding: '0.625rem 1.5rem',
                  borderRadius: '0.375rem',
                  cursor: !file || uploadState === 'uploading' ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s',
                  boxShadow: !file || uploadState === 'uploading' ? 'none' : '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                }}
              >
                {uploadState === 'uploading' ? 'Uploading & Creating Job...' : 'Upload & Create Job'}
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Disclaimer */}
      <footer style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.6875rem', color: '#64748b', lineHeight: '1.4' }}>
        <p>
          ⚠ This system performs structural ISO 6346 format verification only.
          Results are NOT official customs authentication or legally binding validation.
        </p>
      </footer>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
}
