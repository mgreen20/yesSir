import { useEffect, useRef, useState, useCallback } from 'react';
import { getIdToken } from '../auth.js';

export default function ChatBox({ roomId, roomType, currentUserEmail }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [connStatus, setConnStatus] = useState('connecting');
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const mountedRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const connect = useCallback(async () => {
    if (!mountedRef.current) return;
    setConnStatus('connecting');

    let idToken;
    try {
      idToken = await getIdToken();
    } catch {
      if (!mountedRef.current) return;
      setConnStatus('error');
      reconnectTimerRef.current = setTimeout(connect, 3000);
      return;
    }

    const wsUrl = `${import.meta.env.VITE_WS_API_URL}?token=${idToken}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return; }
      setConnStatus('connected');
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.type === 'CHAT_MESSAGE') {
        setMessages((prev) => [
          ...prev,
          { text: data.text, from: data.from, sentAt: data.sentAt },
        ]);
      }
    };

    ws.onerror = () => {
      if (!mountedRef.current) return;
      setConnStatus('error');
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnStatus('error');
      reconnectTimerRef.current = setTimeout(connect, 3000);
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const payloadKey = roomType === 'game' ? 'gameId' : 'lobbyId';
    wsRef.current.send(
      JSON.stringify({
        action: 'CHAT_MESSAGE',
        payload: { [payloadKey]: roomId, text },
      })
    );
    setInputText('');
  }, [inputText, roomId, roomType]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') handleSend();
    },
    [handleSend]
  );

  const senderLabel = (email) => email.split('@')[0];

  const isOwn = (from) => from === currentUserEmail;

  return (
    <div
      style={{
        background: 'rgba(0,0,0,0.35)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '12px',
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        height: '280px',
        overflow: 'hidden',
      }}
    >
      {/* Heading */}
      <div
        style={{
          padding: '0.5rem 0.875rem',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          fontWeight: 600,
          fontSize: '0.875rem',
          color: '#fff',
          flexShrink: 0,
        }}
      >
        Chat
      </div>

      {/* Connection status indicator */}
      {connStatus !== 'connected' && (
        <div
          style={{
            padding: '0.25rem 0.875rem',
            fontSize: '0.75rem',
            color: '#aaa',
            background: 'rgba(0,0,0,0.2)',
            flexShrink: 0,
          }}
        >
          {connStatus === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
        </div>
      )}

      {/* Messages area */}
      <div
        style={{
          flexGrow: 1,
          overflowY: 'auto',
          padding: '0.5rem 0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem',
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: isOwn(msg.from) ? 'flex-end' : 'flex-start',
            }}
          >
            {!isOwn(msg.from) && (
              <span
                style={{
                  fontSize: '0.7rem',
                  color: '#aaa',
                  marginBottom: '0.15rem',
                  paddingLeft: '0.25rem',
                }}
              >
                {senderLabel(msg.from)}
              </span>
            )}
            <div
              style={{
                background: isOwn(msg.from) ? '#e94560' : 'rgba(0,0,0,0.4)',
                color: '#fff',
                borderRadius: '10px',
                padding: '0.4rem 0.75rem',
                maxWidth: '80%',
                fontSize: '0.875rem',
                wordBreak: 'break-word',
              }}
            >
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input row */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Say something…"
          style={{
            background: '#0f3460',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            padding: '0.5rem 0.75rem',
            flex: 1,
            fontSize: '0.875rem',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          style={{
            background: '#e94560',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
