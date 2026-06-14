import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { confirmSignUp } from '../auth.js';

export default function ConfirmEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email;

  if (!email) {
    navigate('/signup');
    return null;
  }

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await confirmSignUp(email, code);
      navigate('/login', { state: { confirmed: true } });
    } catch (err) {
      setError(err.message || 'Confirmation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#16213e', borderRadius: '12px', padding: '40px', width: '100%', maxWidth: '380px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
        <h1 style={{ color: '#e94560', textAlign: 'center', fontSize: '2rem', marginBottom: '8px', fontFamily: 'Georgia, serif' }}>
          Yes Sir!
        </h1>
        <p style={{ color: '#ccc', textAlign: 'center', marginBottom: '24px', fontSize: '0.9rem' }}>
          We sent a code to <strong style={{ color: '#fff' }}>{email}</strong>
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            required
            style={{
              display: 'block',
              width: '100%',
              padding: '14px',
              fontSize: '1.8rem',
              textAlign: 'center',
              letterSpacing: '0.4em',
              background: '#0f3460',
              color: '#fff',
              border: '1px solid #2a4080',
              borderRadius: '8px',
              marginBottom: '16px',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
          {error && (
            <p style={{ color: '#e94560', fontSize: '0.85rem', marginBottom: '12px', textAlign: 'center' }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            style={{
              width: '100%',
              padding: '12px',
              background: loading || code.length !== 6 ? '#7a1f2e' : '#e94560',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              cursor: loading || code.length !== 6 ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'Confirming…' : 'Confirm Email'}
          </button>
        </form>
      </div>
    </div>
  );
}
