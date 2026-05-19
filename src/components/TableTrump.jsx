import { NO_TRUMP } from "../gameLogic";

export default function TableTrump({ trumpSuit }) {
  if (!trumpSuit) return null;
  const isRed = trumpSuit === "♥" || trumpSuit === "♦";
  const isNT = trumpSuit === NO_TRUMP;
  return (
    <div className={`table-trump ${isRed ? "red" : "black"} ${isNT ? "nt" : ""}`}>
      {isNT ? "NT" : trumpSuit}
    </div>
  );
}
