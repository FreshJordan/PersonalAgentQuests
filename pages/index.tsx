import React, { useState } from 'react';
import { QUESTS } from '../lib/quests/definitions';
import { ActiveQuest } from '../components/ActiveQuest';
import LogViewer from '../components/LogViewer';

interface QuestSession {
  sessionId: string;
  questId: string;
  questName: string;
  instructions: string;
  startedAt: number;
  hideBrowser?: boolean;
  userInput?: string;
}

type View = 'dashboard' | 'logs';

export default function Home() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedQuestId, setSelectedQuestId] = useState<string>(QUESTS[0].id);
  const [userInput, setUserInput] = useState<string>('');
  const [sessions, setSessions] = useState<QuestSession[]>([]);

  const selectedQuest =
    QUESTS.find((q) => q.id === selectedQuestId) || QUESTS[0];

  // Reset user input when quest selection changes
  React.useEffect(() => {
    setUserInput('');
  }, [selectedQuestId]);

  const handleStartQuest = () => {
    const newSession: QuestSession = {
      sessionId: `session-${Date.now()}`,
      questId: selectedQuest.id,
      questName: selectedQuest.name,
      instructions: selectedQuest.instructions,
      startedAt: Date.now(),
      hideBrowser: selectedQuest.hideBrowser,
      userInput: userInput || undefined,
    };

    setSessions((prev) => [newSession, ...prev]);
  };

  const handleCloseSession = (sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
  };

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif' }}>
      {/* Side Navigation */}
      <div
        style={{
          width: '250px',
          background: '#f6f8fa',
          borderRight: '1px solid #d0d7de',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px',
        }}
      >
        <h2
          style={{ fontSize: '18px', marginBottom: '30px', color: '#24292f' }}
        >
          Quest Runner
        </h2>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            onClick={() => setCurrentView('dashboard')}
            style={{
              textAlign: 'left',
              padding: '10px',
              border: 'none',
              background:
                currentView === 'dashboard' ? '#e6f7ff' : 'transparent',
              color: currentView === 'dashboard' ? '#0969da' : '#24292f',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: currentView === 'dashboard' ? 'bold' : 'normal',
            }}
          >
            Dashboard
          </button>
          <button
            onClick={() => setCurrentView('logs')}
            style={{
              textAlign: 'left',
              padding: '10px',
              border: 'none',
              background: currentView === 'logs' ? '#e6f7ff' : 'transparent',
              color: currentView === 'logs' ? '#0969da' : '#24292f',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: currentView === 'logs' ? 'bold' : 'normal',
            }}
          >
            Log Viewer
          </button>
        </nav>

        <div style={{ marginTop: 'auto', fontSize: '12px', color: '#666' }}>
          Active Sessions: {sessions.length}
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {/* Dashboard View */}
        <div
          style={{
            display: currentView === 'dashboard' ? 'block' : 'none',
            padding: '40px',
            maxWidth: '1200px',
            margin: '0 auto',
          }}
        >
          <div
            style={{
              textAlign: 'center',
              marginBottom: '40px',
            }}
          >
            <h1>Start a New Mission</h1>
            <p style={{ color: '#666' }}>
              Self-Healing Automation: Script Execution with AI Fallback
            </p>

            <div
              style={{
                marginTop: '30px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '20px',
                borderBottom: '2px solid #eee',
                paddingBottom: '40px',
              }}
            >
              <div
                style={{ display: 'flex', gap: '10px', alignItems: 'center' }}
              >
                <label style={{ fontWeight: 'bold' }}>Select Quest:</label>
                <select
                  value={selectedQuestId}
                  onChange={(e) => setSelectedQuestId(e.target.value)}
                  style={{
                    padding: '8px',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                    fontSize: '16px',
                  }}
                >
                  {QUESTS.map((quest) => (
                    <option key={quest.id} value={quest.id}>
                      {quest.name}
                    </option>
                  ))}
                </select>
              </div>

              <div
                style={{
                  textAlign: 'left',
                  width: '100%',
                  maxWidth: '800px',
                  background: '#f4f4f4',
                  padding: '15px',
                  borderRadius: '8px',
                  border: '1px solid #ddd',
                }}
              >
                {selectedQuest.inputConfig && (
                  <div style={{ marginBottom: '15px' }}>
                    <div
                      style={{
                        fontSize: '14px',
                        fontWeight: 'bold',
                        color: '#333',
                        marginBottom: '5px',
                      }}
                    >
                      {selectedQuest.inputConfig.label}
                    </div>
                    {selectedQuest.inputConfig.description && (
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#666',
                          marginBottom: '5px',
                        }}
                      >
                        {selectedQuest.inputConfig.description}
                      </div>
                    )}
                    <input
                      type="text"
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      placeholder={selectedQuest.inputConfig.placeholder}
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: '4px',
                        border: '1px solid #ccc',
                        fontSize: '14px',
                      }}
                    />
                  </div>
                )}

                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 'bold',
                    color: '#555',
                    marginBottom: '5px',
                  }}
                >
                  QUEST INSTRUCTIONS:
                </div>
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    margin: 0,
                    color: '#333',
                  }}
                >
                  {selectedQuest.instructions}
                </pre>
              </div>

              <button
                onClick={handleStartQuest}
                style={{
                  padding: '12px 24px',
                  fontSize: '16px',
                  cursor: 'pointer',
                  backgroundColor: '#0070f3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  fontWeight: 'bold',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  minWidth: '200px',
                }}
              >
                Start New Mission
              </button>
            </div>
          </div>

          <div id="active-missions">
            <h2 style={{ fontSize: '20px', marginBottom: '20px' }}>
              Active Missions ({sessions.length})
            </h2>
            {sessions.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '40px',
                  background: '#f9f9f9',
                  borderRadius: '8px',
                  color: '#666',
                }}
              >
                No active missions. Start one above!
              </div>
            )}
            {sessions.map((session) => (
              <ActiveQuest
                key={session.sessionId}
                sessionId={session.sessionId}
                questId={session.questId}
                questName={session.questName}
                instructions={session.instructions}
                onClose={handleCloseSession}
                hideBrowser={session.hideBrowser}
                userInput={session.userInput}
              />
            ))}
          </div>
        </div>

        {/* Log Viewer View */}
        <div
          style={{
            display: currentView === 'logs' ? 'block' : 'none',
            height: '100%',
          }}
        >
          <LogViewer />
        </div>
      </div>
    </div>
  );
}
