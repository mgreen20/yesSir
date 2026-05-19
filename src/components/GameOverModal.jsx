export default function GameOverModal({ playerNames, playerEmojis, scores, onBackToLobby }) {
  const maxScore = Math.max(...scores);
  const winnerIdx = scores.indexOf(maxScore);
  const winnerName = playerNames[winnerIdx];
  const youWon = winnerIdx === 0;
  const standings = playerNames
    .map((name, i) => ({ name, score: scores[i], emoji: playerEmojis[i], idx: i }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="table-overlay">
      <div className="game-over-panel">
        <h2>{youWon ? "You Win!" : `${winnerName} Wins!`}</h2>
        <div className="final-standings">
          {standings.map((p, rank) => (
            <div key={p.idx} className={`standing ${rank === 0 ? "first" : ""}`}>
              <span className="standing-rank">{rank + 1}.</span>
              <span className="standing-name">{p.emoji} {p.name}</span>
              <span className="standing-score">{p.score} pts</span>
            </div>
          ))}
        </div>
        <button className="btn primary" onClick={onBackToLobby}>
          Back to Lobby
        </button>
      </div>
    </div>
  );
}
