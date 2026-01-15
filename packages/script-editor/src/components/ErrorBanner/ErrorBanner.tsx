/**
 * Error Banner Component
 * 错误提示条组件
 */

import React from 'react';

import type { DetailedError } from '../../types/error';

interface ErrorBannerProps {
  error: DetailedError;
  onViewDetails?: () => void;
  onRestart?: () => void;
  onDismiss?: () => void;
}

const ErrorBanner: React.FC<ErrorBannerProps> = ({
  error,
  onViewDetails,
  onRestart,
  onDismiss,
}) => {
  const getErrorTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      syntax: 'Syntax Error',
      configuration: 'Configuration Error',
      runtime: 'Runtime Error',
      session: 'Session Error',
      system: 'System Error',
    };
    return labels[type] || 'Error';
  };

  return (
    <div
      style={{
        backgroundColor: '#fee',
        border: '1px solid #fcc',
        borderRadius: '4px',
        padding: '12px 16px',
        marginBottom: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <span style={{ fontSize: '20px' }}>⚠️</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 'bold', color: '#c33' }}>{getErrorTypeLabel(error.type)}</div>
        <div style={{ fontSize: '14px', marginTop: '4px' }}>{error.message}</div>
        {error.context?.scriptName && (
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            Script: {error.context.scriptName}
          </div>
        )}
        {error.context?.position && (
          <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
            Position: Phase {error.context.position.phaseIndex} → Topic{' '}
            {error.context.position.topicIndex} → Action {error.context.position.actionIndex}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {onViewDetails && (
          <button
            onClick={onViewDetails}
            style={{
              padding: '6px 12px',
              fontSize: '14px',
              border: '1px solid #c33',
              borderRadius: '4px',
              backgroundColor: 'white',
              color: '#c33',
              cursor: 'pointer',
            }}
          >
            View Details
          </button>
        )}
        {onRestart && (
          <button
            onClick={onRestart}
            style={{
              padding: '6px 12px',
              fontSize: '14px',
              border: '1px solid #c33',
              borderRadius: '4px',
              backgroundColor: '#c33',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            Restart Debug
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              padding: '6px 12px',
              fontSize: '14px',
              border: '1px solid #999',
              borderRadius: '4px',
              backgroundColor: 'white',
              color: '#666',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
};

export default ErrorBanner;
