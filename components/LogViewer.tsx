import React, { useState } from 'react';
import { QuestLog } from '../lib/quests/types';

interface LogViewerProps {
  logs: QuestLog[];
  onRefresh: () => void;
}

export default function LogViewer({ logs, onRefresh }: LogViewerProps) {
  const [selectedLog, setSelectedLog] = useState<QuestLog | null>(null);

  return (
    <div
      style={{
        padding: '40px',
        maxWidth: '1200px',
        margin: '0 auto',
        fontFamily: 'sans-serif',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
        }}
      >
        <h1 style={{ margin: 0 }}>Quest Log Viewer</h1>
        <button
          onClick={onRefresh}
          style={{
            padding: '8px 16px',
            backgroundColor: '#0969da',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
          }}
        >
          Refresh Logs
        </button>
      </div>

      <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: 0 }}>
        {/* Sidebar List */}
        <div
          style={{
            width: '300px',
            borderRight: '1px solid #ccc',
            overflowY: 'auto',
            background: 'white',
            borderRadius: '8px',
            border: '1px solid #e1e4e8',
          }}
        >
          {logs.map((log) => (
            <div
              key={log.id}
              onClick={() => setSelectedLog(log)}
              style={{
                padding: '15px',
                borderBottom: '1px solid #eee',
                cursor: 'pointer',
                background: selectedLog?.id === log.id ? '#f0f8ff' : 'white',
                borderLeft:
                  selectedLog?.id === log.id
                    ? '4px solid #0969da'
                    : '4px solid transparent',
              }}
            >
              <div
                style={{
                  fontWeight: 'bold',
                  fontSize: '14px',
                  marginBottom: '4px',
                }}
              >
                {log.questId}
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '4px',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 'bold',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background:
                      log.status === 'success' ? '#dafbe1' : '#ffebe9',
                    color: log.status === 'success' ? '#1a7f37' : '#cf222e',
                  }}
                >
                  {log.status.toUpperCase()}
                </span>
                <span style={{ fontSize: '11px', color: '#666' }}>
                  {log.durationSeconds}s
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#666' }}>
                {new Date(log.timestamp).toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        {/* Detail View */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            background: 'white',
            borderRadius: '8px',
            border: '1px solid #e1e4e8',
            padding: '20px',
          }}
        >
          {selectedLog ? (
            <div>
              <div
                style={{
                  padding: '20px',
                  background: '#f6f8fa',
                  borderRadius: '6px',
                  marginBottom: '20px',
                  border: '1px solid #d0d7de',
                }}
              >
                <h2
                  style={{
                    margin: '0 0 15px 0',
                    borderBottom: '1px solid #d0d7de',
                    paddingBottom: '10px',
                  }}
                >
                  Run Details: {selectedLog.questId}
                </h2>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '15px',
                  }}
                >
                  <div>
                    <strong>Status:</strong>{' '}
                    <span
                      style={{
                        color:
                          selectedLog.status === 'success'
                            ? '#1a7f37'
                            : '#cf222e',
                        fontWeight: 'bold',
                      }}
                    >
                      {selectedLog.status.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <strong>Duration:</strong> {selectedLog.durationSeconds}s
                  </div>
                  <div>
                    <strong>Total Steps:</strong> {selectedLog.stepCount}
                  </div>
                  <div>
                    <strong>AI / Script Steps:</strong>{' '}
                    {selectedLog.aiStepCount} / {selectedLog.scriptStepCount}
                  </div>
                  <div>
                    <strong>Date:</strong>{' '}
                    {new Date(selectedLog.timestamp).toLocaleString()}
                  </div>
                </div>

                {/* Summary Section */}
                {(selectedLog as any).summary && (
                  <div
                    style={{
                      marginTop: '15px',
                      padding: '15px',
                      background: 'white',
                      border: '1px solid #d0d7de',
                      borderRadius: '6px',
                    }}
                  >
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>
                      Run Summary
                    </h3>
                    <div style={{ fontSize: '13px' }}>
                      {/* Check if it's our new structured extraction (from AI) */}
                      {(selectedLog as any).summary.email &&
                      !(selectedLog as any).summary.extractedData ? (
                        /* Old Heuristic Summary */
                        <>
                          <div style={{ marginBottom: '5px' }}>
                            <strong>Email Used:</strong>{' '}
                            <span style={{ fontFamily: 'monospace' }}>
                              {(selectedLog as any).summary.email}
                            </span>
                          </div>
                          {(selectedLog as any).summary.selections &&
                            (selectedLog as any).summary.selections.length >
                              0 && (
                              <div>
                                <strong>Selections:</strong>
                                <ul
                                  style={{ margin: '5px 0 0 20px', padding: 0 }}
                                >
                                  {(selectedLog as any).summary.selections.map(
                                    (sel: string, i: number) => (
                                      <li key={i}>{sel}</li>
                                    )
                                  )}
                                </ul>
                              </div>
                            )}
                        </>
                      ) : (
                        /* New Structured AI Extraction */
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'auto 1fr',
                            gap: '8px 15px',
                            alignItems: 'baseline',
                          }}
                        >
                          {Object.entries((selectedLog as any).summary).map(
                            ([key, value]) => {
                              // Skip internal fields if any (selections is from old schema)
                              if (
                                key === 'selections' &&
                                (selectedLog as any).summary.email
                              )
                                return null;

                              return (
                                <React.Fragment key={key}>
                                  <strong
                                    style={{
                                      textTransform: 'capitalize',
                                      color: '#444',
                                    }}
                                  >
                                    {key.replace(/_/g, ' ')}:
                                  </strong>
                                  <span
                                    style={{
                                      fontFamily:
                                        key.includes('email') ||
                                        key.includes('password')
                                          ? 'monospace'
                                          : 'inherit',
                                    }}
                                  >
                                    {typeof value === 'object'
                                      ? JSON.stringify(value)
                                      : String(value)}
                                  </span>
                                </React.Fragment>
                              );
                            }
                          )}
                        </div>
                      )}

                      {/* Session Data Block */}
                      {(selectedLog as any).context && (
                        <div
                          style={{
                            marginTop: '15px',
                            paddingTop: '15px',
                            borderTop: '1px solid #eee',
                          }}
                        >
                          <h4
                            style={{
                              margin: '0 0 10px 0',
                              fontSize: '13px',
                              color: '#666',
                            }}
                          >
                            Session Data
                          </h4>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'auto 1fr',
                              gap: '5px 15px',
                              fontSize: '12px',
                            }}
                          >
                            {Object.entries((selectedLog as any).context).map(
                              ([key, value]) => (
                                <React.Fragment key={key}>
                                  <span style={{ color: '#666' }}>{key}:</span>
                                  <span style={{ fontFamily: 'monospace' }}>
                                    {String(value)}
                                  </span>
                                </React.Fragment>
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <h3>Execution Timeline</h3>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '14px',
                }}
              >
                <thead>
                  <tr style={{ background: '#f6f8fa', textAlign: 'left' }}>
                    <th
                      style={{ padding: '10px', border: '1px solid #d0d7de' }}
                    >
                      #
                    </th>
                    <th
                      style={{ padding: '10px', border: '1px solid #d0d7de' }}
                    >
                      Type
                    </th>
                    <th
                      style={{ padding: '10px', border: '1px solid #d0d7de' }}
                    >
                      Parameters & Validation
                    </th>
                    <th
                      style={{ padding: '10px', border: '1px solid #d0d7de' }}
                    >
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectedLog.steps.map((step, idx) => (
                    <tr
                      key={idx}
                      style={{
                        background: step.description?.startsWith('AI Action')
                          ? '#fffbe6'
                          : 'white',
                      }}
                    >
                      <td
                        style={{ padding: '10px', border: '1px solid #d0d7de' }}
                      >
                        {idx + 1}
                      </td>
                      <td
                        style={{ padding: '10px', border: '1px solid #d0d7de' }}
                      >
                        <span
                          style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background:
                              step.type === 'navigate'
                                ? '#ddf4ff'
                                : step.type === 'click'
                                ? '#dafbe1'
                                : step.type === 'type_text'
                                ? '#fff8c5'
                                : '#eee',
                            fontSize: '12px',
                            fontWeight: 'bold',
                          }}
                        >
                          {step.type}
                        </span>
                        {step.description?.startsWith('AI Action') && (
                          <div
                            style={{
                              fontSize: '10px',
                              color: '#9a6700',
                              marginTop: '4px',
                              fontWeight: 'bold',
                            }}
                          >
                            AI GENERATED
                          </div>
                        )}
                      </td>
                      <td
                        style={{ padding: '10px', border: '1px solid #d0d7de' }}
                      >
                        <pre
                          style={{
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            fontSize: '12px',
                            fontFamily: 'monospace',
                            background: '#f6f8fa',
                            padding: '5px',
                            borderRadius: '4px',
                          }}
                        >
                          {JSON.stringify(step.params, null, 2)}
                        </pre>
                        {step.validation && (
                          <div
                            style={{
                              marginTop: '8px',
                              padding: '6px',
                              background: '#f0fdf4',
                              border: '1px solid #bef5cb',
                              borderRadius: '4px',
                              fontSize: '12px',
                              color: '#1a7f37',
                            }}
                          >
                            <strong>Verified:</strong> {step.validation.type} "
                            {step.validation.value}"
                          </div>
                        )}
                      </td>
                      <td
                        style={{ padding: '10px', border: '1px solid #d0d7de' }}
                      >
                        {step.status === 'success' ? (
                          <span title="Success">✅</span>
                        ) : (
                          <span title="Failed">❌</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              style={{
                color: '#666',
                fontStyle: 'italic',
                marginTop: '100px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <div style={{ fontSize: '40px' }}>📋</div>
              <div>Select a log entry from the sidebar to view details</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
