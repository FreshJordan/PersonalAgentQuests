import React, { useState, useEffect, useCallback } from 'react';
import { QuestDefinition } from '../lib/quests/types';
import LogViewer from '../components/LogViewer';
import QuestCreator from '../components/QuestCreator';
import { fetchQuestLogs } from '../lib/questApi';
import { QuestLog, QuestScript } from '../lib/quests/types';
import { SideNav, View } from '../components/dashboard/SideNav';
import {
  QuestDashboard,
  QuestSession,
} from '../components/dashboard/QuestDashboard';

export default function Home() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [quests, setQuests] = useState<QuestDefinition[]>([]);
  const [selectedQuestId, setSelectedQuestId] = useState<string>('');
  const [userInput, setUserInput] = useState<string>('');
  const [sessions, setSessions] = useState<QuestSession[]>([]);
  const [questLogs, setQuestLogs] = useState<QuestLog[]>([]);

  const selectedQuest =
    quests.find((q) => q.id === selectedQuestId) || quests[0];

  const refreshLogs = async () => {
    const logs = await fetchQuestLogs();
    setQuestLogs(logs);
  };

  const refreshQuests = useCallback(async () => {
    try {
      const response = await fetch('/api/quests');
      const data = await response.json();
      if (data.quests && data.quests.length > 0) {
        setQuests(data.quests);
        // Select first quest if none selected, or update if current selection no longer exists
        setSelectedQuestId((currentId) => {
          if (
            !currentId ||
            !data.quests.find((q: QuestDefinition) => q.id === currentId)
          ) {
            return data.quests[0].id;
          }
          return currentId;
        });
      }
    } catch (error) {
      console.error('Failed to fetch quests:', error);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    refreshLogs();
    refreshQuests();
  }, [refreshQuests]);

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

  const handleSaveQuest = async (
    definition: QuestDefinition,
    script?: QuestScript
  ) => {
    const response = await fetch('/api/script-creator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', definition, script }),
    });

    if (!response.ok) {
      throw new Error('Failed to save quest');
    }

    // Refresh the quests list so the new quest appears in the dropdown
    await refreshQuests();
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
            quests={quests}
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

        <div
          style={{
            display: currentView === 'script-creator' ? 'block' : 'none',
            height: '100%',
          }}
        >
          <QuestCreator onSaveQuest={handleSaveQuest} />
        </div>
      </div>
    </div>
  );
}
