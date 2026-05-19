export default function CardFace({ rank, suit }) {
  const isRed = suit === "♥" || suit === "♦";
  return (
    <div className={`card-face ${isRed ? "red" : "black"}`}>
      <span className="card-rank">{rank}</span>
      <span className="card-suit">{suit}</span>
    </div>
  );
}
