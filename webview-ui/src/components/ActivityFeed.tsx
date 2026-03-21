import { useEffect, useRef, useState } from 'react';

export interface FeedEntry {
  id: string;
  agentId: number;
  folderName: string;
  status: string; // raw status (kept for debugging)
  flavorText: string; // personality-driven display text
  emoji: string;
  timestamp: number;
  done: boolean;
}

interface ActivityFeedProps {
  entries: FeedEntry[];
}

export function ActivityFeed({ entries }: ActivityFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        style={{
          position: 'fixed',
          bottom: 64,
          right: 12,
          background: '#1e1e2e',
          border: '2px solid #3a3a5c',
          color: '#c8c8e8',
          padding: '5px 10px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 13,
          boxShadow: '2px 2px 0 #0a0a14',
        }}
      >
        📋 Activity
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 64,
        right: 12,
        width: 360,
        maxHeight: 300,
        background: '#1e1e2e',
        border: '2px solid #3a3a5c',
        boxShadow: '2px 2px 0 #0a0a14',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '"FS Pixel Sans", monospace',
        fontSize: 13,
        color: '#c8c8e8',
        zIndex: 30,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '4px 8px',
          borderBottom: '1px solid #3a3a5c',
          background: '#16162a',
        }}
      >
        <span style={{ color: '#7c7caa', fontSize: 11, letterSpacing: 1 }}>ACTIVITY</span>
        <button
          onClick={() => setVisible(false)}
          style={{
            background: 'none',
            border: 'none',
            color: '#7c7caa',
            cursor: 'pointer',
            padding: 0,
            fontSize: 13,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* Feed */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '3px 0' }}>
        {entries.length === 0 && (
          <div style={{ color: '#4a4a6a', padding: '6px 10px', fontSize: 12 }}>
            Waiting for activity…
          </div>
        )}
        {entries.map((entry) => (
          <div
            key={entry.id}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 6,
              padding: '3px 8px',
              opacity: entry.done ? 0.45 : 1,
              transition: 'opacity 0.4s',
              borderLeft: entry.done ? '2px solid transparent' : '2px solid #4a9eff44',
            }}
          >
            <span style={{ fontSize: 9, flexShrink: 0 }}>{entry.emoji}</span>
            <span
              style={{
                color: '#7c7caa',
                fontSize: 11,
                flexShrink: 0,
                maxWidth: 80,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {entry.folderName}
            </span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
                fontSize: 12,
              }}
            >
              "{entry.flavorText}"
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
