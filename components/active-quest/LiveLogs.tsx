import React, { useRef, useEffect } from 'react';

interface LiveLogsProps {
  logs: string[];
  loading: boolean;
  autoScroll: boolean;
  onToggleAutoScroll: () => void;
  maxWidth?: string;
}

export const LiveLogs: React.FC<LiveLogsProps> = ({
  logs,
  loading,
  autoScroll,
  onToggleAutoScroll,
  maxWidth = '400px',
}) => {
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      const parent = logsEndRef.current.parentElement;
      if (parent) {
        parent.scrollTop = parent.scrollHeight;
      }
    }
  }, [logs, autoScroll]);

  return (
    <div
      style={{
        width: '100%',
        maxWidth,
        height: '500px',
        border: '1px solid #333',
        borderRadius: '8px',
        backgroundColor: '#0d1117',
        color: '#58a6ff',
        fontFamily: 'Monaco, monospace',
        fontSize: '12px',
        textAlign: 'left',
        padding: '0',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          background: '#161b22',
          padding: '8px 12px',
          borderBottom: '1px solid #30363d',
          color: '#c9d1d9',
          fontWeight: 'bold',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>Mission Logs</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={onToggleAutoScroll}
            style={{
              background: 'none',
              border: '1px solid #30363d',
              borderRadius: '4px',
              color: autoScroll ? '#27c93f' : '#8b949e',
              cursor: 'pointer',
              fontSize: '10px',
              padding: '2px 6px',
            }}
            title="Toggle Auto-Scroll"
          >
            {autoScroll ? 'Scroll: ON' : 'Scroll: OFF'}
          </button>
          {loading && <span style={{ color: '#27c93f' }}>● Active</span>}
        </div>
      </div>

      <div style={{ padding: '10px', overflowY: 'auto', flex: 1 }}>
        {logs.length === 0 && (
          <div style={{ color: '#8b949e', fontStyle: 'italic' }}>
            Initializing...
          </div>
        )}
        {logs.map((log, i) => (
          <div key={i} style={{ marginBottom: '6px', lineHeight: '1.4' }}>
            <span style={{ color: '#8b949e', marginRight: '8px' }}>&gt;</span>
            {log.startsWith('[UI]') ? (
              <span style={{ color: '#7ee787' }}>{log}</span>
            ) : (
              log
            )}
            {log.startsWith('[Runner]') ? (
              <span style={{ color: '#d2a8ff' }}>{log}</span>
            ) : null}
            {!log.startsWith('[UI]') && !log.startsWith('[Runner]')
              ? log
              : null}
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
};
