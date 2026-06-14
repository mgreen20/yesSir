import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { getCurrentUser } from "./auth";
import Lobby from "./pages/Lobby";
import SoloLobby from "./pages/SoloLobby";
import Game from "./pages/Game";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import ConfirmEmail from "./pages/ConfirmEmail";
import AccountSettings from "./pages/AccountSettings";
import PlayerStats from "./pages/PlayerStats";
import MultiplayerGame from "./pages/MultiplayerGame";
import "./App.css";

function RequireAuth({ children }) {
  const [status, setStatus] = useState("loading");
  const location = useLocation();

  useEffect(() => {
    getCurrentUser().then(user => setStatus(user ? "ok" : "unauth"));
  }, []);

  if (status === "loading") return null;
  if (status === "unauth") return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"   element={<Login />} />
        <Route path="/signup"  element={<SignUp />} />
        <Route path="/confirm" element={<ConfirmEmail />} />
        <Route path="/" element={
          <RequireAuth><Lobby /></RequireAuth>
        } />
        <Route path="/solo" element={
          <RequireAuth><SoloLobby /></RequireAuth>
        } />
        <Route path="/settings" element={
          <RequireAuth><AccountSettings /></RequireAuth>
        } />
        <Route path="/stats" element={
          <RequireAuth><PlayerStats /></RequireAuth>
        } />
        <Route path="/game" element={
          <RequireAuth><Game /></RequireAuth>
        } />
        <Route path="/multiplayer-game" element={
          <RequireAuth><MultiplayerGame /></RequireAuth>
        } />
      </Routes>
    </BrowserRouter>
  );
}
