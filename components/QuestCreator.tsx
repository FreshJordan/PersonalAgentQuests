/* eslint-disable no-console */
import React, { useState, useRef } from 'react';
import { QuestStep, QuestScript } from '../lib/quests/types';
import { QuestDefinition } from '../lib/quests/types';
import { BROWSER_CONFIG } from '../lib/constants';

interface QuestCreatorProps {
  onSaveQuest: (
    definition: QuestDefinition,
    script?: QuestScript
  ) => Promise<void>;
}

type RecordingMode = 'idle' | 'recording';

interface ActionModalState {
  type: 'type_text' | 'press_key' | 'scroll' | 'wait' | 'navigate' | null;
}

// Browser dimensions from shared config to ensure consistency
const BROWSER_WIDTH = BROWSER_CONFIG.viewportWidth;
const BROWSER_HEIGHT = BROWSER_CONFIG.viewportHeight;

// Dynamic context variables available for substitution during script execution
// These match the variables generated in ContextService.generateDefaults()
const DYNAMIC_CONTEXT_VARIABLES = [
  {
    key: 'dynamicEmail',
    label: 'Dynamic Email',
    description: 'Auto-generated unique email address',
    example: 'jordan.mcinnis+jan15123456@hellofresh.ca',
  },
];

/**
 * Generates a sample value for a dynamic variable.
 * Used during recording to type real values into pages while saving placeholders.
 */
function generateSampleValue(key: string): string {
  const date = new Date();
  const shortMonth = date
    .toLocaleString('default', { month: 'short' })
    .toLowerCase();
  const day = date.getDate();
  const shortDate = `${shortMonth}${day}`;
  const randomNum = Math.floor(Math.random() * 900000) + 100000;

  switch (key) {
    case 'dynamicEmail':
      return `jordan.mcinnis+${shortDate}${randomNum}@hellofresh.ca`;
    default:
      return `sample_${key}_${randomNum}`;
  }
}

/**
 * Extracts placeholder keys from a string (e.g., "{{dynamicEmail}}" -> ["dynamicEmail"])
 */
function extractPlaceholders(text: string): string[] {
  const matches = text.match(/\{\{(\w+)\}\}/g) || [];
  return matches.map((m) => m.slice(2, -2)); // Remove {{ and }}
}

/**
 * Replaces placeholders with their generated sample values.
 * Returns both the resolved text (for the browser) and a map of what was replaced.
 */
function resolvePlaceholders(text: string): {
  resolved: string;
  replacements: Record<string, string>;
} {
  const keys = extractPlaceholders(text);
  const replacements: Record<string, string> = {};
  let resolved = text;

  for (const key of keys) {
    const sampleValue = generateSampleValue(key);
    replacements[key] = sampleValue;
    resolved = resolved.replace(
      new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
      sampleValue
    );
  }

  return { resolved, replacements };
}

export default function QuestCreator({ onSaveQuest }: QuestCreatorProps) {
  // Form state
  const [questName, setQuestName] = useState('');
  const [questId, setQuestId] = useState('');
  const [instructions, setInstructions] = useState('');
  const [initialUrl, setInitialUrl] = useState('');

  // Recording state
  const [mode, setMode] = useState<RecordingMode>('idle');
  const [steps, setSteps] = useState<QuestStep[]>([]);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionModal, setActionModal] = useState<ActionModalState>({
    type: null,
  });
  const [actionInput, setActionInput] = useState('');
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down'>('down');
  const [waitDuration, setWaitDuration] = useState('2000');

  const previewRef = useRef<HTMLDivElement>(null);

  // Generate quest ID from name
  const handleNameChange = (name: string) => {
    setQuestName(name);
    const id = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    setQuestId(id);
  };

  // Start recording session
  const handleStartRecording = async () => {
    if (!initialUrl) {
      alert('Please enter an initial URL');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/script-creator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', url: initialUrl }),
      });

      const data = await response.json();
      if (data.success) {
        setMode('recording');
        setCurrentUrl(data.url || initialUrl);
        setScreenshot(data.screenshot);

        // Add the initial navigate step
        setSteps([
          {
            type: 'navigate',
            params: { url: initialUrl },
            description: `Navigate to ${initialUrl}`,
            timestamp: new Date().toISOString(),
            status: 'success',
          },
        ]);
      } else {
        alert('Failed to start recording: ' + data.error);
      }
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Failed to start recording session');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle click on preview
  const handlePreviewClick = async (
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    if (mode !== 'recording' || !previewRef.current) {
      return;
    }

    // Get the preview container's position
    const containerRect = previewRef.current.getBoundingClientRect();

    // Calculate click coordinates relative to the container
    // Since the container is exactly BROWSER_WIDTH x BROWSER_HEIGHT, coordinates are 1:1
    const browserX = Math.round(event.clientX - containerRect.left);
    const browserY = Math.round(event.clientY - containerRect.top);

    // Ensure coordinates are within bounds
    if (
      browserX < 0 ||
      browserX > BROWSER_WIDTH ||
      browserY < 0 ||
      browserY > BROWSER_HEIGHT
    ) {
      return;
    }

    // Prompt for description
    const description = prompt('Describe this click action (optional):') || '';

    setIsLoading(true);
    try {
      const response = await fetch('/api/script-creator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'click',
          x: browserX,
          y: browserY,
          description,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setScreenshot(data.screenshot);
        setCurrentUrl(data.url || currentUrl);

        const newStep: QuestStep = {
          type: 'click_at_coordinates',
          params: {
            x: browserX,
            y: browserY,
            description: description || `Click at (${browserX}, ${browserY})`,
            ...(data.targetElement && { _targetElement: data.targetElement }),
            ...(data.detectedChange && {
              _detectedChange: data.detectedChange,
            }),
          },
          description: `Click at (${browserX}, ${browserY})${
            description ? ` - ${description}` : ''
          }`,
          timestamp: new Date().toISOString(),
          status: 'success',
          ...(data.expectedChange && { expectedChange: data.expectedChange }),
          ...(data.expectedElement && {
            expectedElement: data.expectedElement,
          }),
        };

        setSteps((prev) => [...prev, newStep]);
      }
    } catch (error) {
      console.error('Click action failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle action submission
  const handleActionSubmit = async () => {
    if (!actionModal.type) {
      return;
    }

    setIsLoading(true);
    try {
      // stepParams: what gets saved in the script (may contain {{placeholders}})
      // browserParams: what gets sent to the browser (with resolved sample values)
      let stepParams: Record<string, unknown> = {};
      let browserParams: Record<string, unknown> = {};
      const stepType = actionModal.type;

      switch (actionModal.type) {
        case 'type_text': {
          // For type_text, resolve any {{placeholders}} to real values for the browser
          // but keep the original placeholders in the saved script
          const { resolved } = resolvePlaceholders(actionInput);
          stepParams = { text: actionInput }; // Original with placeholders
          browserParams = { text: resolved }; // Resolved for browser
          break;
        }
        case 'press_key':
          stepParams = { key: actionInput };
          browserParams = stepParams;
          break;
        case 'scroll':
          stepParams = { direction: scrollDirection };
          browserParams = stepParams;
          break;
        case 'wait':
          stepParams = { duration: parseInt(waitDuration, 10) };
          browserParams = stepParams;
          break;
        case 'navigate':
          stepParams = { url: actionInput };
          browserParams = stepParams;
          break;
      }

      const response = await fetch('/api/script-creator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: actionModal.type,
          ...browserParams, // Send resolved values to the browser
        }),
      });

      const data = await response.json();
      if (data.success) {
        setScreenshot(data.screenshot);
        if (data.url) {
          setCurrentUrl(data.url);
        }

        // Create a user-friendly description for display
        let description = `${stepType}: ${JSON.stringify(stepParams)}`;
        if (stepType === 'type_text' && typeof stepParams.text === 'string') {
          const hasPlaceholders =
            extractPlaceholders(stepParams.text).length > 0;
          if (hasPlaceholders) {
            description = `Type: ${stepParams.text} (dynamic)`;
          } else {
            description = `Type: "${stepParams.text}"`;
          }
        }

        const newStep: QuestStep = {
          type: stepType,
          params: stepParams, // Save with placeholders for future runs
          description,
          timestamp: new Date().toISOString(),
          status: 'success',
        };

        setSteps((prev) => [...prev, newStep]);
      }
    } catch (error) {
      console.error('Action failed:', error);
    } finally {
      setIsLoading(false);
      setActionModal({ type: null });
      setActionInput('');
    }
  };

  // Delete a step
  const handleDeleteStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  // Stop recording and save
  const handleSaveQuest = async () => {
    if (!questName || !questId) {
      alert('Please enter a quest name');
      return;
    }

    if (!instructions) {
      alert('Please enter instructions for the quest');
      return;
    }

    setIsSaving(true);
    try {
      // Stop the browser session if it's running
      if (mode === 'recording') {
        await fetch('/api/script-creator', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'stop' }),
        });
      }

      // Create the quest definition
      const definition: QuestDefinition = {
        id: questId,
        name: questName,
        description: instructions,
        instructions: instructions,
      };

      // Only create script if we have steps
      const script: QuestScript | undefined =
        steps.length > 0
          ? {
              id: questId,
              name: questName,
              description: instructions,
              steps,
              lastUpdated: new Date().toISOString(),
            }
          : undefined;

      await onSaveQuest(definition, script);

      // Reset form
      setQuestName('');
      setQuestId('');
      setInstructions('');
      setInitialUrl('');
      setSteps([]);
      setScreenshot(null);
      setCurrentUrl('');
      setMode('idle');

      alert(
        steps.length > 0
          ? 'Quest with script saved successfully!'
          : 'Quest saved successfully!'
      );
    } catch (error) {
      console.error('Failed to save quest:', error);
      alert('Failed to save quest');
    } finally {
      setIsSaving(false);
    }
  };

  // Cancel recording
  const handleCancelRecording = async () => {
    try {
      await fetch('/api/script-creator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
    } catch (error) {
      console.error('Failed to stop session:', error);
    }

    setMode('idle');
    setSteps([]);
    setScreenshot(null);
    setCurrentUrl('');
  };

  const getStepTypeColor = (type: string) => {
    switch (type) {
      case 'navigate':
        return '#ddf4ff';
      case 'click':
      case 'click_at_coordinates':
        return '#dafbe1';
      case 'type_text':
        return '#fff8c5';
      case 'scroll':
        return '#f0e6ff';
      case 'press_key':
        return '#ffe4e6';
      case 'wait':
        return '#e6e6e6';
      default:
        return '#eee';
    }
  };

  return (
    <div
      style={{
        padding: '24px',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* Header */}
      <h1
        style={{
          margin: 0,
          fontSize: '24px',
          color: '#1a1a2e',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <span style={{ fontSize: '28px' }}>✨</span>
        Quest Creator
      </h1>

      {/* Top Row: Quest Details + Recorded Steps (50/50) */}
      <div style={{ display: 'flex', gap: '20px' }}>
        {/* Quest Details Form */}
        <div
          style={{
            flex: 1,
            background: 'white',
            borderRadius: '12px',
            border: '1px solid #e1e4e8',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <h2
            style={{
              margin: '0 0 16px 0',
              fontSize: '16px',
              color: '#24292f',
            }}
          >
            Quest Details
          </h2>

          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: '4px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#24292f',
                }}
              >
                Quest Name
              </label>
              <input
                type="text"
                value={questName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g., Hello Fresh Registration"
                disabled={mode === 'recording'}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid #d0d7de',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
              {questId && (
                <div
                  style={{
                    marginTop: '2px',
                    fontSize: '11px',
                    color: '#666',
                  }}
                >
                  ID: <code>{questId}</code>
                </div>
              )}
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: '4px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#24292f',
                }}
              >
                Instructions
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Describe what this quest does..."
                disabled={mode === 'recording'}
                rows={2}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid #d0d7de',
                  borderRadius: '6px',
                  fontSize: '14px',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: '4px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#24292f',
                }}
              >
                Initial URL
              </label>
              <input
                type="url"
                value={initialUrl}
                onChange={(e) => setInitialUrl(e.target.value)}
                placeholder="https://example.com"
                disabled={mode === 'recording'}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid #d0d7de',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Recording Controls */}
            <div style={{ marginTop: '8px' }}>
              {mode === 'idle' ? (
                <button
                  onClick={handleStartRecording}
                  disabled={!initialUrl || isLoading}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    background: initialUrl ? '#238636' : '#94d3a2',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: initialUrl ? 'pointer' : 'not-allowed',
                    fontSize: '14px',
                    fontWeight: 500,
                  }}
                >
                  {isLoading ? 'Starting...' : '▶ Start Recording'}
                </button>
              ) : (
                <button
                  onClick={handleCancelRecording}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    background: '#cf222e',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500,
                  }}
                >
                  ⏹ Stop Recording
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Recorded Steps */}
        <div
          style={{
            flex: 1,
            background: 'white',
            borderRadius: '12px',
            border: '1px solid #e1e4e8',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '300px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '16px', color: '#24292f' }}>
              Recorded Steps ({steps.length})
            </h2>
            {mode === 'recording' && (
              <span
                style={{
                  padding: '4px 8px',
                  background: '#ff4444',
                  color: 'white',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 'bold',
                }}
              >
                ● REC
              </span>
            )}
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              marginBottom: '12px',
            }}
          >
            {steps.length === 0 ? (
              <div
                style={{
                  color: '#999',
                  textAlign: 'center',
                  padding: '20px',
                  fontSize: '13px',
                }}
              >
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>📝</div>
                No steps recorded yet.
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                {steps.map((step, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '8px 10px',
                      background: '#f6f8fa',
                      borderRadius: '6px',
                      border: '1px solid #e1e4e8',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 'bold',
                        color: '#666',
                        minWidth: '18px',
                      }}
                    >
                      #{index + 1}
                    </span>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: getStepTypeColor(step.type),
                        fontSize: '10px',
                        fontWeight: 'bold',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {step.type}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        color: '#444',
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {step.description?.slice(0, 40) ||
                        JSON.stringify(step.params).slice(0, 40)}
                    </span>
                    <button
                      onClick={() => handleDeleteStep(index)}
                      style={{
                        padding: '2px 4px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#cf222e',
                        fontSize: '12px',
                      }}
                      title="Delete step"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save Button */}
          <button
            onClick={handleSaveQuest}
            disabled={!questName || !instructions || isSaving}
            style={{
              width: '100%',
              padding: '10px',
              background: questName && instructions ? '#0969da' : '#94bdd7',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: questName && instructions ? 'pointer' : 'not-allowed',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            {isSaving
              ? 'Saving...'
              : steps.length > 0
              ? '💾 Save Quest with Script'
              : '💾 Save Quest'}
          </button>
        </div>
      </div>

      {/* Bottom Row: Browser Preview (Full Width, Fixed Size) */}
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          border: '1px solid #e1e4e8',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '16px', color: '#24292f' }}>
            Browser Preview
            <span
              style={{
                marginLeft: '10px',
                fontSize: '12px',
                color: '#666',
                fontWeight: 'normal',
              }}
            >
              ({BROWSER_WIDTH}×{BROWSER_HEIGHT})
            </span>
          </h2>

          {/* Action Buttons */}
          {mode === 'recording' && (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => setActionModal({ type: 'type_text' })}
                style={{
                  padding: '6px 10px',
                  background: '#fff8c5',
                  border: '1px solid #d4a72c',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                ⌨️ Type
              </button>
              <button
                onClick={() => setActionModal({ type: 'press_key' })}
                style={{
                  padding: '6px 10px',
                  background: '#ffe4e6',
                  border: '1px solid #e57373',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                🔤 Key
              </button>
              <button
                onClick={() => setActionModal({ type: 'scroll' })}
                style={{
                  padding: '6px 10px',
                  background: '#f0e6ff',
                  border: '1px solid #9c27b0',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                📜 Scroll
              </button>
              <button
                onClick={() => setActionModal({ type: 'wait' })}
                style={{
                  padding: '6px 10px',
                  background: '#e6e6e6',
                  border: '1px solid #999',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                ⏱️ Wait
              </button>
              <button
                onClick={() => setActionModal({ type: 'navigate' })}
                style={{
                  padding: '6px 10px',
                  background: '#ddf4ff',
                  border: '1px solid #0969da',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                🌐 Nav
              </button>
            </div>
          )}
        </div>

        {/* Browser Chrome - Fixed Size Container */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            overflow: 'auto',
          }}
        >
          <div
            style={{
              width: `${BROWSER_WIDTH}px`,
              flexShrink: 0,
              border: '1px solid #ccc',
              borderRadius: '8px',
              overflow: 'hidden',
              backgroundColor: '#f5f5f5',
            }}
          >
            {/* URL Bar */}
            <div
              style={{
                background: '#e0e0e0',
                padding: '8px 12px',
                borderBottom: '1px solid #ccc',
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
                  }}
                />
                <div
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: '#ffbd2e',
                  }}
                />
                <div
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: '#27c93f',
                  }}
                />
              </div>
              <div
                style={{
                  flex: 1,
                  background: 'white',
                  borderRadius: '4px',
                  padding: '4px 10px',
                  fontSize: '12px',
                  color: '#666',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {currentUrl || 'about:blank'}
              </div>
            </div>

            {/* Screenshot Area - Fixed Size */}
            <div
              ref={previewRef}
              onClick={handlePreviewClick}
              style={{
                width: `${BROWSER_WIDTH}px`,
                height: `${BROWSER_HEIGHT}px`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'white',
                cursor: mode === 'recording' ? 'crosshair' : 'default',
                position: 'relative',
              }}
            >
              {screenshot ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/jpeg;base64,${screenshot}`}
                  alt="Browser"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                  }}
                  draggable={false}
                />
              ) : (
                <div
                  style={{
                    color: '#999',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>
                    🎬
                  </div>
                  <div style={{ fontSize: '16px' }}>
                    Enter an initial URL and click &ldquo;Start Recording&rdquo;
                  </div>
                  <div
                    style={{
                      fontSize: '14px',
                      color: '#bbb',
                      marginTop: '8px',
                    }}
                  >
                    Click anywhere in the preview to record click actions
                  </div>
                </div>
              )}

              {isLoading && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(255,255,255,0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                    color: '#666',
                  }}
                >
                  Processing...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action Modal */}
      {actionModal.type && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '24px',
              width: '400px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>
              {actionModal.type === 'type_text' && '⌨️ Type Text'}
              {actionModal.type === 'press_key' && '🔤 Press Key'}
              {actionModal.type === 'scroll' && '📜 Scroll'}
              {actionModal.type === 'wait' && '⏱️ Wait'}
              {actionModal.type === 'navigate' && '🌐 Navigate'}
            </h3>

            {(actionModal.type === 'type_text' ||
              actionModal.type === 'press_key' ||
              actionModal.type === 'navigate') && (
              <div>
                <input
                  type="text"
                  value={actionInput}
                  onChange={(e) => setActionInput(e.target.value)}
                  placeholder={
                    actionModal.type === 'type_text'
                      ? 'Enter text to type...'
                      : actionModal.type === 'press_key'
                      ? 'Enter key name (e.g., Tab, Enter, Escape)'
                      : 'Enter URL...'
                  }
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d0d7de',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />

                {/* Dynamic context variable buttons - only show for type_text */}
                {actionModal.type === 'type_text' && (
                  <div style={{ marginTop: '12px' }}>
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#666',
                        marginBottom: '8px',
                      }}
                    >
                      Insert dynamic variable:
                    </div>
                    <div
                      style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}
                    >
                      {DYNAMIC_CONTEXT_VARIABLES.map((variable) => (
                        <button
                          key={variable.key}
                          onClick={() =>
                            setActionInput(
                              (prev) => prev + `{{${variable.key}}}`
                            )
                          }
                          title={`${variable.description}\nExample: ${variable.example}`}
                          style={{
                            padding: '6px 12px',
                            background: '#f0f7ff',
                            border: '1px solid #0969da',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            color: '#0969da',
                            fontFamily: 'monospace',
                          }}
                        >
                          {`{{${variable.key}}}`}
                        </button>
                      ))}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#888',
                        marginTop: '6px',
                        fontStyle: 'italic',
                      }}
                    >
                      Variables are replaced with fresh values each time the
                      script runs
                    </div>
                  </div>
                )}
              </div>
            )}

            {actionModal.type === 'scroll' && (
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setScrollDirection('up')}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background:
                      scrollDirection === 'up' ? '#0969da' : '#f6f8fa',
                    color: scrollDirection === 'up' ? 'white' : '#24292f',
                    border: '1px solid #d0d7de',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  ⬆️ Up
                </button>
                <button
                  onClick={() => setScrollDirection('down')}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background:
                      scrollDirection === 'down' ? '#0969da' : '#f6f8fa',
                    color: scrollDirection === 'down' ? 'white' : '#24292f',
                    border: '1px solid #d0d7de',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  ⬇️ Down
                </button>
              </div>
            )}

            {actionModal.type === 'wait' && (
              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontSize: '14px',
                    color: '#666',
                  }}
                >
                  Duration (milliseconds)
                </label>
                <input
                  type="number"
                  value={waitDuration}
                  onChange={(e) => setWaitDuration(e.target.value)}
                  min="100"
                  step="100"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d0d7de',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            <div
              style={{
                display: 'flex',
                gap: '12px',
                marginTop: '20px',
                justifyContent: 'flex-end',
              }}
            >
              <button
                onClick={() => {
                  setActionModal({ type: null });
                  setActionInput('');
                }}
                style={{
                  padding: '8px 16px',
                  background: '#f6f8fa',
                  border: '1px solid #d0d7de',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleActionSubmit}
                disabled={
                  (actionModal.type !== 'scroll' &&
                    actionModal.type !== 'wait' &&
                    !actionInput) ||
                  isLoading
                }
                style={{
                  padding: '8px 16px',
                  background: '#0969da',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                {isLoading ? 'Adding...' : 'Add Step'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
