import React, { useState, useEffect, useRef } from 'react';

interface ActiveQuestProps {
  sessionId: string;
  questId: string;
  questName: string;
  instructions: string;
  onClose: (sessionId: string) => void;
  hideBrowser?: boolean;
  userInput?: string;
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
  hideBrowser,
  userInput,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [response, setResponse] = useState<string | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<QuestStatus>('starting');
  const [takeoverStep, setTakeoverStep] = useState<number | null>(null);
  const [ticketList, setTicketList] = useState<
    { key: string; summary: string; description?: string | null }[]
  >([]);
  const [selectedTickets, setSelectedTickets] = useState<string[]>([]);
  const [browserUrl, setBrowserUrl] = useState<string>('Agent Browser Session');
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [elapsedTime, setElapsedTime] = useState<string>('00:00');
  const [autoScroll, setAutoScroll] = useState(true);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Timer effect
  useEffect(() => {
    // Stop timer if we are done or failed or successful
    const isFinished = [
      'failed',
      'success_ai',
      'success_script',
      'success_takeover',
    ].includes(status);

    if (!loading || isFinished) return;

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
  }, [loading, startTime, status]);

  // Auto-scroll logs: SCOPED to the log container, not window
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      // Use scrollIntoView with block: 'nearest' or just scrollTop on parent to avoid window jump
      // Using scrollIntoView on the element can sometimes scroll the whole page if it's off screen.
      // Safer approach for chat logs in a container:
      const parent = logsEndRef.current.parentElement;
      if (parent) {
        parent.scrollTop = parent.scrollHeight;
      }
    }
  }, [logs, autoScroll]);

  // Auto-expand if script starts
  useEffect(() => {
    if (status === 'in_progress_ai') {
      setIsCollapsed(false);
    }
  }, [status]);

  const handleTicketToggle = (key: string) => {
    setSelectedTickets([key]); // Single select
  };

  const handleResearchSelected = async () => {
    setTicketList([]); // Clear list to show progress
    setLoading(true);
    setStatus('in_progress_ai'); // Or similar status

    // Send the selected tickets back to the server to continue
    // We need to re-initiate the fetch loop effectively, or hit a new endpoint?
    // Since this is SSE, we can't easily "reply". We have to start a new request/session context or restart the fetch.
    // Re-calling startQuest with new params works if we designed it to handle "continue" or "phase 2".
    // Our API handler supports `selectedTickets` now.

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: instructions,
          questId: questId,
          selectedTickets, // Pass selected tickets
        }),
      });

      // We reuse the existing stream reader logic if we just replace the body?
      // No, `startQuest` is inside useEffect. We need to trigger it or duplicate logic.
      // Actually, simpler: just let the current SSE connection close (it sent 'done' for phase 1),
      // and start a NEW connection/request that will handle phase 2.

      // But `startQuest` is controlled by useEffect on [questId].
      // We can manually call a function to stream the response.

      // Let's refactor startQuest to be callable.
      await streamResponse(res);
    } catch (e) {
      console.error(e);
      setError('Failed to start research phase');
    }
  };

  // Refactored stream reader to be reusable
  const streamResponse = async (res: Response) => {
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    if (!res.body) throw new Error('No body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
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

              // Handle events (duplicate of useEffect logic, simplified)
              if (data.type === 'log') {
                setLogs((prev) => [...prev, data.message]);
              } else if (data.type === 'result') {
                setResponse(data.text);
              } else if (data.type === 'done') {
                setLoading(false);
                setStatus('success_ai');
              } else if (data.type === 'ticket_list') {
                setTicketList(data.tickets);
                setLoading(false);
              }
            } catch (e) {
              console.error(e);
            }
          }
        }
      }
    }
  };

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
            userInput: userInput,
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
                  } else if (data.type === 'ticket_list') {
                    setTicketList(data.tickets);
                    // Don't auto-complete, wait for user input
                    setLoading(false); // Stop the spinner/timer essentially, but keep session active
                  } else if (data.type === 'result') {
                    setResponse(data.text);
                  } else if (data.type === 'error') {
                    setError(data.message);
                    currentStatus = 'failed';
                    setStatus('failed');
                  } else if (data.type === 'done') {
                    setLoading(false);
                    // For Jira research, we mark as success only when CLI is done,
                    // which is when the 'done' event is sent AFTER CLI finishes.
                    // The server ensures 'done' is sent at the very end.
                    if (questId === 'jira-ticket-research') {
                      setStatus('success_ai');
                    } else if (currentStatus === 'ai_takeover') {
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
      controller.abort(); // Cancel any pending request
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

  const activeTicket = selectedTickets[0];
  const dynamicQuestName =
    questId === 'jira-ticket-research' && activeTicket
      ? `Jira Ticket Research (${activeTicket})`
      : questName;

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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            flex: 1,
          }}
        >
          {/* Arrow */}
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
                fontSize: '10px', // Slightly smaller arrow
              }}
            >
              ▼
            </span>
          </div>

          {/* Title Group */}
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
              {dynamicQuestName}
            </div>
            <div
              style={{
                fontSize: '12px',
                color: '#57606a',
                lineHeight: '1',
                paddingTop: '2px', // Micro-adjustment for visual alignment
              }}
            >
              ({sessionId})
            </div>
          </div>

          {/* Status Badge */}
          <div
            style={{
              fontSize: '13px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              height: '20px', // Fixed height container
            }}
          >
            {getStatusBadge()}
          </div>

          {/* Timer */}
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
            {/* Ticket Selection UI */}
            {ticketList.length > 0 && !response && (
              <div
                style={{
                  width: '100%',
                  maxWidth: '800px',
                  background: '#f6f8fa',
                  border: '1px solid #d0d7de',
                  borderRadius: '6px',
                  padding: '20px',
                  marginBottom: '20px',
                }}
              >
                <h3 style={{ marginTop: 0 }}>Select Tickets to Research</h3>
                <p style={{ color: '#666', fontSize: '14px' }}>
                  Found {ticketList.length} tickets assigned to you matching
                  your criteria.
                </p>
                <div
                  style={{
                    maxHeight: '300px',
                    overflowY: 'auto',
                    border: '1px solid #eee',
                    background: 'white',
                    borderRadius: '4px',
                    marginBottom: '15px',
                  }}
                >
                  {ticketList.map((ticket) => (
                    <div
                      key={ticket.key}
                      onClick={() => handleTicketToggle(ticket.key)}
                      style={{
                        padding: '10px',
                        borderBottom: '1px solid #eee',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                        background: selectedTickets.includes(ticket.key)
                          ? '#e6f7ff'
                          : 'white',
                      }}
                    >
                      <input
                        type="radio"
                        checked={selectedTickets.includes(ticket.key)}
                        onChange={() => {
                          setSelectedTickets([ticket.key]); // Single select
                        }}
                        style={{ cursor: 'pointer' }}
                        name="ticket-selection"
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 'bold' }}>{ticket.key}</div>
                        <div style={{ fontSize: '14px', color: '#555' }}>
                          {ticket.summary}
                        </div>
                        {ticket.description && (
                          <div
                            style={{
                              fontSize: '12px',
                              color: '#777',
                              marginTop: '4px',
                              fontStyle: 'italic',
                            }}
                          >
                            {ticket.description}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '10px',
                  }}
                >
                  <button
                    disabled={selectedTickets.length === 0}
                    onClick={handleResearchSelected}
                    style={{
                      padding: '8px 16px',
                      backgroundColor:
                        selectedTickets.length === 0 ? '#ccc' : '#1f883d',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor:
                        selectedTickets.length === 0
                          ? 'not-allowed'
                          : 'pointer',
                      fontWeight: 'bold',
                    }}
                  >
                    Research Selected ({selectedTickets.length})
                  </button>
                </div>
              </div>
            )}

            {/* Simulated "Iframe" Browser View */}
            {!hideBrowser && (
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
            )}

            {/* Live Logs */}
            <div
              style={{
                width: '100%',
                maxWidth: hideBrowser ? '800px' : '400px',
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
