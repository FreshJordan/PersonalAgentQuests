import React, { useState } from 'react';

interface AgentReportProps {
  response: string | null;
  error: string | null;
  showFollowUp?: boolean;
  isFollowUpLoading?: boolean;
  onFollowUpSubmit?: (message: string) => void;
}

export const AgentReport: React.FC<AgentReportProps> = ({
  response,
  error,
  showFollowUp = false,
  isFollowUpLoading = false,
  onFollowUpSubmit,
}) => {
  const [followUpText, setFollowUpText] = useState('');
  const [isReportCollapsed, setIsReportCollapsed] = useState(false);

  const handleSubmit = () => {
    if (followUpText.trim() && onFollowUpSubmit) {
      onFollowUpSubmit(followUpText.trim());
      setFollowUpText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
  };

  return (
    <>
      {response && (
        <div
          style={{
            marginTop: '30px',
            border: '1px solid #d0d7de',
            borderRadius: '6px',
            textAlign: 'left',
            backgroundColor: '#f6f8fa',
            width: '100%',
            marginBottom: '10px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '15px 20px',
              backgroundColor: '#e8eef3',
              borderBottom: isReportCollapsed ? 'none' : '1px solid #d0d7de',
              cursor: 'pointer',
            }}
            onClick={() => setIsReportCollapsed(!isReportCollapsed)}
          >
            <strong style={{ fontSize: '18px' }}>Agent Report</strong>
            <span
              style={{
                fontSize: '14px',
                color: '#656d76',
                userSelect: 'none',
              }}
            >
              {isReportCollapsed ? '▶ Show' : '▼ Hide'}
            </span>
          </div>
          {!isReportCollapsed && (
            <div style={{ padding: '20px' }}>
              <p style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                {response}
              </p>
            </div>
          )}
        </div>
      )}

      {showFollowUp && response && !error && (
        <div
          style={{
            width: '100%',
            marginTop: '10px',
            padding: '15px',
            border: '1px solid #d0d7de',
            borderRadius: '6px',
            backgroundColor: 'white',
          }}
        >
          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '600',
              fontSize: '14px',
            }}
          >
            Follow-up Question or Request:
          </label>
          <textarea
            value={followUpText}
            onChange={(e) => setFollowUpText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isFollowUpLoading}
            placeholder="Ask questions, propose changes, or request modifications... (⌘+Enter to submit)"
            style={{
              width: '100%',
              minHeight: '80px',
              padding: '10px',
              fontSize: '14px',
              border: '1px solid #d0d7de',
              borderRadius: '6px',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!followUpText.trim() || isFollowUpLoading}
            style={{
              marginTop: '10px',
              padding: '8px 16px',
              backgroundColor: followUpText.trim() ? '#2da44e' : '#94d3a2',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: followUpText.trim() ? 'pointer' : 'not-allowed',
              fontWeight: '600',
              fontSize: '14px',
            }}
          >
            {isFollowUpLoading ? 'Processing...' : 'Send Follow-up'}
          </button>
          <span
            style={{
              marginLeft: '10px',
              fontSize: '12px',
              color: '#656d76',
            }}
          >
            Tip: Use ⌘+Enter (Ctrl+Enter on Windows) to submit
          </span>
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: '20px',
            color: '#cf222e',
            textAlign: 'left',
            background: '#ffebe9',
            padding: '15px',
            borderRadius: '6px',
            border: '1px solid #ff818266',
            width: '100%',
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}
    </>
  );
};
