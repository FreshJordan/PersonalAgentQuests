import React from 'react';

interface ClarificationCheckboxProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export const ClarificationCheckbox: React.FC<ClarificationCheckboxProps> = ({
  enabled,
  onChange,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px',
        backgroundColor: '#f6f8fa',
        border: '1px solid #d0d7de',
        borderRadius: '6px',
        marginTop: '10px',
      }}
    >
      <input
        type="checkbox"
        id="enable-clarifications"
        checked={enabled}
        onChange={(e) => onChange(e.target.checked)}
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
        }}
      >
        💬 Ask for Clarification
      </label>
      <span
        style={{
          fontSize: '12px',
          color: '#656d76',
          marginLeft: '8px',
        }}
      >
        (Agent can pause and ask questions during execution)
      </span>
    </div>
  );
};
