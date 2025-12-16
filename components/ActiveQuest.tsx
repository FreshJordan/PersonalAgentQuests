import React, { useState, useEffect, useRef } from 'react';

interface ActiveQuestProps {
  sessionId: string;
  questId: string;
  questName: string;
  instructions: string;
  onClose: (sessionId: string) => void;
}

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

export const ActiveQuest: React.FC<ActiveQuestProps> = ({
  sessionId,
  questId,
  questName,
  instructions,
  onClose,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [response, setResponse] = useState<string | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<QuestStatus>('starting');
  const [takeoverStep, setTakeoverStep] = useState<number | null>(null);
  const [browserUrl, setBrowserUrl] = useState<string>('Agent Browser Session');
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [elapsedTime, setElapsedTime] = useState<string>('00:00');
  const [autoScroll, setAutoScroll] = useState(true);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Timer effect
  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.floor((now - startTime) / 1000);
      const minutes = Math.floor(diff / 60)
        .toString()
        .padStart(2, '0');
      const seconds = (diff % 60).toString().padStart(2, '0');
      setElapsedTime(`${minutes}:${seconds}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [loading, startTime]);

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    // We need to use a ref to track the latest status inside the effect loop
    // because the 'status' variable in the closure will be stale.
    let currentStatus: QuestStatus = 'starting';

    const startQuest = async () => {
      try {
        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: instructions,
            questId: questId,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`HTTP Error: ${res.status}`);
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        if (!reader) throw new Error('No readable stream');

        while (active) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const lines = part.split('\n');
            for (const line of lines) {
              if (line.trim().startsWith('data: ')) {
                try {
                  const jsonStr = line.replace('data: ', '').trim();
                  if (!jsonStr) continue;

                  const data = JSON.parse(jsonStr);

                  if (data.type === 'log') {
                    setLogs((prev) => [...prev, data.message]);

                    let nextStatus = currentStatus;

                    if (
                      data.message.includes('Switching to AI mode') ||
                      data.message.includes('Handing over to AI')
                    ) {
                      nextStatus = 'ai_takeover';
                      // Extract step number if available
                      const match = data.message.match(
                        /at step (\d+)|index (\d+)/
                      );
                      if (match) {
                        setTakeoverStep(parseInt(match[1] || match[2]) + 1);
                      }
                    } else if (
                      currentStatus !== 'ai_takeover' && // Don't override takeover status
                      data.message.includes('Executing cached step')
                    ) {
                      nextStatus = 'in_progress_script';
                    } else if (
                      currentStatus !== 'ai_takeover' && // Don't override takeover status
                      data.message.includes('AI Executing:')
                    ) {
                      nextStatus = 'in_progress_ai';
                    } else if (data.message.includes('Step failed:')) {
                      nextStatus = 'possible_issues';
                    }

                    if (nextStatus !== currentStatus) {
                      currentStatus = nextStatus;
                      setStatus(nextStatus);
                    }
                  } else if (data.type === 'screenshot') {
                    setScreenshot(data.image);
                    setLogs((prev) => [...prev, `[UI] Screenshot updated`]);
                  } else if (data.type === 'url_update') {
                    setBrowserUrl(data.url);
                  } else if (data.type === 'result') {
                    setResponse(data.text);
                  } else if (data.type === 'error') {
                    setError(data.message);
                    currentStatus = 'failed';
                    setStatus('failed');
                  } else if (data.type === 'done') {
                    setLoading(false);
                    if (currentStatus === 'ai_takeover') {
                      setStatus('success_takeover');
                    } else if (currentStatus === 'in_progress_ai') {
                      setStatus('success_ai');
                    } else {
                      setStatus('success_script');
                    }
                  }
                } catch (e) {
                  console.error('Error parsing JSON chunk', e);
                }
              }
            }
          }
        }
      } catch (err: any) {
        if (active && err.name !== 'AbortError') {
          setError(err.message);
          setLoading(false);
          setStatus('failed');
        }
      }
    };

    startQuest();

    return () => {
      active = false;
      controller.abort();
    };
  }, [questId, instructions]);

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
        border: '1px solid #d0d7de',
        borderRadius: '6px',
        marginBottom: '20px',
        background: 'white',
        overflow: 'hidden',
      }}
    >
      {/* Header Bar */}
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
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            style={{
              transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
              fontSize: '12px',
            }}
          >
            ▼
          </span>
          <h3 style={{ margin: 0, fontSize: '16px' }}>{questName}</h3>
          <span style={{ fontSize: '12px', color: '#666' }}>({sessionId})</span>
          <div
            style={{ marginLeft: '12px', fontSize: '14px', fontWeight: 'bold' }}
          >
            {getStatusBadge()}
          </div>
          <span
            style={{
              fontSize: '12px',
              color: '#666',
              marginLeft: '12px',
              fontFamily: 'monospace',
            }}
          >
            ⏱ {elapsedTime}
          </span>
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
          }}
        >
          End Mission
        </button>
      </div>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <div
          style={{
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: '20px',
              justifyContent: 'center',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              width: '100%',
            }}
          >
            {/* Simulated "Iframe" Browser View */}
            <div
              style={{
                width: '700px',
                height: '500px',
                border: '1px solid #ccc',
                borderRadius: '8px',
                overflow: 'hidden',
                backgroundColor: '#f5f5f5',
                position: 'relative',
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  background: '#e0e0e0',
                  padding: '8px 12px',
                  borderBottom: '1px solid #ccc',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontFamily: 'system-ui',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{ display: 'flex', gap: '6px', marginRight: '12px' }}
                >
                  <div
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: '#ff5f56',
                      border: '1px solid #e0443e',
                    }}
                  ></div>
                  <div
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: '#ffbd2e',
                      border: '1px solid #dea123',
                    }}
                  ></div>
                  <div
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: '#27c93f',
                      border: '1px solid #1aab29',
                    }}
                  ></div>
                </div>
                <div
                  style={{
                    flex: 1,
                    background: 'white',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    fontSize: '11px',
                    color: '#666',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={browserUrl}
                >
                  {browserUrl}
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  backgroundColor: 'white',
                  position: 'relative',
                }}
              >
                {screenshot ? (
                  <img
                    key={screenshot.length + Date.now()}
                    src={`data:image/jpeg;base64,${screenshot}`}
                    alt="Browser Screenshot"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      color: '#999',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ fontSize: '40px', marginBottom: '10px' }}>
                      🤖
                    </div>
                    <div>Waiting to start quest...</div>
                  </div>
                )}

                {loading && screenshot && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '10px',
                      right: '10px',
                      background: 'rgba(0,0,0,0.7)',
                      color: 'white',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                    }}
                  >
                    ● Live
                  </div>
                )}
              </div>
            </div>

            {/* Live Logs */}
            <div
              style={{
                width: '400px',
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
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <button
                    onClick={() => setAutoScroll(!autoScroll)}
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
                  {loading && (
                    <span style={{ color: '#27c93f' }}>● Active</span>
                  )}
                </div>
              </div>

              <div style={{ padding: '10px', overflowY: 'auto', flex: 1 }}>
                {logs.length === 0 && (
                  <div style={{ color: '#8b949e', fontStyle: 'italic' }}>
                    Initializing...
                  </div>
                )}
                {logs.map((log, i) => (
                  <div
                    key={i}
                    style={{ marginBottom: '6px', lineHeight: '1.4' }}
                  >
                    <span style={{ color: '#8b949e', marginRight: '8px' }}>
                      &gt;
                    </span>
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
          </div>

          {response && (
            <div
              style={{
                marginTop: '30px',
                padding: '20px',
                border: '1px solid #d0d7de',
                borderRadius: '6px',
                textAlign: 'left',
                backgroundColor: '#f6f8fa',
                width: '100%',
                marginBottom: '10px',
              }}
            >
              <strong
                style={{
                  fontSize: '18px',
                  display: 'block',
                  marginBottom: '10px',
                }}
              >
                Agent Report:
              </strong>
              <p style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                {response}
              </p>
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
        </div>
      )}
    </div>
  );
};
