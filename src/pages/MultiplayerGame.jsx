import { useState, useEffect } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { getCurrentUser } from "../auth";
import { useGameSocket } from "../hooks/useGameSocket";
import GameHeader from "../components/GameHeader";
import ScoreTally from "../components/ScoreTally";
import ScoreCard from "../components/ScoreCard";
import OpponentHand from "../components/OpponentHand";
import TableTrump from "../components/TableTrump";
import TrickArea from "../components/TrickArea";
import PlayerHand from "../components/PlayerHand";
import TrumpChoices from "../components/TrumpChoices";
import BidChoices from "../components/BidChoices";
import RoundResultModal from "../components/RoundResultModal";
import GameOverModal from "../components/GameOverModal";

// Outer component: bounces back to lobby if gameId wasn't passed via navigation state.
export default function MultiplayerGame() {
  const location = useLocation();
  const gameId = location.state?.gameId;
  const players = location.state?.players;

  if (!gameId) {
    return <Navigate to="/" replace />;
  }

  return <MultiplayerGameView gameId={gameId} players={players} />;
}

function MultiplayerGameView({ gameId, players }) {
  const navigate = useNavigate();
  const [authUser, setAuthUser] = useState(null);

  useEffect(() => {
    getCurrentUser().then(u => setAuthUser(u));
  }, []);

  const userId = authUser?.sub;
  const username = authUser?.email;

  const { gameState, yourSeat, connected, error, sendAction } = useGameSocket({
    gameId,
    userId,   // undefined until auth resolves — hook waits before connecting
    username,
  });

  function handleQuit() {
    navigate("/");
  }

  // Loading / connecting state
  if (!gameState) {
    return (
      <div
        className="game"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <div style={{ textAlign: "center", color: "#e8d5b0" }}>
          {error ? (
            <>
              <p>Connection error: {error}</p>
              <button className="btn primary" onClick={handleQuit}>
                Back to Lobby
              </button>
            </>
          ) : (
            <p>Connecting to game…</p>
          )}
        </div>
      </div>
    );
  }

  const {
    phase,
    roundNumber,
    dealer,
    trumpSuit,
    bids,
    currentBidder,
    tricksTaken,
    currentTrick,
    currentPlayer,
    leadSuit,
    trickNumber,
    scores,
    roundScores,
    scoreHistory,
    bidHistory,
    message,
    myHand,
    opponentCardCounts,
    playableCards,
    playerNames: rawPlayerNames,
    playerEmojis,
    isAI,
  } = gameState;

  // Ensure your own seat always shows "You"
  const playerNames = rawPlayerNames.map((name, i) =>
    i === yourSeat ? "You" : name
  );

  // Seat layout relative to yourSeat:
  //   south = yourSeat, west = (yourSeat+1)%4, north = (yourSeat+2)%4, east = (yourSeat+3)%4
  const seatWest = (yourSeat + 1) % 4;
  const seatNorth = (yourSeat + 2) % 4;
  const seatEast = (yourSeat + 3) % 4;

  // Map absolute seat winner to display position string
  const seatToPosition = ["you", "west", "north", "east"];
  // Reorder so that yourSeat maps to "you", etc.
  function absoluteToDisplayPosition(absSeat) {
    const offset = (absSeat - yourSeat + 4) % 4;
    return seatToPosition[offset];
  }

  const winnerPosition =
    phase === "TRICK_RESULT"
      ? absoluteToDisplayPosition(currentPlayer)
      : null;

  // Playable card IDs (server provides subset)
  const playableIds = new Set((playableCards ?? []).map((c) => c.id));

  // Valid bids: 0-13 excluding dealer constraint
  function getValidBids() {
    const isDealer = dealer === yourSeat;
    const totalSoFar = bids.filter((b) => b !== null).reduce((s, b) => s + b, 0);
    const result = [];
    for (let i = 0; i <= 13; i++) {
      if (isDealer && totalSoFar + i === 13) continue;
      result.push(i);
    }
    return result;
  }

  // Action handlers — delegate everything to the server via sendAction
  function handleDeal() {
    sendAction("DEAL", {});
  }

  function handleChooseTrump(suit) {
    sendAction("CHOOSE_TRUMP", { trump: suit, chooser: yourSeat });
  }

  function handleBid(bid) {
    sendAction("BID", { bidder: yourSeat, bid });
  }

  function handlePlayCard(card) {
    if (!playableIds.has(card.id)) return;
    sendAction("PLAY_CARD", { player: yourSeat, card });
  }

  function handleAdvanceTrick() {
    sendAction("ADVANCE_TRICK", {});
  }

  // Auto-advance trick after 2 s so all players see all 4 cards before clearing
  useEffect(() => {
    if (phase !== "TRICK_RESULT") return;
    const timer = setTimeout(() => sendAction("ADVANCE_TRICK", {}), 2000);
    return () => clearTimeout(timer);
  }, [phase, trickNumber, sendAction]);

  // Tally headers (3-char abbreviations for opponents, "You" for human seat)
  const tallyHeaders = playerNames.map((n) => (n === "You" ? "You" : n.slice(0, 3)));

  const showCurrentRound =
    roundNumber > 0 &&
    phase !== "ROUND_RESULT" &&
    phase !== "GAME_OVER";

  const showTableTrump =
    phase !== "ROUND_RESULT" && phase !== "GAME_OVER";

  // Opponent card counts by display position (west/north/east)
  const westCount = opponentCardCounts?.[seatWest] ?? 0;
  const northCount = opponentCardCounts?.[seatNorth] ?? 0;
  const eastCount = opponentCardCounts?.[seatEast] ?? 0;

  // Reorder trick cards so TrickArea positions are relative to yourSeat
  const remappedTrick = (currentTrick ?? []).map((entry) => ({
    ...entry,
    player: (entry.player - yourSeat + 4) % 4,
  }));

  return (
    <div className="game">
      <GameHeader
        roundNumber={roundNumber}
        dealerName={playerNames[dealer]}
        trumpSuit={trumpSuit}
        trickNumber={trickNumber}
        onQuit={handleQuit}
      />

      <div className="message-bar">{message}</div>

      <div className="table-wrapper">
        <ScoreTally
          scoreHistory={scoreHistory ?? []}
          bidHistory={bidHistory ?? []}
          bids={bids}
          scores={scores}
          tallyHeaders={tallyHeaders}
          showCurrentRound={showCurrentRound}
        />

        <div className="seat-north">
          <ScoreCard
            name={playerNames[seatNorth]}
            emoji={playerEmojis?.[seatNorth] ?? ""}
            isDealer={dealer === seatNorth}
            isActive={currentPlayer === seatNorth}
            score={scores[seatNorth]}
            bid={bids[seatNorth]}
            tricksTaken={tricksTaken[seatNorth]}
          />
        </div>

        <div className="seat-west">
          <ScoreCard
            name={playerNames[seatWest]}
            emoji={playerEmojis?.[seatWest] ?? ""}
            isDealer={dealer === seatWest}
            isActive={currentPlayer === seatWest}
            score={scores[seatWest]}
            bid={bids[seatWest]}
            tricksTaken={tricksTaken[seatWest]}
          />
        </div>

        <div className="table">
          <OpponentHand position="north" count={northCount} />
          <OpponentHand position="west" count={westCount} />
          <OpponentHand position="east" count={eastCount} />

          {showTableTrump && <TableTrump trumpSuit={trumpSuit} />}

          <TrickArea currentTrick={remappedTrick} winnerPosition={winnerPosition} />

          {phase === "TRICK_RESULT" && (
            <div className="table-overlay" style={{ pointerEvents: "none" }}>
              <button
                className="btn primary"
                style={{ pointerEvents: "auto" }}
                onClick={handleAdvanceTrick}
              >
                Next Trick
              </button>
            </div>
          )}

          {phase === "ROUND_RESULT" && (
            <RoundResultModal
              playerNames={playerNames}
              bids={bids}
              tricksTaken={tricksTaken}
              roundScores={roundScores ?? [0, 0, 0, 0]}
              onContinue={handleDeal}
            />
          )}

          {phase === "GAME_OVER" && (
            <GameOverModal
              playerNames={playerNames}
              playerEmojis={playerEmojis ?? ["", "", "", ""]}
              scores={scores}
              onBackToLobby={handleQuit}
            />
          )}
        </div>

        <div className="seat-east">
          <ScoreCard
            name={playerNames[seatEast]}
            emoji={playerEmojis?.[seatEast] ?? ""}
            isDealer={dealer === seatEast}
            isActive={currentPlayer === seatEast}
            score={scores[seatEast]}
            bid={bids[seatEast]}
            tricksTaken={tricksTaken[seatEast]}
          />
        </div>

        <div className="seat-south">
          <ScoreCard
            name="You"
            emoji=""
            isDealer={dealer === yourSeat}
            isHuman
            isActive={currentPlayer === yourSeat}
            score={scores[yourSeat]}
            bid={bids[yourSeat]}
            tricksTaken={tricksTaken[yourSeat]}
          />
        </div>
      </div>

      <PlayerHand
        cards={myHand ?? []}
        playableIds={playableIds}
        onPlayCard={handlePlayCard}
        dimUnplayable={phase === "PLAYING" && currentPlayer === yourSeat}
      />

      {phase === "PRE_DEAL" && (
        <div className="actions">
          <button className="btn primary" onClick={handleDeal}>
            Deal Cards
          </button>
        </div>
      )}

      {phase === "CHOOSE_TRUMP" && currentBidder === yourSeat && (
        <TrumpChoices onChoose={handleChooseTrump} />
      )}

      {phase === "BIDDING" && currentBidder === yourSeat && (
        <BidChoices
          validBids={getValidBids()}
          isDealer={dealer === yourSeat}
          onBid={handleBid}
        />
      )}
    </div>
  );
}
