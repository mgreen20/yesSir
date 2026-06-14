export default function ScoreCard({ name, emoji, avatarUrl, isDealer, isHuman, isActive, score, bid, tricksTaken }) {
  const className = [
    "score-card",
    isHuman && "human",
    isActive && "active",
  ].filter(Boolean).join(" ");

  return (
    <div className={className}>
      {isDealer && <div className="dealer-token" aria-label="Dealer">D</div>}
      <div className="player-name" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="" style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
        ) : emoji ? (
          <span>{emoji}</span>
        ) : null}
        {name}
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
