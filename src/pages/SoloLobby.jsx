import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AVATARS from "../avatars";
import AvatarCard from "../components/AvatarCard";

function pickRandomOpponents() {
  const shuffled = [...AVATARS].sort(() => Math.random() - 0.5);
  return [shuffled[0], shuffled[1], shuffled[2]];
}

export default function SoloLobby() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState([]);
  const [showRandom, setShowRandom] = useState(false);
  const [randomPicks, setRandomPicks] = useState(null);

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

  return (
    <div className="lobby">
      <h1 className="lobby-title">Yes Sir!</h1>
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
