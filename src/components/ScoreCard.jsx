export default function ScoreCard({ name, emoji, isDealer, isHuman, isActive, score, bid, tricksTaken }) {
  const className = [
    "score-card",
    isHuman && "human",
    isActive && "active",
  ].filter(Boolean).join(" ");

  return (
    <div className={className}>
      {isDealer && <div className="dealer-token" aria-label="Dealer">D</div>}
      <div className="player-name">
        {emoji ? `${emoji} ` : ""}{name}
      </div>
      <div className="score-total">{score} pts</div>
      {bid !== null && (
        <div className="bid-info">
          Bid: {bid} | Won: {tricksTaken}
        </div>
      )}
    </div>
  );
}
