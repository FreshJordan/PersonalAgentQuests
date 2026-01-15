import React from 'react';

export type View = 'dashboard' | 'logs' | 'script-creator';

interface SideNavProps {
  currentView: View;
  onChangeView: (view: View) => void;
  activeSessionsCount: number;
}

export const SideNav: React.FC<SideNavProps> = ({
  currentView,
  onChangeView,
  activeSessionsCount,
}) => {
  return (
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
      <h2 style={{ fontSize: '18px', marginBottom: '30px', color: '#24292f' }}>
        Quest Runner
      </h2>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button
          onClick={() => onChangeView('dashboard')}
          style={{
            textAlign: 'left',
            padding: '10px',
            border: 'none',
            background: currentView === 'dashboard' ? '#e6f7ff' : 'transparent',
            color: currentView === 'dashboard' ? '#0969da' : '#24292f',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: currentView === 'dashboard' ? 'bold' : 'normal',
          }}
        >
          Dashboard
        </button>
        <button
          onClick={() => onChangeView('logs')}
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
        <button
          onClick={() => onChangeView('script-creator')}
          style={{
            textAlign: 'left',
            padding: '10px',
            border: 'none',
            background:
              currentView === 'script-creator' ? '#e6f7ff' : 'transparent',
            color: currentView === 'script-creator' ? '#0969da' : '#24292f',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: currentView === 'script-creator' ? 'bold' : 'normal',
          }}
        >
          ✨ Quest Creator
        </button>
      </nav>

      <div style={{ marginTop: 'auto', fontSize: '12px', color: '#666' }}>
        Active Sessions: {activeSessionsCount}
      </div>
    </div>
  );
};
