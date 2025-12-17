import React, { useState, useEffect } from 'react';
import { QUESTS } from '../lib/quests/definitions';
import LogViewer from '../components/LogViewer';
import { fetchQuestLogs } from '../lib/questApi';
import { QuestLog } from '../lib/quests/types';
import { SideNav } from '../components/dashboard/SideNav';
import {
  QuestDashboard,
  QuestSession,
} from '../components/dashboard/QuestDashboard';

type View = 'dashboard' | 'logs';

export default function Home() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedQuestId, setSelectedQuestId] = useState<string>(QUESTS[0].id);
  const [userInput, setUserInput] = useState<string>('');
  const [sessions, setSessions] = useState<QuestSession[]>([]);
  const [questLogs, setQuestLogs] = useState<QuestLog[]>([]);

  const selectedQuest =
    QUESTS.find((q) => q.id === selectedQuestId) || QUESTS[0];

  const refreshLogs = async () => {
    const logs = await fetchQuestLogs();
    setQuestLogs(logs);
  };

  useEffect(() => {
    // Initial fetch
    refreshLogs();
  }, []);

  // Reset user input when quest selection changes
  useEffect(() => {
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

  const handleChangeView = (view: View) => {
    setCurrentView(view);
    if (view === 'logs') {
      refreshLogs();
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif' }}>
      <SideNav
        currentView={currentView}
        onChangeView={handleChangeView}
        activeSessionsCount={sessions.length}
      />

      {/* Main Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        <div
          style={{ display: currentView === 'dashboard' ? 'block' : 'none' }}
        >
          <QuestDashboard
            selectedQuestId={selectedQuestId}
            setSelectedQuestId={setSelectedQuestId}
            userInput={userInput}
            setUserInput={setUserInput}
            onStartQuest={handleStartQuest}
            sessions={sessions}
            onCloseSession={handleCloseSession}
          />
        </div>

        <div
          style={{
            display: currentView === 'logs' ? 'block' : 'none',
            height: '100%',
          }}
        >
          <LogViewer logs={questLogs} onRefresh={refreshLogs} />
        </div>
      </div>
    </div>
  );
}
