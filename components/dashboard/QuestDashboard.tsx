import React from 'react';
import { QuestDefinition } from '../../lib/quests/types';
import { ActiveQuest } from '../active-quest';

export interface QuestSession {
  sessionId: string;
  questId: string;
  questName: string;
  instructions: string;
  startedAt: number;
  hideBrowser?: boolean;
  userInput?: string;
}

interface QuestDashboardProps {
  quests: QuestDefinition[];
  selectedQuestId: string;
  setSelectedQuestId: (id: string) => void;
  userInput: string;
  setUserInput: (input: string) => void;
  onStartQuest: () => void;
  sessions: QuestSession[];
  onCloseSession: (sessionId: string) => void;
}

export const QuestDashboard: React.FC<QuestDashboardProps> = ({
  quests,
  selectedQuestId,
  setSelectedQuestId,
  userInput,
  setUserInput,
  onStartQuest,
  sessions,
  onCloseSession,
}) => {
  const selectedQuest =
    quests.find((q) => q.id === selectedQuestId) || quests[0];

  // Show loading state while quests are being fetched
  if (!selectedQuest) {
    return (
      <div
        style={{
          padding: '40px',
          maxWidth: '1200px',
          margin: '0 auto',
          textAlign: 'center',
        }}
      >
        <h1>Loading Quests...</h1>
        <p style={{ color: '#666' }}>
          Please wait while quests are being loaded.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '40px',
        margin: '0 auto',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          marginBottom: '40px',
        }}
      >
        <h1>Start a New Quest</h1>

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
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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
              {quests.map((quest) => (
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
            onClick={onStartQuest}
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
          Active Quests ({sessions.length})
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
            No active quests. Start one above!
          </div>
        )}
        {sessions.map((session) => (
          <ActiveQuest
            key={session.sessionId}
            sessionId={session.sessionId}
            questId={session.questId}
            questName={session.questName}
            instructions={session.instructions}
            onClose={onCloseSession}
            hideBrowser={session.hideBrowser}
            userInput={session.userInput}
          />
        ))}
      </div>
    </div>
  );
};
