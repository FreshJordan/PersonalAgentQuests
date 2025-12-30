import React from 'react';

type QuestStatus =
  | 'starting'
  | 'in_progress_ai'
  | 'in_progress_script'
  | 'ai_takeover'
  | 'possible_issues'
  | 'failed'
  | 'success_ai'
  | 'success_script'
  | 'success_takeover';

interface HeaderProps {
  questName: string;
  sessionId: string;
  status: QuestStatus;
  elapsedTime: string;
  inputTokens: number;
  outputTokens: number;
  isCollapsed: boolean;
  takeoverStep: number | null;
  onToggleCollapse: () => void;
  onClose: (sessionId: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  questName,
  sessionId,
  status,
  elapsedTime,
  inputTokens,
  outputTokens,
  isCollapsed,
  takeoverStep,
  onToggleCollapse,
  onClose,
}) => {
  const getStatusBadge = () => {
    switch (status) {
      case 'starting':
        return <span style={{ color: '#0969da' }}>🔵 Starting...</span>;
      case 'in_progress_script':
        return <span style={{ color: '#9a6700' }}>⚡ Running Script</span>;
      case 'in_progress_ai':
        return <span style={{ color: '#8250df' }}>🤖 AI Thinking</span>;
      case 'ai_takeover':
        return <span style={{ color: '#d97706' }}>🔄 AI Takeover</span>;
      case 'possible_issues':
        return <span style={{ color: '#bf8700' }}>⚠️ Issues Detected</span>;
      case 'failed':
        return <span style={{ color: '#cf222e' }}>🔴 Failed</span>;
      case 'success_ai':
        return <span style={{ color: '#1a7f37' }}>✅ Success (Full AI)</span>;
      case 'success_script':
        return <span style={{ color: '#1a7f37' }}>✅ Success (Script)</span>;
      case 'success_takeover':
        return (
          <span style={{ color: '#d97706' }}>
            ✅ Success (Takeover @ Step {takeoverStep || '?'})
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div
      style={{
        padding: '12px 16px',
        background: '#f6f8fa',
        borderBottom: isCollapsed ? 'none' : '1px solid #d0d7de',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        cursor: 'pointer',
      }}
      onClick={onToggleCollapse}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flex: 1,
        }}
      >
        <div
          style={{
            width: '16px',
            height: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
              fontSize: '10px',
            }}
          >
            ▼
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              margin: 0,
              fontSize: '15px',
              fontWeight: '600',
              lineHeight: '1',
              color: '#24292f',
            }}
          >
            {questName}
          </div>
          <div
            style={{
              fontSize: '12px',
              color: '#57606a',
              lineHeight: '1',
              paddingTop: '2px',
            }}
          >
            ({sessionId})
          </div>
        </div>

        <div
          style={{
            fontSize: '13px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            height: '20px',
          }}
        >
          {getStatusBadge()}
        </div>

        <div
          style={{
            fontSize: '12px',
            color: '#57606a',
            fontFamily:
              'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>⏱</span>
          <span>{elapsedTime}</span>
        </div>

        {(inputTokens > 0 || outputTokens > 0) && (
          <div
            style={{
              fontSize: '12px',
              color: '#57606a',
              fontFamily:
                'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginLeft: '8px',
              borderLeft: '1px solid #d0d7de',
              paddingLeft: '12px',
            }}
          >
            <span title="Input Tokens">⬇️ {inputTokens.toLocaleString()}</span>
            <span title="Output Tokens">
              ⬆️ {outputTokens.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose(sessionId);
        }}
        style={{
          padding: '4px 8px',
          backgroundColor: '#cf222e',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
          marginLeft: '16px',
          lineHeight: '1.5',
        }}
      >
        End Mission
      </button>
    </div>
  );
};
