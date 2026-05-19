import { useReducer, useEffect, useCallback, useRef, useMemo } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  createDeck,
  shuffleDeck,
  dealCards,
  getPlayableCards,
  aiChooseTrump,
  aiChooseBid,
  aiChooseCard,
  computeHitRates,
  weightsForSkill,
} from "../gameLogic";
import { playDealSound, playWinSound } from "../sounds";
import {
  PHASES,
  initialGameState,
  gameReducer,
  leftOfDealer,
} from "../gameReducer";
import GameHeader from "../components/GameHeader";
import ScoreTally from "../components/ScoreTally";
import ScoreCard from "../components/ScoreCard";
import OpponentHand from "../components/OpponentHand";
import TableTrump from "../components/TableTrump";
import TrickArea from "../components/TrickArea";
import RoundResultModal from "../components/RoundResultModal";
import GameOverModal from "../components/GameOverModal";
import PlayerHand from "../components/PlayerHand";
import TrumpChoices from "../components/TrumpChoices";
import BidChoices from "../components/BidChoices";

// Outer component: bounces back to lobby if opponents weren't passed via
// navigation state (e.g. user refreshed /game directly).
export default function Game() {
  const location = useLocation();
  const opponents = location.state?.opponents;
  if (!opponents || opponents.length !== 3) {
    return <Navigate to="/" replace />;
  }
  return <GameView opponents={opponents} />;
}

function GameView({ opponents }) {
  const navigate = useNavigate();
  const [game, dispatch] = useReducer(gameReducer, undefined, () => ({
    ...initialGameState(),
    dealer: Math.floor(Math.random() * 4),
  }));
  const timeoutRef = useRef(null);

  // Memo'd so they're referentially stable across renders — lets us include
  // them in effect deps without retriggering on every render.
  const playerNames = useMemo(
    () => ["You", opponents[0].name, opponents[1].name, opponents[2].name],
    [opponents],
  );
  const playerSkills = useMemo(
    () => [0, opponents[0].skill, opponents[1].skill, opponents[2].skill],
    [opponents],
  );
  const playerEmojis = useMemo(
    () => ["", opponents[0].emoji, opponents[1].emoji, opponents[2].emoji],
    [opponents],
  );

  function handleAbort() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    navigate("/");
  }

  const isHumanTurn = useCallback(() => {
    return (
      (game.phase === PHASES.CHOOSE_TRUMP && leftOfDealer(game.dealer) === 0) ||
      (game.phase === PHASES.BIDDING && game.currentBidder === 0) ||
      (game.phase === PHASES.PLAYING && game.currentPlayer === 0)
    );
  }, [game.phase, game.dealer, game.currentBidder, game.currentPlayer]);

  // AI actions: schedule and dispatch on a delay so the human can follow along.
  useEffect(() => {
    if (isHumanTurn()) return;

    if (game.phase === PHASES.CHOOSE_TRUMP) {
      const chooser = leftOfDealer(game.dealer);
      timeoutRef.current = setTimeout(() => {
        const trump = aiChooseTrump(game.hands[chooser], playerSkills[chooser], weightsForSkill(playerSkills[chooser]));
        dispatch({ type: "CHOOSE_TRUMP", trump, chooser, playerNames });
      }, 1000);
      return () => clearTimeout(timeoutRef.current);
    }

    if (game.phase === PHASES.BIDDING && game.currentBidder !== null && game.currentBidder !== 0) {
      timeoutRef.current = setTimeout(() => {
        const bidder = game.currentBidder;
        const existingBids = game.bids.filter((b) => b !== null);
        const isDealer = bidder === game.dealer;
        const bid = aiChooseBid(
          game.hands[bidder],
          game.trumpSuit,
          existingBids,
          isDealer,
          playerSkills[bidder],
          weightsForSkill(playerSkills[bidder]),
        );
        dispatch({ type: "BID", bidder, bid, playerNames });
      }, 800);
      return () => clearTimeout(timeoutRef.current);
    }

    if (game.phase === PHASES.PLAYING && game.currentPlayer !== 0 && game.currentTrick.length < 4) {
      timeoutRef.current = setTimeout(() => {
        const player = game.currentPlayer;
        const leadSuit = game.currentTrick.length === 0 ? null : game.leadSuit;
        const card = aiChooseCard(
          game.hands[player],
          game.currentTrick,
          game.trumpSuit,
          leadSuit,
          playerSkills[player],
          game.bids,
          game.tricksTaken,
          player,
          game.playedTricks,
          computeHitRates(game.bidHistory, game.tricksTakenHistory),
          6, // mcSamples — Master tier (skill >= 9) gets Monte Carlo lookahead
        );
        dispatch({ type: "PLAY_CARD", player, card, playerNames });
      }, 700);
      return () => clearTimeout(timeoutRef.current);
    }
  }, [game, isHumanTurn, playerNames, playerSkills]);

  // Auto-advance from TRICK_RESULT after a beat.
  useEffect(() => {
    if (game.phase !== PHASES.TRICK_RESULT) return;
    timeoutRef.current = setTimeout(() => {
      dispatch({ type: "ADVANCE_TRICK", playerNames });
    }, 1500);
    return () => clearTimeout(timeoutRef.current);
  }, [game.phase, playerNames]);

  // Win sound when human takes a round or the final game.
  useEffect(() => {
    if (game.phase !== PHASES.ROUND_RESULT && game.phase !== PHASES.GAME_OVER) return;
    const youWonRound = game.roundScores[0] > 0;
    const youWonGame =
      game.phase === PHASES.GAME_OVER && Math.max(...game.scores) === game.scores[0];
    if (!youWonRound && !youWonGame) return;
    const t = setTimeout(() => playWinSound(), 100);
    return () => clearTimeout(t);
  }, [game.phase, game.roundScores, game.scores]);

  function handleDeal() {
    for (let i = 0; i < 8; i++) {
      setTimeout(() => playDealSound(), i * 60);
    }
    const hands = dealCards(shuffleDeck(createDeck()));
    const newDealer = game.phase === PHASES.PRE_DEAL ? game.dealer : (game.dealer + 1) % 4;
    dispatch({ type: "DEAL", hands, newDealer, playerNames });
  }

  function handleChooseTrump(suit) {
    dispatch({ type: "CHOOSE_TRUMP", trump: suit, chooser: 0, playerNames });
  }

  function handleBid(bid) {
    dispatch({ type: "BID", bidder: 0, bid, playerNames });
  }

  function handlePlayCard(card) {
    const playable = getPlayableCards(
      game.hands[0],
      game.currentTrick.length === 0 ? null : game.leadSuit,
    );
    if (!playable.find((c) => c.id === card.id)) return;
    dispatch({ type: "PLAY_CARD", player: 0, card, playerNames });
  }

  function getValidBids() {
    const isDealer = game.dealer === 0;
    const totalSoFar = game.bids.filter((b) => b !== null).reduce((s, b) => s + b, 0);
    const bids = [];
    for (let i = 0; i <= 13; i++) {
      if (isDealer && totalSoFar + i === 13) continue;
      bids.push(i);
    }
    return bids;
  }

  const playableCards =
    game.phase === PHASES.PLAYING && game.currentPlayer === 0
      ? getPlayableCards(
          game.hands[0],
          game.currentTrick.length === 0 ? null : game.leadSuit,
        )
      : [];
  const playableIds = new Set(playableCards.map((c) => c.id));
  const tallyHeaders = playerNames.map((n) => (n === "You" ? "You" : n.slice(0, 3)));
  const showCurrentRound =
    game.roundNumber > 0 &&
    game.phase !== PHASES.ROUND_RESULT &&
    game.phase !== PHASES.GAME_OVER;
  const showTableTrump =
    game.phase !== PHASES.ROUND_RESULT && game.phase !== PHASES.GAME_OVER;
  const winnerPosition =
    game.phase === PHASES.TRICK_RESULT
      ? ["you", "west", "north", "east"][game.currentPlayer]
      : null;

  return (
    <div className="game">
      <GameHeader
        roundNumber={game.roundNumber}
        dealerName={playerNames[game.dealer]}
        trumpSuit={game.trumpSuit}
        trickNumber={game.trickNumber}
        onQuit={handleAbort}
      />

      <div className="message-bar">{game.message}</div>

      <div className="table-wrapper">
        <ScoreTally
          scoreHistory={game.scoreHistory}
          bidHistory={game.bidHistory}
          bids={game.bids}
          scores={game.scores}
          tallyHeaders={tallyHeaders}
          showCurrentRound={showCurrentRound}
        />

        <div className="seat-north">
          <ScoreCard
            name={playerNames[2]}
            emoji={playerEmojis[2]}
            isDealer={game.dealer === 2}
            isActive={game.currentPlayer === 2}
            score={game.scores[2]}
            bid={game.bids[2]}
            tricksTaken={game.tricksTaken[2]}
          />
        </div>

        <div className="seat-west">
          <ScoreCard
            name={playerNames[1]}
            emoji={playerEmojis[1]}
            isDealer={game.dealer === 1}
            isActive={game.currentPlayer === 1}
            score={game.scores[1]}
            bid={game.bids[1]}
            tricksTaken={game.tricksTaken[1]}
          />
        </div>

        <div className="table">
          <OpponentHand position="north" count={game.hands[2].length} />
          <OpponentHand position="west" count={game.hands[1].length} />
          <OpponentHand position="east" count={game.hands[3].length} />

          {showTableTrump && <TableTrump trumpSuit={game.trumpSuit} />}

          <TrickArea currentTrick={game.currentTrick} winnerPosition={winnerPosition} />

          {game.phase === PHASES.ROUND_RESULT && (
            <RoundResultModal
              playerNames={playerNames}
              bids={game.bids}
              tricksTaken={game.tricksTaken}
              roundScores={game.roundScores}
              onContinue={handleDeal}
            />
          )}

          {game.phase === PHASES.GAME_OVER && (
            <GameOverModal
              playerNames={playerNames}
              playerEmojis={playerEmojis}
              scores={game.scores}
              onBackToLobby={handleAbort}
            />
          )}
        </div>

        <div className="seat-east">
          <ScoreCard
            name={playerNames[3]}
            emoji={playerEmojis[3]}
            isDealer={game.dealer === 3}
            isActive={game.currentPlayer === 3}
            score={game.scores[3]}
            bid={game.bids[3]}
            tricksTaken={game.tricksTaken[3]}
          />
        </div>

        <div className="seat-south">
          <ScoreCard
            name="You"
            emoji=""
            isDealer={game.dealer === 0}
            isHuman
            isActive={game.currentPlayer === 0}
            score={game.scores[0]}
            bid={game.bids[0]}
            tricksTaken={game.tricksTaken[0]}
          />
        </div>
      </div>

      <PlayerHand
        cards={game.hands[0]}
        playableIds={playableIds}
        onPlayCard={handlePlayCard}
        dimUnplayable={game.phase === PHASES.PLAYING && game.currentPlayer === 0}
      />

      {game.phase === PHASES.PRE_DEAL && (
        <div className="actions">
          <button className="btn primary" onClick={handleDeal}>
            Deal Cards
          </button>
        </div>
      )}

      {game.phase === PHASES.CHOOSE_TRUMP && leftOfDealer(game.dealer) === 0 && (
        <TrumpChoices onChoose={handleChooseTrump} />
      )}

      {game.phase === PHASES.BIDDING && game.currentBidder === 0 && (
        <BidChoices
          validBids={getValidBids()}
          isDealer={game.dealer === 0}
          onBid={handleBid}
        />
      )}
    </div>
  );
}
