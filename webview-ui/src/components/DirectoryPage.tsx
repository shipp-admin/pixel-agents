import { useEffect, useState } from 'react';

interface OfficeRecord {
  id: string;
  name: string;
  wsUrl: string;
  lastSeenAt: string;
}

export function DirectoryPage({ directoryUrl }: { directoryUrl: string }) {
  const [offices, setOffices] = useState<OfficeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${directoryUrl}/offices`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status.toString()}`);
        return r.json() as Promise<OfficeRecord[]>;
      })
      .then((data) => {
        setOffices(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load offices');
        setLoading(false);
      });
  }, [directoryUrl]);

  function joinOffice(wsUrl: string): void {
    const params = new URLSearchParams(window.location.search);
    params.set('ws', wsUrl);
    window.location.search = params.toString();
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--pixel-bg)',
        color: 'var(--pixel-text)',
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          background: 'var(--pixel-bg)',
          border: '2px solid var(--pixel-border)',
          padding: '24px 32px',
          maxWidth: 480,
          width: '100%',
          boxShadow: 'var(--pixel-shadow)',
        }}
      >
        <div style={{ fontSize: '32px', marginBottom: 16, color: 'var(--pixel-accent)' }}>
          Pixel Offices
        </div>

        {loading && (
          <div style={{ fontSize: '22px', color: 'var(--pixel-text-dim)' }}>Loading...</div>
        )}

        {error && <div style={{ fontSize: '22px', color: '#ff6b6b' }}>Error: {error}</div>}

        {!loading && !error && offices.length === 0 && (
          <div style={{ fontSize: '22px', color: 'var(--pixel-text-dim)' }}>
            No offices online right now.
          </div>
        )}

        {!loading && !error && offices.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {offices.map((office) => (
              <div
                key={office.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  border: '2px solid var(--pixel-border)',
                  padding: '8px 12px',
                }}
              >
                <div>
                  <div style={{ fontSize: '24px' }}>{office.name}</div>
                  <div style={{ fontSize: '18px', color: 'var(--pixel-text-dim)' }}>
                    Last seen: {new Date(office.lastSeenAt).toLocaleTimeString()}
                  </div>
                </div>
                <button
                  onClick={() => joinOffice(office.wsUrl)}
                  style={{
                    padding: '4px 14px',
                    fontSize: '22px',
                    background: 'var(--pixel-accent)',
                    color: '#fff',
                    border: '2px solid var(--pixel-accent)',
                    borderRadius: 0,
                    cursor: 'pointer',
                    boxShadow: 'var(--pixel-shadow)',
                  }}
                >
                  Join
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            marginTop: 16,
            fontSize: '18px',
            color: 'var(--pixel-text-dim)',
            borderTop: '1px solid var(--pixel-border)',
            paddingTop: 12,
          }}
        >
          Or connect directly:{' '}
          <code style={{ fontSize: '16px' }}>{window.location.origin}?ws=wss://your-relay-url</code>
        </div>
      </div>
    </div>
  );
}
