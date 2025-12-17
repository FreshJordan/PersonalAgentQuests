import React from 'react';

interface AgentReportProps {
  response: string | null;
  error: string | null;
}

export const AgentReport: React.FC<AgentReportProps> = ({
  response,
  error,
}) => {
  return (
    <>
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
    </>
  );
};
