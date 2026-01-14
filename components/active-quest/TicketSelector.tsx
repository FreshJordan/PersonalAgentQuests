import React from 'react';

interface TicketSelectorProps {
  ticketList: { key: string; summary: string; description?: string | null }[];
  selectedTickets: string[];
  onSelectTicket: (key: string) => void;
  onResearch: () => void;
  supportsClarifications?: boolean;
  clarificationsEnabled: boolean;
  onClarificationsChange: (enabled: boolean) => void;
}

export const TicketSelector: React.FC<TicketSelectorProps> = ({
  ticketList,
  selectedTickets,
  onSelectTicket,
  onResearch,
  supportsClarifications = false,
  clarificationsEnabled,
  onClarificationsChange,
}) => {
  return (
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
        Found {ticketList.length} tickets assigned to you matching your
        criteria.
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
            onClick={() => onSelectTicket(ticket.key)}
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
              onChange={() => onSelectTicket(ticket.key)}
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

      {supportsClarifications && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px',
            backgroundColor: '#fff8e1',
            border: '1px solid #ffe082',
            borderRadius: '6px',
            marginBottom: '15px',
          }}
        >
          <input
            type="checkbox"
            id="enable-clarifications"
            checked={clarificationsEnabled}
            onChange={(e) => onClarificationsChange(e.target.checked)}
            style={{
              width: '18px',
              height: '18px',
              cursor: 'pointer',
            }}
          />
          <label
            htmlFor="enable-clarifications"
            style={{
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              flex: 1,
            }}
          >
            💬 Ask for Clarification
          </label>
          <span
            style={{
              fontSize: '12px',
              color: '#656d76',
            }}
          >
            (Agent can pause and ask questions during execution)
          </span>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '10px',
        }}
      >
        <button
          disabled={selectedTickets.length === 0}
          onClick={onResearch}
          style={{
            padding: '8px 16px',
            backgroundColor: selectedTickets.length === 0 ? '#ccc' : '#1f883d',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: selectedTickets.length === 0 ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
          }}
        >
          Research Selected ({selectedTickets.length})
        </button>
      </div>
    </div>
  );
};
