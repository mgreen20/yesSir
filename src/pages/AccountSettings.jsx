import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, signOut, changePassword, updateEmail, verifyEmailCode, getIdToken } from '../auth.js';

const API_BASE = import.meta.env.VITE_HTTP_API_URL;

async function apiFetch(path, options = {}) {
  const token = await getIdToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

const cardStyle = {
  background: 'rgba(0,0,0,0.35)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '12px',
  padding: '1.5rem',
  marginBottom: '1.25rem',
};

const sectionHeadingStyle = {
  color: '#ffd700',
  fontSize: '0.85rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginTop: 0,
  marginBottom: '1rem',
};

const labelStyle = {
  color: '#ccc',
  fontSize: '0.875rem',
  display: 'block',
  marginBottom: '0.4rem',
};

const inputStyle = {
  background: '#0f3460',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '6px',
  padding: '0.65rem 0.75rem',
  width: '100%',
  boxSizing: 'border-box',
  fontSize: '0.95rem',
  outline: 'none',
};

const primaryBtnStyle = {
  background: '#e94560',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  padding: '0.65rem 1.25rem',
  cursor: 'pointer',
  fontSize: '0.9rem',
  fontWeight: 600,
};

const successStyle = { color: '#4ade80', fontSize: '0.875rem', marginTop: '0.5rem' };
const errorStyle = { color: '#e94560', fontSize: '0.875rem', marginTop: '0.5rem' };
const fieldGroupStyle = { marginBottom: '1rem' };

export default function AccountSettings() {
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState('');

  // Profile state
  const [screenname, setScreenname] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [screennameLoading, setScreennameLoading] = useState(false);
  const [screennameError, setScreennameError] = useState('');
  const [screennameSuccess, setScreennameSuccess] = useState('');
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const fileInputRef = useRef(null);

  // Email state
  const [newEmail, setNewEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  // Password state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  useEffect(() => {
    async function loadProfile() {
      const user = await getCurrentUser();
      if (!user) return;
      setUserEmail(user.email || '');
      try {
        const profile = await apiFetch('/profile');
        setScreenname(profile.screenname || '');
        setAvatarUrl(profile.avatarUrl || '');
      } catch {
        // non-fatal
      }
    }
    loadProfile();
  }, []);

  function handleSignOut() {
    signOut();
    navigate('/login');
  }

  // Avatar upload
  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setAvatarError('');
    setAvatarLoading(true);
    try {
      const { uploadUrl, avatarUrl: newAvatarUrl } = await apiFetch('/profile/avatar-upload-url', {
        method: 'POST',
        body: JSON.stringify({ contentType: file.type }),
      });
      await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      await apiFetch('/profile', {
        method: 'PUT',
        body: JSON.stringify({ avatarUrl: newAvatarUrl }),
      });
      setAvatarUrl(newAvatarUrl);
    } catch (err) {
      setAvatarError(err.message || 'Failed to upload photo.');
    } finally {
      setAvatarLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // Screen name save
  async function handleScreennameSave(e) {
    e.preventDefault();
    setScreennameError('');
    setScreennameSuccess('');
    if (!screenname.trim()) {
      setScreennameError('Screen name cannot be empty.');
      return;
    }
    setScreennameLoading(true);
    try {
      await apiFetch('/profile', {
        method: 'PUT',
        body: JSON.stringify({ screenname: screenname.trim() }),
      });
      setScreennameSuccess('Screen name saved!');
    } catch (err) {
      setScreennameError(err.message || 'Failed to save screen name.');
    } finally {
      setScreennameLoading(false);
    }
  }

  // Email update
  async function handleUpdateEmail(e) {
    e.preventDefault();
    setEmailError('');
    setEmailSuccess('');
    if (!newEmail.trim()) {
      setEmailError('Please enter a new email address.');
      return;
    }
    setEmailLoading(true);
    try {
      await updateEmail(newEmail.trim());
      setVerificationSent(true);
    } catch (err) {
      setEmailError(err.message || 'Failed to send verification email.');
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleVerifyCode(e) {
    e.preventDefault();
    setVerifyError('');
    if (!verifyCode.trim()) {
      setVerifyError('Please enter the verification code.');
      return;
    }
    setVerifyLoading(true);
    try {
      await verifyEmailCode(verifyCode.trim());
      setUserEmail(newEmail.trim());
      setNewEmail('');
      setVerifyCode('');
      setVerificationSent(false);
      setEmailSuccess('Email updated!');
    } catch (err) {
      setVerifyError(err.message || 'Invalid or expired code.');
    } finally {
      setVerifyLoading(false);
    }
  }

  // Password change
  async function handlePasswordSave(e) {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    if (!oldPassword) { setPasswordError('Current password is required.'); return; }
    if (newPassword.length < 8) { setPasswordError('New password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match.'); return; }
    setPasswordLoading(true);
    try {
      await changePassword(oldPassword, newPassword);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess('Password updated!');
      setTimeout(() => setPasswordSuccess(''), 3000);
    } catch (err) {
      setPasswordError(err.message || 'Failed to update password.');
    } finally {
      setPasswordLoading(false);
    }
  }

  const avatarInitial = screenname ? screenname[0].toUpperCase() : '?';

  return (
    <div style={{ minHeight: '100vh', background: '#1a472a', color: '#fff', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: '520px', margin: '0 auto', padding: '2rem 1rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', color: '#ffd700', fontSize: '0.95rem', cursor: 'pointer', padding: 0 }}
          >
            ← Back
          </button>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#fff', flex: 1, textAlign: 'center' }}>
            Account Settings
          </h1>
          <button
            onClick={handleSignOut}
            style={{ background: 'rgba(233,69,96,0.2)', border: '1px solid rgba(233,69,96,0.5)', color: '#e94560', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', borderRadius: '6px', padding: '0.4rem 0.75rem', whiteSpace: 'nowrap' }}
          >
            Sign Out
          </button>
        </div>

        {/* Section 1: Avatar & Screen Name */}
        <div style={cardStyle}>
          <h2 style={sectionHeadingStyle}>Profile</h2>

          {/* Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.25rem' }}>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                style={{ borderRadius: '50%', width: '80px', height: '80px', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.2)' }}
              />
            ) : (
              <div style={{ borderRadius: '50%', width: '80px', height: '80px', border: '3px solid rgba(255,255,255,0.2)', background: '#0f3460', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', color: '#fff', fontWeight: 700, flexShrink: 0 }}>
                {avatarInitial}
              </div>
            )}
            <div>
              <button
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                disabled={avatarLoading}
                style={{ ...primaryBtnStyle, opacity: avatarLoading ? 0.7 : 1, cursor: avatarLoading ? 'not-allowed' : 'pointer' }}
              >
                {avatarLoading ? 'Uploading…' : 'Change Photo'}
              </button>
              {avatarError && <div style={errorStyle}>{avatarError}</div>}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>

          {/* Screen Name */}
          <form onSubmit={handleScreennameSave}>
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Screen Name</label>
              <input
                type="text"
                value={screenname}
                onChange={(e) => setScreenname(e.target.value)}
                style={inputStyle}
              />
            </div>
            {screennameError && <div style={{ ...errorStyle, marginBottom: '0.5rem' }}>{screennameError}</div>}
            {screennameSuccess && <div style={{ ...successStyle, marginBottom: '0.5rem' }}>{screennameSuccess}</div>}
            <button
              type="submit"
              disabled={screennameLoading}
              style={{ ...primaryBtnStyle, opacity: screennameLoading ? 0.7 : 1, cursor: screennameLoading ? 'not-allowed' : 'pointer' }}
            >
              {screennameLoading ? 'Saving…' : 'Save'}
            </button>
          </form>
        </div>

        {/* Section 2: Email */}
        <div style={cardStyle}>
          <h2 style={sectionHeadingStyle}>Email</h2>
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>Current Email</label>
            <div style={{ ...inputStyle, opacity: 0.7, cursor: 'default' }}>{userEmail || '—'}</div>
          </div>

          {!verificationSent ? (
            <form onSubmit={handleUpdateEmail}>
              <div style={fieldGroupStyle}>
                <label style={labelStyle}>New Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  style={inputStyle}
                  placeholder="Enter new email address"
                />
              </div>
              {emailError && <div style={{ ...errorStyle, marginBottom: '0.5rem' }}>{emailError}</div>}
              {emailSuccess && <div style={{ ...successStyle, marginBottom: '0.5rem' }}>{emailSuccess}</div>}
              <button
                type="submit"
                disabled={emailLoading}
                style={{ ...primaryBtnStyle, opacity: emailLoading ? 0.7 : 1, cursor: emailLoading ? 'not-allowed' : 'pointer' }}
              >
                {emailLoading ? 'Sending…' : 'Update Email'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode}>
              <p style={{ color: '#ccc', fontSize: '0.875rem', marginTop: 0, marginBottom: '1rem' }}>
                A verification code was sent to <strong>{newEmail}</strong>. Enter it below to confirm.
              </p>
              <div style={fieldGroupStyle}>
                <label style={labelStyle}>Verification Code</label>
                <input
                  type="text"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  style={inputStyle}
                  placeholder="6-digit code"
                  maxLength={6}
                  inputMode="numeric"
                />
              </div>
              {verifyError && <div style={{ ...errorStyle, marginBottom: '0.5rem' }}>{verifyError}</div>}
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <button
                  type="submit"
                  disabled={verifyLoading}
                  style={{ ...primaryBtnStyle, opacity: verifyLoading ? 0.7 : 1, cursor: verifyLoading ? 'not-allowed' : 'pointer' }}
                >
                  {verifyLoading ? 'Confirming…' : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => { setVerificationSent(false); setVerifyCode(''); setVerifyError(''); }}
                  style={{ background: 'none', border: 'none', color: '#ccc', fontSize: '0.875rem', cursor: 'pointer', padding: 0 }}
                >
                  Cancel
                </button>
              </div>
              {emailSuccess && <div style={{ ...successStyle, marginTop: '0.5rem' }}>{emailSuccess}</div>}
            </form>
          )}
        </div>

        {/* Section 3: Password */}
        <div style={cardStyle}>
          <h2 style={sectionHeadingStyle}>Password</h2>
          <form onSubmit={handlePasswordSave}>
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Current Password</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                style={inputStyle}
                autoComplete="current-password"
              />
            </div>
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={inputStyle}
                autoComplete="new-password"
              />
            </div>
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={inputStyle}
                autoComplete="new-password"
              />
            </div>
            {passwordError && <div style={{ ...errorStyle, marginBottom: '0.5rem' }}>{passwordError}</div>}
            {passwordSuccess && <div style={{ ...successStyle, marginBottom: '0.5rem' }}>{passwordSuccess}</div>}
            <button
              type="submit"
              disabled={passwordLoading}
              style={{ ...primaryBtnStyle, opacity: passwordLoading ? 0.7 : 1, cursor: passwordLoading ? 'not-allowed' : 'pointer' }}
            >
              {passwordLoading ? 'Saving…' : 'Save'}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
