import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signUp } from '../auth.js';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await signUp(email, password);
      navigate('/confirm', { state: { email, password } });
    } catch (err) {
      setError(err.message || 'Sign up failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const pageStyle = {
    minHeight: '100vh',
    background: '#1a1a2e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const cardStyle = {
    background: '#16213e',
    borderRadius: '12px',
    padding: '2.5rem 2rem',
    width: '100%',
    maxWidth: '380px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  };

  const titleStyle = {
    color: '#ffffff',
    fontSize: '2rem',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: '1.75rem',
    letterSpacing: '0.05em',
  };

  const inputStyle = {
    width: '100%',
    padding: '0.75rem 1rem',
    background: '#0f3460',
    border: '1px solid #2a2a5a',
    borderRadius: '6px',
    color: '#ffffff',
    fontSize: '1rem',
    boxSizing: 'border-box',
    outline: 'none',
  };

  const labelStyle = {
    display: 'block',
    color: '#cccccc',
    marginBottom: '0.4rem',
    fontSize: '0.9rem',
  };

  const fieldStyle = { marginBottom: '1.1rem' };

  const buttonStyle = {
    width: '100%',
    padding: '0.8rem',
    background: loading ? '#a02840' : '#e94560',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '1rem',
    fontWeight: 'bold',
    cursor: loading ? 'not-allowed' : 'pointer',
    marginTop: '0.5rem',
    transition: 'background 0.2s',
  };

  const errorStyle = {
    color: '#e94560',
    fontSize: '0.875rem',
    marginBottom: '1rem',
    textAlign: 'center',
  };

  const linkStyle = {
    display: 'block',
    textAlign: 'center',
    marginTop: '1.25rem',
    color: '#aaaaaa',
    fontSize: '0.875rem',
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Yes Sir!</h1>
        <form onSubmit={handleSubmit} noValidate>
          <div style={fieldStyle}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              required
              autoComplete="email"
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              required
              autoComplete="new-password"
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={inputStyle}
              required
              autoComplete="new-password"
            />
          </div>
          {error && <p style={errorStyle}>{error}</p>}
          <button type="submit" style={buttonStyle} disabled={loading}>
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>
        <Link to="/login" style={linkStyle}>
          Already have an account? Sign in
        </Link>
      </div>
    </div>
  );
}
