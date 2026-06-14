import { useState, useRef, useEffect, useCallback } from 'react';
import { getIdToken } from '../auth.js';

const RECONNECT_DELAY_MS = 3000;

export function useGameSocket({ gameId, userId, username }) {
  const [gameState, setGameState] = useState(null);
  const [yourSeat, setYourSeat] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const mountedRef = useRef(true);
  const reconnectTimerRef = useRef(null);

  const connect = useCallback(async () => {
    if (!mountedRef.current) return;

    const idToken = await getIdToken();
    if (!mountedRef.current) return;

    const url = `${import.meta.env.VITE_WS_API_URL}?token=${idToken}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) {
        ws.close();
        return;
      }
      setConnected(true);
      ws.send(JSON.stringify({
        action: 'JOIN_GAME',
        payload: { gameId, userId, username },
      }));
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (msg.type === 'GAME_STATE') {
        setError(null);
        setGameState(msg.state);
        setYourSeat(msg.yourSeat);
      } else if (msg.type === 'GAME_ERROR') {
        setError(msg.message);
      }
    };

    ws.onerror = () => {
      if (!mountedRef.current) return;
      setConnected(false);
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      wsRef.current = null;
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          connect();
        }
      }, RECONNECT_DELAY_MS);
    };
  }, [gameId, userId, username]);

  useEffect(() => {
    if (!userId) return; // wait until auth resolves before connecting
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current !== null) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const sendAction = useCallback((type, extra = {}) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const playerNames = gameState?.playerNames;
    const payload = { gameId, type, ...extra };
    if (playerNames !== undefined) {
      payload.playerNames = playerNames;
    }
    ws.send(JSON.stringify({ action: 'GAME_ACTION', payload }));
  }, [gameId, gameState]);

  return {
    gameState,
    yourSeat,
    connected,
    error,
    sendAction,
  };
}
