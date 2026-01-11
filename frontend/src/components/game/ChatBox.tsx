import cn from "classnames";
import { ChatMessage, GameAction } from "common-modules";
import React, { useEffect, useRef, useState } from "react";
import Button from "react-bootstrap/esm/Button";
import Form from "react-bootstrap/esm/Form";
import FormControl from "react-bootstrap/esm/FormControl";
import InputGroup from "react-bootstrap/esm/InputGroup";
import { useDispatch, useSelector } from "react-redux";
import { GameSelector } from "../../store";
import TF, { TName } from "../common/TextFormat";
import s from "./ChatBox.module.scss";

export default function ChatBox() {
  const dispatch = useDispatch();
  const playerIndex = useSelector(GameSelector.playerIndex);
  const messages = useSelector(GameSelector.chatMessages);
  const speakingTurn = useSelector(GameSelector.speakingTurn);
  const isMyTurn = useSelector(GameSelector.isMyTurn);
  const names = useSelector(GameSelector.names);
  const [typingMessage, setTypingMessage] = useState("");
  const [hasFocus, setHasFocus] = useState(false);
  const chatDivRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const autoSendTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoSendIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const typingMessageRef = useRef<string>(""); // Store current message for timeout callback
  const previousSpeakerRef = useRef<number | null>(null); // Track previous speaker to detect turn changes
  const hasAutoSentRef = useRef<boolean>(false); // Track if we've already auto-sent for this turn
  const timeRemainingRef = useRef<number>(0); // Store current timeRemaining to avoid stale closures
  const isMyTurnRef = useRef<boolean>(false); // Store current isMyTurn to avoid stale closures

  const handleTypeCharacter = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value.length > 200) return;
    const value = e.target.value;
    setTypingMessage(value);
    typingMessageRef.current = value; // Keep ref in sync
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (typingMessage.trim() !== "" && isMyTurn) {
      dispatch(
        GameAction.newPlayerChatMessage({
          player: playerIndex,
          message: typingMessage.trim(),
        })
      );
      // Scroll to the bottom on message
      const div = chatDivRef.current!;
      div.scrollTo(0, div.scrollHeight);
      setTypingMessage("");
      typingMessageRef.current = "";
      
      // Clear auto-send timeout/interval
      if (autoSendTimeoutRef.current) {
        clearTimeout(autoSendTimeoutRef.current);
        autoSendTimeoutRef.current = null;
      }
      if (autoSendIntervalRef.current) {
        clearInterval(autoSendIntervalRef.current);
        autoSendIntervalRef.current = null;
      }
      hasAutoSentRef.current = false;
    }
  };

  const handlePass = () => {
    if (isMyTurn) {
      dispatch(GameAction.passSpeakingTurn());
      setTypingMessage("");
      typingMessageRef.current = "";
      
      // Clear auto-send timeout/interval
      if (autoSendTimeoutRef.current) {
        clearTimeout(autoSendTimeoutRef.current);
        autoSendTimeoutRef.current = null;
      }
      if (autoSendIntervalRef.current) {
        clearInterval(autoSendIntervalRef.current);
        autoSendIntervalRef.current = null;
      }
      hasAutoSentRef.current = false;
    }
  };

  // Update refs to avoid stale closures
  useEffect(() => {
    timeRemainingRef.current = speakingTurn?.timeRemaining ?? 0;
    isMyTurnRef.current = isMyTurn;
  }, [speakingTurn?.timeRemaining, isMyTurn]);

  // Reset auto-sent flag when turn changes to us
  useEffect(() => {
    if (speakingTurn && isMyTurn) {
      hasAutoSentRef.current = false;
    }
  }, [speakingTurn, isMyTurn]);

  // Detect when turn changes away from us - auto-send any pending message
  useEffect(() => {
    const currentSpeaker = speakingTurn?.currentSpeaker ?? null;
    
    // If we were the previous speaker but are no longer the current speaker, auto-send
    if (previousSpeakerRef.current === playerIndex && currentSpeaker !== playerIndex && currentSpeaker !== null) {
      const messageToSend = typingMessageRef.current.trim();
      if (messageToSend !== "" && !hasAutoSentRef.current) {
        // We lost our turn but had text - auto-send it
        hasAutoSentRef.current = true;
        dispatch(
          GameAction.autoSendChatMessage({
            player: playerIndex,
            message: messageToSend,
          })
        );
        setTypingMessage("");
        typingMessageRef.current = "";
      }
      
      // Clear any pending intervals/timeouts
      if (autoSendIntervalRef.current) {
        clearInterval(autoSendIntervalRef.current);
        autoSendIntervalRef.current = null;
      }
      if (autoSendTimeoutRef.current) {
        clearTimeout(autoSendTimeoutRef.current);
        autoSendTimeoutRef.current = null;
      }
    }
    
    // Update previous speaker
    previousSpeakerRef.current = currentSpeaker;
  }, [speakingTurn?.currentSpeaker, playerIndex, dispatch]);

  // Use interval to check timeRemaining every second and auto-send when needed
  useEffect(() => {
    // Clear any existing interval
    if (autoSendIntervalRef.current) {
      clearInterval(autoSendIntervalRef.current);
      autoSendIntervalRef.current = null;
    }

    if (speakingTurn && isMyTurn && !hasAutoSentRef.current) {
      // Store current playerIndex to avoid stale closure
      const currentPlayerIndex = playerIndex;
      
      // Set up interval to check every 500ms
      autoSendIntervalRef.current = setInterval(() => {
        // Use refs to get current values (updated by the effect above)
        const currentTimeRemaining = timeRemainingRef.current;
        const currentIsMyTurn = isMyTurnRef.current;
        const currentMessage = typingMessageRef.current.trim();
        
        // Only proceed if it's still our turn
        if (!currentIsMyTurn || hasAutoSentRef.current) {
          if (autoSendIntervalRef.current) {
            clearInterval(autoSendIntervalRef.current);
            autoSendIntervalRef.current = null;
          }
          return;
        }
        
        // Auto-send when 2 seconds or less remain (gives us buffer)
        if (currentTimeRemaining <= 2 && currentMessage !== "") {
          hasAutoSentRef.current = true;
          dispatch(
            GameAction.autoSendChatMessage({
              player: currentPlayerIndex,
              message: currentMessage,
            })
          );
          setTypingMessage("");
          typingMessageRef.current = "";
          
          // Clear interval
          if (autoSendIntervalRef.current) {
            clearInterval(autoSendIntervalRef.current);
            autoSendIntervalRef.current = null;
          }
        } else if (currentTimeRemaining === 0) {
          // Time expired
          hasAutoSentRef.current = true;
          if (currentMessage === "") {
            dispatch(GameAction.passSpeakingTurn());
          } else {
            // Still try to send even at 0
            dispatch(
              GameAction.autoSendChatMessage({
                player: currentPlayerIndex,
                message: currentMessage,
              })
            );
            setTypingMessage("");
            typingMessageRef.current = "";
          }
          
          // Clear interval
          if (autoSendIntervalRef.current) {
            clearInterval(autoSendIntervalRef.current);
            autoSendIntervalRef.current = null;
          }
        }
      }, 500); // Check every 500ms
    }

    return () => {
      if (autoSendIntervalRef.current) {
        clearInterval(autoSendIntervalRef.current);
        autoSendIntervalRef.current = null;
      }
    };
  }, [speakingTurn, isMyTurn, playerIndex, dispatch]);

  useEffect(() => {
    // Stick to bottom
    const div = chatDivRef.current!;
    if (div.scrollHeight - div.scrollTop - div.clientHeight < 100) {
      div.scrollTo(0, div.scrollHeight);
    }
  }, [messages]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore keyboard shortcuts
      if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === "t" && document.activeElement !== chatInputRef.current && isMyTurn) {
        chatInputRef.current?.focus();
        e.preventDefault();
      }
      if (e.key === "Escape") {
        chatInputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isMyTurn]);

  const currentSpeakerName = speakingTurn 
    ? names[speakingTurn.currentSpeaker] 
    : null;
  const timeRemaining = speakingTurn?.timeRemaining ?? 0;

  return (
    <div className={s.ChatBox}>
      {/* Turn indicator */}
      {speakingTurn && (
        <div className={s.turnIndicator}>
          <span className={s.turnLabel}>
            {isMyTurn ? (
              <span className={s.yourTurn}>Your turn</span>
            ) : (
              <span>
                <TName idx={speakingTurn.currentSpeaker} /> is speaking
              </span>
            )}
          </span>
          <span className={s.timer}>
            {timeRemaining}s
          </span>
        </div>
      )}
      
      <div className={s.chatWrapper} ref={chatDivRef}>
        <div className={s.chat}>
          <ChatMessageList messages={messages} speakingTurn={speakingTurn} />
        </div>
      </div>
      
      <Form className={s.form} onSubmit={handleSendMessage}>
        <InputGroup>
          <FormControl
            ref={chatInputRef}
            className={cn(s.input, { [s.disabled]: !isMyTurn })}
            value={typingMessage}
            onChange={handleTypeCharacter}
            onFocus={() => setHasFocus(true)}
            onBlur={() => setHasFocus(false)}
            disabled={!isMyTurn}
            placeholder={
              isMyTurn
                ? hasFocus
                  ? "Send a message"
                  : "Press T to chat"
                : speakingTurn
                ? `${currentSpeakerName} is speaking...`
                : "Waiting for turn..."
            }
          />
          {isMyTurn && (
            <>
              <Button
                variant="outline-secondary"
                onClick={handlePass}
                className={s.passButton}
              >
                Pass
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={typingMessage.trim() === ""}
                className={s.sendButton}
              >
                Send
              </Button>
            </>
          )}
        </InputGroup>
      </Form>
    </div>
  );
}

type ChatMessageListProps = {
  messages: ChatMessage[];
  speakingTurn: { currentSpeaker: number; timeRemaining: number; turnOrder: number[]; turnIndex: number } | null;
};

const ChatMessageList = React.memo(function ({
  messages,
  speakingTurn,
}: ChatMessageListProps) {
  return (
    <>
      {messages.map((msg, i) =>
        msg.type === "player" ? (
          <UserChatMessage 
            key={i} 
            player={msg.player} 
            text={msg.content}
            isCurrentSpeaker={speakingTurn?.currentSpeaker === msg.player}
          />
        ) : (
          <SystemChatMessage key={i} text={msg.content} />
        )
      )}
    </>
  );
});

type UserChatMessageProps = {
  text: string;
  player: number;
  isCurrentSpeaker?: boolean;
};

function UserChatMessage({ player, text, isCurrentSpeaker }: UserChatMessageProps) {
  return (
    <p className={cn(s.chatMessage, s.user, { [s.currentSpeaker]: isCurrentSpeaker })}>
      [<TName idx={player} />] {text}
    </p>
  );
}

type SystemChatMessageProps = {
  text: string;
};

function SystemChatMessage({ text }: SystemChatMessageProps) {
  console.log(text);
  return (
    <p className={cn(s.chatMessage, s.system)}>
      <TF>{text}</TF>
    </p>
  );
}
