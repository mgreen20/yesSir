import CardFace from "./Card";

export default function PlayerHand({ cards, playableIds, onPlayCard, dimUnplayable }) {
  return (
    <div className="player-hand">
      {cards.map((card) => {
        const canPlay = playableIds.has(card.id);
        const dimmed = dimUnplayable && !canPlay;
        return (
          <div
            key={card.id}
            className={`hand-card ${canPlay ? "playable" : ""} ${dimmed ? "dimmed" : ""}`}
            onClick={() => canPlay && onPlayCard(card)}
          >
            <CardFace rank={card.rank} suit={card.suit} />
          </div>
        );
      })}
    </div>
  );
}
