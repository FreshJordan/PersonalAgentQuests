import React from 'react';
import { BROWSER_CONFIG } from '../../lib/constants';

// Use shared browser config for consistency with Script Creator
const BROWSER_WIDTH = BROWSER_CONFIG.viewportWidth;
const BROWSER_HEIGHT = BROWSER_CONFIG.viewportHeight;

interface BrowserPreviewProps {
  browserUrl: string;
  screenshot: string | null;
  loading: boolean;
}

export const BrowserPreview: React.FC<BrowserPreviewProps> = ({
  browserUrl,
  screenshot,
  loading,
}) => {
  return (
    <div
      style={{
        width: `${BROWSER_WIDTH}px`,
        height: `${BROWSER_HEIGHT + 40}px`, // +40 for URL bar
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
        <div style={{ display: 'flex', gap: '6px', marginRight: '12px' }}>
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
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>🤖</div>
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
  );
};
