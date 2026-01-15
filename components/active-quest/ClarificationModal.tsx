import React, { useState, useEffect } from 'react';

interface ClarificationQuestion {
  id: string;
  question: string;
  options?: string[];
  context?: string;
  timestamp: number;
}

interface ClarificationModalProps {
  question: ClarificationQuestion;
  onSubmit: (answer: string) => void;
  onClose?: () => void;
}

const TIMEOUT_SECONDS = 25;

export const ClarificationModal: React.FC<ClarificationModalProps> = ({
  question,
  onSubmit,
  onClose,
}) => {
  const [answer, setAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(TIMEOUT_SECONDS);
  const [hasAutoSubmitted, setHasAutoSubmitted] = useState(false);

  // Auto-select first option after timeout
  useEffect(() => {
    if (timeRemaining === 0 && !hasAutoSubmitted) {
      setHasAutoSubmitted(true);
      if (question.options && question.options.length > 0) {
        // Auto-submit with the first option
        onSubmit(question.options[0]);
      } else if (onClose) {
        // No options available, just close
        onClose();
      }
    }
  }, [timeRemaining, hasAutoSubmitted, question.options, onSubmit, onClose]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 0) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Alert the user when modal appears
  useEffect(() => {
    // Request notification permission if not already granted
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Try to show a browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification('Agent Needs Clarification', {
        body:
          question.question.substring(0, 100) +
          (question.question.length > 100 ? '...' : ''),
        icon: '/favicon.ico',
        tag: 'clarification-request',
        requireInteraction: true,
      });

      // Focus window when notification is clicked
      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // Clean up notification after 10 seconds
      setTimeout(() => notification.close(), 10000);
    }

    // Also use the browser's built-in alert mechanism
    // Focus the window
    if (document.hidden) {
      window.focus();
    }

    // Flash the title to get attention
    const originalTitle = document.title;
    let flashCount = 0;
    const flashInterval = setInterval(() => {
      document.title =
        flashCount % 2 === 0 ? '🔔 CLARIFICATION NEEDED' : originalTitle;
      flashCount++;

      if (flashCount >= 10) {
        document.title = originalTitle;
        clearInterval(flashInterval);
      }
    }, 500);

    return () => {
      document.title = originalTitle;
      clearInterval(flashInterval);
    };
  }, [question]);

  const handleSubmit = () => {
    const finalAnswer = question.options ? selectedOption : answer;
    if (finalAnswer.trim()) {
      onSubmit(finalAnswer);
      setAnswer('');
      setSelectedOption('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !question.options) {
      handleSubmit();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '30px',
          maxWidth: '600px',
          width: '90%',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '20px',
          }}
        >
          <span style={{ fontSize: '32px' }}>🤔</span>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '600' }}>
            Agent Needs Clarification
          </h2>
        </div>

        {question.context && (
          <div
            style={{
              backgroundColor: '#fff8e1',
              border: '1px solid #ffe082',
              borderRadius: '6px',
              padding: '12px',
              marginBottom: '16px',
              fontSize: '14px',
              color: '#333',
            }}
          >
            <strong>Context:</strong> {question.context}
          </div>
        )}

        <div
          style={{
            marginBottom: '20px',
            fontSize: '16px',
            lineHeight: '1.6',
            color: '#333',
          }}
        >
          <strong>Question:</strong>
          <p style={{ marginTop: '8px', marginBottom: '16px' }}>
            {question.question}
          </p>
        </div>

        {question.options ? (
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '600',
                fontSize: '14px',
              }}
            >
              Select an option:
            </label>
            <select
              value={selectedOption}
              onChange={(e) => setSelectedOption(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '14px',
                border: '1px solid #d0d7de',
                borderRadius: '6px',
              }}
            >
              <option value="">-- Choose --</option>
              {question.options.map((opt, idx) => (
                <option key={idx} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '600',
                fontSize: '14px',
              }}
            >
              Your answer:
            </label>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your answer here..."
              style={{
                width: '100%',
                minHeight: '100px',
                padding: '10px',
                fontSize: '14px',
                border: '1px solid #d0d7de',
                borderRadius: '6px',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
              autoFocus
            />
            <div
              style={{ marginTop: '6px', fontSize: '12px', color: '#656d76' }}
            >
              Tip: Press ⌘+Enter (Ctrl+Enter on Windows) to submit
            </div>
          </div>
        )}

        <div
          style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}
        >
          <button
            onClick={handleSubmit}
            disabled={question.options ? !selectedOption : !answer.trim()}
            style={{
              padding: '10px 20px',
              backgroundColor: (
                question.options ? selectedOption : answer.trim()
              )
                ? '#2da44e'
                : '#94d3a2',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: (question.options ? selectedOption : answer.trim())
                ? 'pointer'
                : 'not-allowed',
              fontWeight: '600',
              fontSize: '14px',
            }}
          >
            Submit Answer
          </button>
        </div>

        <div
          style={{
            marginTop: '16px',
            padding: '12px',
            backgroundColor: timeRemaining <= 5 ? '#fff8e1' : '#f6f8fa',
            border:
              timeRemaining <= 5 ? '1px solid #ffe082' : '1px solid #d0d7de',
            borderRadius: '6px',
            fontSize: '12px',
            color: timeRemaining <= 5 ? '#d97706' : '#656d76',
            fontWeight: timeRemaining <= 5 ? '600' : 'normal',
          }}
        >
          ⏱️ Time remaining: {timeRemaining}s{' '}
          {timeRemaining === 0 && '(auto-selecting...)'}
          {timeRemaining > 0 &&
            question.options &&
            question.options.length > 0 && (
              <span style={{ display: 'block', marginTop: '4px' }}>
                First option &quot;{question.options[0]}&quot; will be
                automatically selected if no answer is provided.
              </span>
            )}
          {timeRemaining > 0 &&
            (!question.options || question.options.length === 0) && (
              <span style={{ display: 'block', marginTop: '4px' }}>
                If no answer is provided, the agent will use its discretion.
              </span>
            )}
        </div>
      </div>
    </div>
  );
};
