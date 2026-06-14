import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getIdToken, getCurrentUser, signOut } from "../auth";
import AVATARS from "../avatars";
import ChatBox from '../components/ChatBox';

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

// Build the 3-opponent array for a solo game from the lobby player list.
// Other humans appear as named AI; remaining empty seats get random AI avatars.
function buildOpponents(players, myEmail) {
  const others = (players || []).filter(p => p.username !== myEmail);
  const humanOpponents = others.map(p => ({
    id: `human-${p.userId}`,
    name: trimEmail(p.username),
    skill: 5,
    emoji: "👤",
  }));
  const emptySlots = 3 - humanOpponents.length;
  const shuffled = [...AVATARS].sort(() => Math.random() - 0.5);
  return [...humanOpponents, ...shuffled.slice(0, emptySlots)];
}

export default function Lobby() {
  const navigate = useNavigate();
  const [view, setView] = useState("list");
  const [lobbies, setLobbies] = useState([]);
  const [currentLobby, setCurrentLobby] = useState(null);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const suppressRejoinRef = useRef(false);
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

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  // List view polling — also auto-rejoins if the user is already in an open lobby
  useEffect(() => {
    if (view !== "list") return;

    async function fetchLobbies() {
      try {
        const data = await apiFetch("/lobbies");
        const all = data.lobbies || [];
        setLobbies(all);

        // Re-enter waiting room if user is already in a lobby (e.g. after page reload)
        // Suppressed when user explicitly clicked Leave
        if (userEmail && !suppressRejoinRef.current) {
          const rejoining = all.find(l =>
            l.players?.some(p => p.username === userEmail)
          );
          if (rejoining) {
            setCurrentLobby(rejoining);
            setView("waiting");
          }
        }
      } catch (e) {
        // silently ignore polling errors
      }
    }

    fetchLobbies();
    intervalRef.current = setInterval(fetchLobbies, 3000);
    return () => clearInterval(intervalRef.current);
  }, [view, userEmail]);

  // Waiting view polling
  useEffect(() => {
    if (view !== "waiting" || !currentLobby) return;

    async function pollLobby() {
      try {
        const data = await apiFetch(`/lobbies/${currentLobby.lobbyId}`);
        const lobby = data.lobby;
        setCurrentLobby(lobby);
        if (lobby.status === "STARTING" && lobby.gameId) {
          clearInterval(intervalRef.current);
          // Always go to multiplayer game — server handles AI seats
          navigate("/multiplayer-game", {
            state: { gameId: lobby.gameId, players: lobby.players },
          });
        }
      } catch (e) {
        // silently ignore polling errors
      }
    }

    intervalRef.current = setInterval(pollLobby, 2000);
    return () => clearInterval(intervalRef.current);
  }, [view, currentLobby?.lobbyId]);

  async function handleCreate() {
    setError(null);
    try {
      const data = await apiFetch("/lobbies", { method: "POST" });
      setCurrentLobby(data.lobby);
      setView("waiting");
    } catch (e) {
      setError("Failed to create game. Please try again.");
    }
  }

  async function handleJoin(lobbyId) {
    setError(null);
    try {
      const data = await apiFetch(`/lobbies/${lobbyId}/join`, { method: "POST" });
      if (data.gameId) {
        navigate("/multiplayer-game", {
          state: { gameId: data.gameId, players: data.lobby?.players },
        });
      } else {
        setCurrentLobby(data.lobby);
        setView("waiting");
      }
    } catch (e) {
      if (e.message === "409") {
        // Already in this lobby — just re-enter the waiting room
        const existing = lobbies.find(l => l.lobbyId === lobbyId);
        if (existing) { setCurrentLobby(existing); setView("waiting"); return; }
      }
      setError("Failed to join game. Please try again.");
    }
  }

  async function handleLeave() {
    clearInterval(intervalRef.current);
    suppressRejoinRef.current = true;
    if (currentLobby) {
      try { await apiFetch(`/lobbies/${currentLobby.lobbyId}/leave`, { method: "POST" }); }
      catch (e) { /* still leave locally even if API fails */ }
    }
    setCurrentLobby(null);
    setView("list");
    // Re-enable auto-rejoin after 5 s so a fresh page load still works
    setTimeout(() => { suppressRejoinRef.current = false; }, 5000);
  }

  async function handleStartWithAI() {
    const humanPlayers = (currentLobby.players || []).map((p, i) => ({
      seat: i,
      userId: p.userId,
      username: p.username,
      name: trimEmail(p.username),
      isAI: false,
      emoji: "",
      skill: 0,
    }));

    const shuffled = [...AVATARS].sort(() => Math.random() - 0.5);
    const aiPlayers = shuffled.slice(0, 4 - humanPlayers.length).map((avatar, i) => ({
      seat: humanPlayers.length + i,
      userId: `ai-${avatar.id}`,
      username: "ai",
      name: avatar.name,
      isAI: true,
      emoji: avatar.emoji,
      skill: avatar.skill,
    }));

    const allPlayers = [...humanPlayers, ...aiPlayers];

    try {
      const data = await apiFetch(`/lobbies/${currentLobby.lobbyId}/start`, {
        method: "POST",
        body: JSON.stringify({ players: allPlayers }),
      });
      navigate("/multiplayer-game", { state: { gameId: data.gameId, players: allPlayers } });
    } catch (e) {
      setError("Failed to start game. Please try again.");
    }
  }

  async function handleSignOut() {
    await signOut();
  }

  const openLobbies = lobbies.filter((l) => l.status === "OPEN");

  if (view === "waiting" && currentLobby) {
    const players = currentLobby.players || [];
    const slots = [0, 1, 2, 3];
    const isHost = players[0]?.username === userEmail;
    const canFillWithAI = isHost && players.length < 4;

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          fontFamily: "sans-serif",
          color: "#fff",
        }}
      >
        <h1 style={{ color: "#ffd700", fontSize: "2.5rem", margin: "0 0 0.25rem" }}>
          Yes Sir!
        </h1>
        <p style={{ color: "#ccc", margin: "0 0 2rem", fontSize: "1.1rem" }}>
          Waiting for players…
        </p>

        <div
          style={{
            background: "rgba(0,0,0,0.35)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: "12px",
            padding: "1.25rem",
            width: "100%",
            maxWidth: "420px",
          }}
        >
          <div style={{ marginBottom: "1.5rem" }}>
            {slots.map((i) => {
              const player = players[i];
              const isHost = i === 0;
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "0.75rem 0",
                    borderBottom:
                      i < 3 ? "1px solid rgba(255,255,255,0.08)" : "none",
                  }}
                >
                  {player ? (
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        background: "#ffd700",
                        color: "#1a472a",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: "bold",
                        fontSize: "1.1rem",
                        flexShrink: 0,
                      }}
                    >
                      {player.username ? player.username[0].toUpperCase() : "?"}
                    </div>
                  ) : (
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.1)",
                        color: "#888",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: "bold",
                        fontSize: "0.9rem",
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    {player ? (
                      <span style={{ color: "#fff" }}>
                        {trimEmail(player.username)}
                      </span>
                    ) : (
                      <span style={{ color: "#888", fontStyle: "italic" }}>
                        Waiting…
                      </span>
                    )}
                  </div>
                  {isHost && player && (
                    <span
                      style={{
                        background: "#ffd700",
                        color: "#1a472a",
                        fontSize: "0.65rem",
                        fontWeight: "bold",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        letterSpacing: "0.05em",
                      }}
                    >
                      HOST
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <p style={{ textAlign: "center", color: "#aaa", margin: "0 0 1.5rem" }}>
            {players.length}/4 players joined
          </p>

          {canFillWithAI && (
            <button
              onClick={handleStartWithAI}
              style={{
                width: "100%",
                padding: "0.75rem",
                background: "#ffd700",
                color: "#1a472a",
                border: "none",
                borderRadius: "8px",
                fontSize: "1rem",
                fontWeight: "bold",
                cursor: "pointer",
                marginBottom: "0.75rem",
              }}
            >
              Fill empty seats with AI & Start
            </button>
          )}

          <div style={{ marginTop: '1.5rem' }}>
            <ChatBox
              roomId={currentLobby.lobbyId}
              roomType="lobby"
              currentUserEmail={userEmail}
            />
          </div>

          <button
            onClick={handleLeave}
            style={{
              width: "100%",
              padding: "0.75rem",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.3)",
              color: "#ccc",
              borderRadius: "8px",
              fontSize: "1rem",
              cursor: "pointer",
            }}
          >
            Leave
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "2rem",
        fontFamily: "sans-serif",
        color: "#fff",
      }}
    >
      {/* Header */}
      <div
        style={{
          width: "100%",
          maxWidth: "600px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "2rem",
        }}
      >
        <h1 style={{ color: "#ffd700", fontSize: "2.5rem", margin: 0 }}>
          Yes Sir!
        </h1>
        <div ref={menuRef} style={{ display: "flex", alignItems: "center", gap: "0.5rem", position: "relative" }}>
          {(screenname || userEmail) && (
            <span style={{ color: "#ccc", fontSize: "0.85rem" }}>
              {screenname || trimEmail(userEmail)}
            </span>
          )}
          <button
            onClick={() => setMenuOpen(o => !o)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              borderRadius: "50%",
              width: 36,
              height: 36,
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", display: "block" }} />
            ) : (
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#0f3460", border: "2px solid rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "1rem", fontWeight: 700 }}>
                {(screenname || trimEmail(userEmail) || "?")[0].toUpperCase()}
              </div>
            )}
          </button>
          {menuOpen && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              background: "#1a1a2e",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "8px",
              minWidth: 150,
              boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
              zIndex: 100,
              overflow: "hidden",
            }}>
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

      <div style={{ width: "100%", maxWidth: "600px" }}>
        {/* Create Game */}
        <button
          onClick={handleCreate}
          style={{
            width: "100%",
            padding: "1rem",
            background: "#ffd700",
            color: "#1a472a",
            border: "none",
            borderRadius: "10px",
            fontSize: "1.2rem",
            fontWeight: "bold",
            cursor: "pointer",
            marginBottom: "2rem",
          }}
        >
          ＋ Create Game
        </button>

        {error && (
          <p
            style={{
              color: "#e94560",
              textAlign: "center",
              marginBottom: "1rem",
            }}
          >
            {error}
          </p>
        )}

        {/* Open Games */}
        <div
          style={{
            background: "rgba(0,0,0,0.35)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: "12px",
            padding: "1.5rem",
            marginBottom: "1.5rem",
            overflowX: "auto",
          }}
        >
          <h2
            style={{
              margin: "0 0 1rem",
              fontSize: "1.1rem",
              color: "#ddd",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Open Games
          </h2>

          {openLobbies.length === 0 ? (
            <p style={{ color: "#888", fontStyle: "italic", margin: 0 }}>
              No open games yet — create one!
            </p>
          ) : (
            <div>
              {openLobbies.map((lobby) => (
                <div
                  key={lobby.lobbyId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.75rem 0",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div>
                    <span style={{ color: "#fff", fontWeight: "500" }}>
                      {trimEmail(lobby.hostName)}
                    </span>
                    <span style={{ color: "#888", marginLeft: "0.75rem", fontSize: "0.9rem" }}>
                      {lobby.players?.length ?? 0}/4 players
                    </span>
                  </div>
                  {lobby.players?.some(p => p.username === userEmail) ? (
                    <button
                      onClick={() => { setCurrentLobby(lobby); setView("waiting"); }}
                      style={{ background: "rgba(255,215,0,0.2)", color: "#ffd700", border: "1px solid #ffd700", borderRadius: "6px", padding: "0.4rem 1rem", fontSize: "0.9rem", fontWeight: "bold", cursor: "pointer" }}
                    >
                      Rejoin
                    </button>
                  ) : (
                    <button
                      onClick={() => handleJoin(lobby.lobbyId)}
                      style={{ background: "#e94560", color: "#fff", border: "none", borderRadius: "6px", padding: "0.4rem 1rem", fontSize: "0.9rem", fontWeight: "bold", cursor: "pointer" }}
                    >
                      Join
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Solo vs AI */}
        <button
          onClick={() => navigate("/solo")}
          style={{
            width: "100%",
            padding: "0.85rem",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.3)",
            color: "#ccc",
            borderRadius: "10px",
            fontSize: "1rem",
            cursor: "pointer",
          }}
        >
          Play Solo vs AI
        </button>
      </div>
    </div>
  );
}
