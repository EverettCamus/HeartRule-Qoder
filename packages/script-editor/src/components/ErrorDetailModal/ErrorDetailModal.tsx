/**
 * Error Detail Modal Component
 * 错误详情弹窗组件
 */

import React from 'react';

import type { DetailedError } from '../../types/error';

interface ErrorDetailModalProps {
  error: DetailedError;
  isOpen: boolean;
  onClose: () => void;
}

const ErrorDetailModal: React.FC<ErrorDetailModalProps> = ({ error, isOpen, onClose }) => {
  if (!isOpen) return null;

  const handleCopyDetails = () => {
    const details = JSON.stringify(error, null, 2);
    navigator.clipboard.writeText(details);
    alert('Error details copied to clipboard');
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '600px',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, marginBottom: '16px' }}>Error Details</h2>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Error Code:</div>
          <div style={{ fontFamily: 'monospace', color: '#c33' }}>{error.code}</div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Error Type:</div>
          <div>{error.type}</div>
        </div>

        {error.context?.timestamp && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Time:</div>
            <div>{new Date(error.context.timestamp).toLocaleString()}</div>
          </div>
        )}

        {error.context?.position && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Execution Position:</div>
            <div style={{ fontSize: '14px' }}>
              <div>Phase: {error.context.position.phaseId}</div>
              <div>Topic: {error.context.position.topicId}</div>
              <div>Action: {error.context.position.actionId}</div>
            </div>
          </div>
        )}

        {error.details && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Technical Details:</div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: '13px',
                backgroundColor: '#f5f5f5',
                padding: '12px',
                borderRadius: '4px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {error.details}
            </div>
          </div>
        )}

        {error.recovery?.suggestion && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Fix Suggestion:</div>
            <div style={{ color: '#666' }}>{error.recovery.suggestion}</div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={handleCopyDetails}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              backgroundColor: 'white',
              cursor: 'pointer',
            }}
          >
            Copy Details
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: '#1890ff',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorDetailModal;
