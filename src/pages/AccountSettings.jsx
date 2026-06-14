import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, signOut, changePassword } from '../auth.js';

export default function AccountSettings() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getCurrentUser().then((result) => {
      if (result) setEmail(result.email);
    });
  }, []);

  function handleSignOut() {
    signOut();
    navigate('/login');
  }

  function validate() {
    const errors = {};
    if (!oldPassword) errors.oldPassword = 'Required.';
    if (!newPassword) {
      errors.newPassword = 'Required.';
    } else if (newPassword.length < 8) {
      errors.newPassword = 'Must be at least 8 characters.';
    }
    if (!confirmPassword) {
      errors.confirmPassword = 'Required.';
    } else if (newPassword && confirmPassword !== newPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }
    return errors;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError('');
    setSuccessMsg('');
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      await changePassword(oldPassword, newPassword);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setFieldErrors({});
      setSuccessMsg('Password updated!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setSubmitError(err.message || 'Failed to update password.');
    } finally {
      setSubmitting(false);
    }
  }

  const cardStyle = {
    background: 'rgba(0,0,0,0.35)',
    borderRadius: '12px',
    padding: '1.5rem',
    border: '1px solid rgba(255,255,255,0.1)',
    marginBottom: '1.25rem',
  };

  const sectionHeadingStyle = {
    color: '#ffd700',
    fontSize: '1rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginTop: 0,
    marginBottom: '1.25rem',
  };

  const labelStyle = {
    display: 'block',
    color: '#ccc',
    fontSize: '0.875rem',
    marginBottom: '0.4rem',
  };

  const inputStyle = {
    background: '#0f3460',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.12)',
    padding: '0.65rem 0.75rem',
    borderRadius: '6px',
    width: '100%',
    fontSize: '0.95rem',
    boxSizing: 'border-box',
    outline: 'none',
  };

  const fieldGroupStyle = {
    marginBottom: '1rem',
  };

  const inlineErrorStyle = {
    color: '#f87171',
    fontSize: '0.8rem',
    marginTop: '0.35rem',
  };

  const primaryBtnStyle = {
    background: '#e94560',
    color: '#fff',
    border: 'none',
    width: '100%',
    borderRadius: '6px',
    padding: '0.75rem',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: submitting ? 'not-allowed' : 'pointer',
    opacity: submitting ? 0.7 : 1,
    marginTop: '0.5rem',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#1a472a',
        color: '#fff',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: '480px',
          margin: '0 auto',
          padding: '2rem 1rem',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '2rem',
          }}
        >
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffd700',
              fontSize: '0.95rem',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            ← Back
          </button>

          <h1
            style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: 700,
              color: '#fff',
              textAlign: 'center',
              flex: 1,
            }}
          >
            Account Settings
          </h1>

          <button
            onClick={handleSignOut}
            style={{
              background: 'rgba(233,69,96,0.2)',
              border: '1px solid rgba(233,69,96,0.5)',
              color: '#e94560',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              borderRadius: '6px',
              padding: '0.4rem 0.75rem',
              whiteSpace: 'nowrap',
            }}
          >
            Sign Out
          </button>
        </div>

        {/* Account Info */}
        <div style={cardStyle}>
          <h2 style={sectionHeadingStyle}>Account Info</h2>
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>Email</label>
            <div
              style={{
                ...inputStyle,
                opacity: 0.7,
                cursor: 'default',
                userSelect: 'text',
              }}
            >
              {email || '—'}
            </div>
          </div>
        </div>

        {/* Change Password */}
        <div style={cardStyle}>
          <h2 style={sectionHeadingStyle}>Change Password</h2>
          <form onSubmit={handleSubmit} noValidate>
            <div style={fieldGroupStyle}>
              <label htmlFor="oldPassword" style={labelStyle}>
                Current Password
              </label>
              <input
                id="oldPassword"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                style={inputStyle}
                autoComplete="current-password"
              />
              {fieldErrors.oldPassword && (
                <div style={inlineErrorStyle}>{fieldErrors.oldPassword}</div>
              )}
            </div>

            <div style={fieldGroupStyle}>
              <label htmlFor="newPassword" style={labelStyle}>
                New Password
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={inputStyle}
                autoComplete="new-password"
              />
              {fieldErrors.newPassword && (
                <div style={inlineErrorStyle}>{fieldErrors.newPassword}</div>
              )}
            </div>

            <div style={fieldGroupStyle}>
              <label htmlFor="confirmPassword" style={labelStyle}>
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={inputStyle}
                autoComplete="new-password"
              />
              {fieldErrors.confirmPassword && (
                <div style={inlineErrorStyle}>{fieldErrors.confirmPassword}</div>
              )}
            </div>

            {submitError && (
              <div
                style={{
                  color: '#f87171',
                  fontSize: '0.875rem',
                  marginBottom: '0.75rem',
                  padding: '0.6rem 0.75rem',
                  background: 'rgba(248,113,113,0.1)',
                  borderRadius: '6px',
                  border: '1px solid rgba(248,113,113,0.3)',
                }}
              >
                {submitError}
              </div>
            )}

            {successMsg && (
              <div
                style={{
                  color: '#4ade80',
                  fontSize: '0.875rem',
                  marginBottom: '0.75rem',
                  padding: '0.6rem 0.75rem',
                  background: 'rgba(74,222,128,0.1)',
                  borderRadius: '6px',
                  border: '1px solid rgba(74,222,128,0.3)',
                }}
              >
                {successMsg}
              </div>
            )}

            <button type="submit" style={primaryBtnStyle} disabled={submitting}>
              {submitting ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
