import React, { useState, useEffect } from 'react';
import { Header } from './Header';
import { TicketSelector } from './TicketSelector';
import { BrowserPreview } from './BrowserPreview';
import { LiveLogs } from './LiveLogs';
import { AgentReport } from './AgentReport';

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
  const [startTime] = useState<number>(Date.now());
  const [elapsedTime, setElapsedTime] = useState<string>('00:00');
  const [autoScroll, setAutoScroll] = useState(true);
  const [inputTokens, setInputTokens] = useState(0);
  const [outputTokens, setOutputTokens] = useState(0);
  const [isFollowUpLoading, setIsFollowUpLoading] = useState(false);

  // Timer effect
  useEffect(() => {
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

  // Auto-expand if script starts
  useEffect(() => {
    if (status === 'in_progress_ai') {
      setIsCollapsed(false);
    }
  }, [status]);

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

              // Handle events
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
              } else if (data.type === 'token_usage') {
                setInputTokens((prev) => prev + (data.input || 0));
                setOutputTokens((prev) => prev + (data.output || 0));
              }
            } catch (e) {
              console.error(e);
            }
          }
        }
      }
    }
  };

  const handleResearchSelected = async () => {
    setTicketList([]);
    setLoading(true);
    setStatus('in_progress_ai');

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: instructions,
          questId: questId,
          selectedTickets,
        }),
      });

      await streamResponse(res);
    } catch (e) {
      console.error(e);
      setError('Failed to start research phase');
    }
  };

  const handleFollowUpSubmit = async (followUpMessage: string) => {
    setIsFollowUpLoading(true);
    setLogs((prev) => [...prev, `[User] ${followUpMessage}`]);

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: instructions,
          questId: questId,
          selectedTickets,
          followUpMessage,
        }),
      });

      await streamResponse(res);
      setIsFollowUpLoading(false);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      setError('Failed to process follow-up message');
      setIsFollowUpLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
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

        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

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
                      const match = data.message.match(
                        /at step (\d+)|index (\d+)/
                      );
                      if (match) {
                        setTakeoverStep(parseInt(match[1] || match[2]) + 1);
                      }
                    } else if (
                      currentStatus !== 'ai_takeover' &&
                      data.message.includes('[Script]:')
                    ) {
                      nextStatus = 'in_progress_script';
                    } else if (
                      currentStatus !== 'ai_takeover' &&
                      data.message.includes('[AI]:')
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
                    setLoading(false);
                  } else if (data.type === 'token_usage') {
                    setInputTokens((prev) => prev + (data.input || 0));
                    setOutputTokens((prev) => prev + (data.output || 0));
                  } else if (data.type === 'result') {
                    setResponse(data.text);
                  } else if (data.type === 'error') {
                    setError(data.message);
                    currentStatus = 'failed';
                    setStatus('failed');
                  } else if (data.type === 'done') {
                    setLoading(false);
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
      controller.abort();
    };
  }, [questId, instructions]);

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
      <Header
        questName={dynamicQuestName}
        sessionId={sessionId}
        status={status}
        elapsedTime={elapsedTime}
        inputTokens={inputTokens}
        outputTokens={outputTokens}
        isCollapsed={isCollapsed}
        takeoverStep={takeoverStep}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        onClose={onClose}
      />

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
            {ticketList.length > 0 && !response && (
              <TicketSelector
                ticketList={ticketList}
                selectedTickets={selectedTickets}
                onSelectTicket={(key) => setSelectedTickets([key])}
                onResearch={handleResearchSelected}
              />
            )}

            {!hideBrowser && (
              <BrowserPreview
                browserUrl={browserUrl}
                screenshot={screenshot}
                loading={loading}
              />
            )}

            <LiveLogs
              logs={logs}
              loading={loading}
              autoScroll={autoScroll}
              onToggleAutoScroll={() => setAutoScroll(!autoScroll)}
              maxWidth={hideBrowser ? '800px' : '400px'}
            />
          </div>

          <AgentReport
            response={response}
            error={error}
            showFollowUp={questId === 'jira-ticket-research' && !loading}
            isFollowUpLoading={isFollowUpLoading}
            onFollowUpSubmit={handleFollowUpSubmit}
          />
        </div>
      )}
    </div>
  );
};
