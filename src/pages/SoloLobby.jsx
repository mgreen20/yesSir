import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, signOut, getIdToken } from "../auth";
import AVATARS from "../avatars";
import AvatarCard from "../components/AvatarCard";

async function apiFetch(path, options = {}) {
  const token = await getIdToken();
  const res = await fetch(`${import.meta.env.VITE_HTTP_API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

function trimEmail(email) {
  if (!email) return "";
  return email.includes("@") ? email.split("@")[0] : email;
}

function pickRandomOpponents() {
  const shuffled = [...AVATARS].sort(() => Math.random() - 0.5);
  return [shuffled[0], shuffled[1], shuffled[2]];
}

export default function SoloLobby() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState([]);
  const [showRandom, setShowRandom] = useState(false);
  const [randomPicks, setRandomPicks] = useState(null);

  const [userEmail, setUserEmail] = useState("");
  const [screenname, setScreenname] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    async function loadUser() {
      const u = await getCurrentUser();
      if (!u) return;
      setUserEmail(u.email);
      try {
        const profile = await apiFetch("/profile");
        setScreenname(profile.screenname || "");
        setAvatarUrl(profile.avatarUrl || "");
      } catch { /* non-fatal */ }
    }
    loadUser();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  function handleSignOut() {
    signOut();
    navigate("/login");
  }

  function toggleSelect(avatar) {
    if (selected.find((a) => a.id === avatar.id)) {
      setSelected(selected.filter((a) => a.id !== avatar.id));
    } else if (selected.length < 3) {
      setSelected([...selected, avatar]);
    }
  }

  function handleRandomDraw() {
    setRandomPicks(pickRandomOpponents());
    setSelected([]);
    setShowRandom(true);
  }

  function start(opponents) {
    navigate("/game", { state: { opponents } });
  }

  const displayName = screenname || trimEmail(userEmail) || "?";

  return (
    <div className="lobby">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <h1 className="lobby-title" style={{ margin: 0 }}>Yes Sir!</h1>
        <div ref={menuRef} style={{ display: "flex", alignItems: "center", gap: "0.5rem", position: "relative" }}>
          {displayName && (
            <span style={{ color: "#ccc", fontSize: "0.85rem" }}>{displayName}</span>
          )}
          <button
            onClick={() => setMenuOpen(o => !o)}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", borderRadius: "50%", width: 36, height: 36, overflow: "hidden", flexShrink: 0 }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", display: "block" }} />
            ) : (
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#0f3460", border: "2px solid rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "1rem", fontWeight: 700 }}>
                {displayName[0].toUpperCase()}
              </div>
            )}
          </button>
          {menuOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", minWidth: 150, boxShadow: "0 4px 20px rgba(0,0,0,0.5)", zIndex: 100, overflow: "hidden" }}>
              <button
                onClick={() => { setMenuOpen(false); navigate("/settings"); }}
                style={{ display: "block", width: "100%", padding: "0.65rem 1rem", background: "none", border: "none", color: "#e8d5b0", fontSize: "0.9rem", textAlign: "left", cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
                onMouseLeave={e => e.currentTarget.style.background = "none"}
              >
                Settings
              </button>
              <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />
              <button
                onClick={() => { setMenuOpen(false); handleSignOut(); }}
                style={{ display: "block", width: "100%", padding: "0.65rem 1rem", background: "none", border: "none", color: "#e94560", fontSize: "0.9rem", textAlign: "left", cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
                onMouseLeave={e => e.currentTarget.style.background = "none"}
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="lobby-subtitle">Choose 3 opponents or draw random</p>

      <div className="lobby-actions">
        <button className="btn primary" onClick={handleRandomDraw}>
          Random Draw
        </button>
        {selected.length === 3 && (
          <button className="btn primary" onClick={() => start(selected)}>
            Start Game
          </button>
        )}
      </div>

      {showRandom && randomPicks && (
        <div className="random-reveal">
          <h3>Your Opponents</h3>
          <div className="random-picks">
            {randomPicks.map((a) => (
              <AvatarCard key={a.id} avatar={a} picked />
            ))}
          </div>
          <button className="btn primary" onClick={() => start(randomPicks)}>
            Let's Play!
          </button>
        </div>
      )}

      <div className="avatar-grid">
        {AVATARS.map((avatar) => {
          const isSelected = !!selected.find((a) => a.id === avatar.id);
          const isFull = selected.length >= 3 && !isSelected;
          return (
            <AvatarCard
              key={avatar.id}
              avatar={avatar}
              selected={isSelected}
              disabled={isFull}
              onClick={() => !isFull && toggleSelect(avatar)}
            />
          );
        })}
      </div>
    </div>
  );
}
