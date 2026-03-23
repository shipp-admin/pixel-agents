import { useState } from 'react';

interface SetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  background: 'rgba(0, 0, 0, 0.6)',
  zIndex: 49,
};

const modalStyle: React.CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  zIndex: 50,
  background: 'var(--pixel-bg)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  padding: '4px',
  boxShadow: 'var(--pixel-shadow)',
  width: 520,
  maxWidth: '90vw',
  maxHeight: '85vh',
  overflowY: 'auto',
};

const stepStyle: React.CSSProperties = {
  borderTop: '1px solid var(--pixel-border)',
  padding: '10px 12px',
};

const stepNumStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 22,
  height: 22,
  background: 'var(--pixel-accent)',
  color: '#fff',
  fontSize: '18px',
  textAlign: 'center',
  lineHeight: '22px',
  marginRight: 8,
  flexShrink: 0,
};

const codeBlockStyle: React.CSSProperties = {
  display: 'block',
  background: 'rgba(0,0,0,0.4)',
  border: '1px solid var(--pixel-border)',
  padding: '6px 10px',
  fontSize: '16px',
  fontFamily: 'monospace',
  color: '#a0e0a0',
  marginTop: 6,
  wordBreak: 'break-all',
  whiteSpace: 'pre-wrap',
  cursor: 'pointer',
  userSelect: 'all',
};

const labelStyle: React.CSSProperties = {
  fontSize: '22px',
  color: 'var(--pixel-text)',
  display: 'flex',
  alignItems: 'flex-start',
  gap: 0,
};

const dimStyle: React.CSSProperties = {
  fontSize: '18px',
  color: 'var(--pixel-text-dim)',
  marginTop: 4,
};

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div style={{ position: 'relative' }}>
      <code style={codeBlockStyle} onClick={copy} title="Click to copy">
        {text}
      </code>
      {copied && (
        <span
          style={{
            position: 'absolute',
            top: 4,
            right: 8,
            fontSize: '14px',
            color: '#a0e0a0',
            pointerEvents: 'none',
          }}
        >
          copied!
        </span>
      )}
    </div>
  );
}

export function SetupModal({ isOpen, onClose }: SetupModalProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  if (!isOpen) return null;

  const pageUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://your-app.vercel.app';

  const hookConfig = `{
  "hooks": {
    "SessionStart":  [{"hooks": [{"type": "http", "url": "http://localhost:5175/hooks", "timeout": 5}]}],
    "PreToolUse":    [{"hooks": [{"type": "http", "url": "http://localhost:5175/hooks", "timeout": 5}]}],
    "PostToolUse":   [{"hooks": [{"type": "http", "url": "http://localhost:5175/hooks", "timeout": 5}]}],
    "Stop":          [{"hooks": [{"type": "http", "url": "http://localhost:5175/hooks", "timeout": 5}]}],
    "SessionEnd":    [{"hooks": [{"type": "http", "url": "http://localhost:5175/hooks", "timeout": 5}]}],
    "SubagentStart": [{"hooks": [{"type": "http", "url": "http://localhost:5175/hooks", "timeout": 5}]}],
    "SubagentStop":  [{"hooks": [{"type": "http", "url": "http://localhost:5175/hooks", "timeout": 5}]}]
  }
}`;

  return (
    <>
      <div onClick={onClose} style={overlayStyle} />
      <div style={modalStyle}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 10px 8px',
            borderBottom: '1px solid var(--pixel-border)',
            marginBottom: '4px',
          }}
        >
          <span style={{ fontSize: '24px', color: 'rgba(255,255,255,0.9)' }}>
            Connect Your Agents
          </span>
          <button
            onClick={onClose}
            onMouseEnter={() => setHovered('close')}
            onMouseLeave={() => setHovered(null)}
            style={{
              background: hovered === 'close' ? 'rgba(255,255,255,0.08)' : 'transparent',
              border: 'none',
              borderRadius: 0,
              color: 'rgba(255,255,255,0.6)',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            X
          </button>
        </div>

        {/* Step 1 */}
        <div style={stepStyle}>
          <div style={labelStyle}>
            <span style={stepNumStyle}>1</span>
            <span>Start the relay server</span>
          </div>
          <p style={dimStyle}>
            The relay receives Claude Code hook events and forwards them to this page.
          </p>
          <CopyBlock text="npx shipp-agent-hq" />
        </div>

        {/* Step 2 */}
        <div style={stepStyle}>
          <div style={labelStyle}>
            <span style={stepNumStyle}>2</span>
            <span>Add hooks to Claude Code</span>
          </div>
          <p style={dimStyle}>
            Add this to{' '}
            <code style={{ fontSize: '16px', color: '#a0e0a0' }}>~/.claude/settings.json</code> so
            Claude Code sends events to the relay:
          </p>
          <CopyBlock text={hookConfig} />
        </div>

        {/* Step 3 */}
        <div style={stepStyle}>
          <div style={labelStyle}>
            <span style={stepNumStyle}>3</span>
            <span>Expose the relay publicly</span>
          </div>
          <p style={dimStyle}>
            Cloudflare Tunnel creates a public URL pointing to your local relay. Install once:
          </p>
          <CopyBlock text="brew install cloudflare/cloudflare/cloudflared" />
          <p style={{ ...dimStyle, marginTop: 8 }}>Then run (keep this terminal open):</p>
          <CopyBlock text="cloudflared tunnel --url http://localhost:5175" />
          <p style={dimStyle}>
            Copy the{' '}
            <code style={{ fontSize: '16px', color: '#a0e0a0' }}>
              https://....trycloudflare.com
            </code>{' '}
            URL it prints.
          </p>
        </div>

        {/* Step 4 */}
        <div style={stepStyle}>
          <div style={labelStyle}>
            <span style={stepNumStyle}>4</span>
            <span>Open your office</span>
          </div>
          <p style={dimStyle}>Visit this URL, replacing the tunnel address with yours:</p>
          <CopyBlock text={`${pageUrl}/?ws=wss://your-tunnel.trycloudflare.com`} />
          <p style={dimStyle}>
            Your agents will appear as characters whenever Claude Code is active.
          </p>
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: '1px solid var(--pixel-border)',
            padding: '8px 12px',
            fontSize: '18px',
            color: 'var(--pixel-text-dim)',
          }}
        >
          Source & docs:{' '}
          <a
            href="https://github.com/shipp-admin/pixel-agents"
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--pixel-accent)' }}
          >
            github.com/shipp-admin/pixel-agents
          </a>
        </div>
      </div>
    </>
  );
}
