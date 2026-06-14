import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signIn, getCurrentUser } from '../auth.js';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getCurrentUser().then(user => {
      if (user) navigate('/');
    });
  }, [navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Incorrect username or password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#16213e', padding: '2.5rem 2rem', borderRadius: '12px', width: '100%', maxWidth: '380px' }}>
        <h1 style={{ color: '#fff', textAlign: 'center', marginBottom: '0.25rem', fontSize: '2rem', fontWeight: 700 }}>Yes Sir!</h1>
        <p style={{ color: '#aaa', textAlign: 'center', marginBottom: '2rem', fontSize: '0.9rem' }}>Sign in to play</p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', color: '#ccc', marginBottom: '0.4rem', fontSize: '0.875rem' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{ width: '100%', padding: '0.65rem 0.75rem', background: '#0f3460', color: '#fff', border: '1px solid #1e4a8a', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', color: '#ccc', marginBottom: '0.4rem', fontSize: '0.875rem' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{ width: '100%', padding: '0.65rem 0.75rem', background: '#0f3460', color: '#fff', border: '1px solid #1e4a8a', borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>

          {error && (
            <p style={{ color: '#e94560', fontSize: '0.875rem', marginBottom: '1rem', marginTop: '-0.5rem' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '0.75rem', background: loading ? '#a33040' : '#e94560', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '1rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p style={{ color: '#aaa', textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem' }}>
          Don't have an account?{' '}
          <Link to="/signup" style={{ color: '#e94560', textDecoration: 'none' }}>Sign up</Link>
        </p>
      </div>
    </div>
  );
}
