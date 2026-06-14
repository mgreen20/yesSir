import { useNavigate, NavLink } from "react-router-dom";
import { signOut } from "../auth.js";

export default function NavBar({ userEmail }) {
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  const username = userEmail ? userEmail.split("@")[0] : null;

  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "rgba(20, 60, 30, 0.95)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
        padding: "0.6rem 1.5rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <NavLink
        to="/"
        style={{
          color: "#ffd700",
          textDecoration: "none",
          fontFamily: "Georgia, serif",
          fontWeight: "bold",
          fontSize: "1.1rem",
        }}
      >
        Yes Sir!
      </NavLink>

      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
        <NavLink
          to="/"
          end
          style={({ isActive }) => ({
            color: isActive ? "#ffd700" : "#ccc",
            textDecoration: "none",
            fontSize: "0.9rem",
            padding: "0.25rem 0.75rem",
          })}
        >
          Lobby
        </NavLink>
        <NavLink
          to="/stats"
          style={({ isActive }) => ({
            color: isActive ? "#ffd700" : "#ccc",
            textDecoration: "none",
            fontSize: "0.9rem",
            padding: "0.25rem 0.75rem",
          })}
        >
          Stats
        </NavLink>
        <NavLink
          to="/settings"
          style={({ isActive }) => ({
            color: isActive ? "#ffd700" : "#ccc",
            textDecoration: "none",
            fontSize: "0.9rem",
            padding: "0.25rem 0.75rem",
          })}
        >
          Settings
        </NavLink>

        {username && (
          <span
            style={{
              color: "#aaa",
              fontSize: "0.85rem",
              padding: "0.25rem 0.75rem",
            }}
          >
            {username}
          </span>
        )}

        <button
          onClick={handleSignOut}
          style={{
            background: "rgba(255,255,255,0.08)",
            color: "#ccc",
            border: "1px solid rgba(255,255,255,0.15)",
            padding: "0.3rem 0.85rem",
            borderRadius: "5px",
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
