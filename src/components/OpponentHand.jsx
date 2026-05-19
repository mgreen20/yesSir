import CardBack from "./CardBack";

export default function OpponentHand({ position, count }) {
  const vertical = position === "east" || position === "west";
  return (
    <div className={`opponent ${position}`}>
      <div className={`opponent-cards ${vertical ? "vertical" : ""}`}>
        {Array.from({ length: count }).map((_, i) => (
          <CardBack key={i} small={vertical} />
        ))}
      </div>
    </div>
  );
}
