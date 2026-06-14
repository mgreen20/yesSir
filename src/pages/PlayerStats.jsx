import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, getIdToken } from '../auth.js';

const STAT_FIELDS = [
  { key: 'gamesPlayed', label: 'Games Played', format: v => v },
  { key: 'gamesWon', label: 'Games Won', format: v => v },
  { key: 'winRate', label: 'Win Rate', format: v => `${(v * 100).toFixed(1)}%` },
  { key: 'tricksWon', label: 'Tricks Won', format: v => v },
  { key: 'bidAccuracy', label: 'Bid Accuracy', format: v => `${(v * 100).toFixed(1)}%` },
];

export default function PlayerStats() {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const [stats, setStats] = useState(undefined);
  const [recentGames, setRecentGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const token = await getIdToken();
        const res = await fetch(`${import.meta.env.VITE_HTTP_API_URL}/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setStats(data.stats ?? null);
          setRecentGames(data.recentGames ?? []);
        } else {
          setStats(null);
          setRecentGames([]);
        }
      } catch {
        setStats(null);
        setRecentGames([]);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const formatStat = (field, stats) => {
    if (!stats) return '--';
    const val = stats[field.key];
    if (val == null) return '--';
    return field.format(val);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#1a472a',
        color: '#fff',
        fontFamily: 'sans-serif',
        padding: '1.5rem 1rem',
      }}
    >
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.75rem',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffd700',
              fontSize: '1rem',
              cursor: 'pointer',
              padding: '0.25rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            ← Back
          </button>
          <div style={{ textAlign: 'right' }}>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700 }}>Your Stats</h1>
            {user?.email && (
              <div style={{ color: '#aaa', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                {user.email}
              </div>
            )}
          </div>
        </div>

        {/* Stats section header */}
        <div
          style={{
            color: '#ccc',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontSize: '0.85rem',
            marginBottom: '0.6rem',
          }}
        >
          Overview
        </div>

        {/* Stats grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
            gap: '0.75rem',
            marginBottom: '2rem',
          }}
        >
          {STAT_FIELDS.map(field => (
            <div
              key={field.key}
              style={{
                background: 'rgba(0,0,0,0.35)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: '1.25rem',
              }}
            >
              {loading ? (
                <div
                  style={{
                    color: '#ffd700',
                    fontSize: '2rem',
                    fontWeight: 700,
                    opacity: 0.4,
                  }}
                >
                  …
                </div>
              ) : (
                <div style={{ color: '#ffd700', fontSize: '2rem', fontWeight: 700 }}>
                  {formatStat(field, stats)}
                </div>
              )}
              <div style={{ color: '#aaa', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                {field.label}
              </div>
            </div>
          ))}
        </div>

        {/* Coming soon note */}
        {!loading && stats === null && (
          <div
            style={{
              color: '#aaa',
              fontSize: '0.85rem',
              textAlign: 'center',
              marginTop: '-1.25rem',
              marginBottom: '1.75rem',
            }}
          >
            Stats tracking coming soon — play some multiplayer games!
          </div>
        )}

        {/* Recent games section */}
        <div
          style={{
            color: '#ccc',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontSize: '0.85rem',
            marginBottom: '0.6rem',
          }}
        >
          Recent Games
        </div>

        {loading ? (
          <div
            style={{
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              padding: '2rem',
              textAlign: 'center',
              color: '#aaa',
              fontSize: '0.9rem',
            }}
          >
            Loading…
          </div>
        ) : recentGames.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {recentGames.map((game, i) => (
              <div
                key={game.id ?? i}
                style={{
                  background: 'rgba(0,0,0,0.35)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  padding: '1rem 1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <span style={{ color: '#ccc', fontSize: '0.9rem' }}>
                  {game.date ?? 'Unknown date'}
                </span>
                <span
                  style={{
                    color: game.won ? '#ffd700' : '#aaa',
                    fontWeight: game.won ? 700 : 400,
                    fontSize: '0.9rem',
                  }}
                >
                  {game.won ? 'Won' : 'Lost'}
                  {game.score != null ? ` · ${game.score} pts` : ''}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              padding: '2.5rem 1.25rem',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem', opacity: 0.4 }}>
              🃏
            </div>
            <div style={{ color: '#aaa', fontSize: '0.9rem' }}>No games played yet.</div>
          </div>
        )}
      </div>
    </div>
  );
}
