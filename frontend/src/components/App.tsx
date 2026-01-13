import { useEffect } from "react";
import { useSelector } from "react-redux";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { GameSelector, LobbySelector } from "../store";
import AboutView from "./about/AboutView";
import GameView from "./game/GameView";
import HowToPlayView from "./how-to-play/HowToPlayView";
import LobbyView from "./lobby/LobbyView";
import QueueView from "./lobby/QueueView";
import WelcomeView from "./welcome/WelcomeView";
import AdminView from "./admin/AdminView";

export default function App() {
  const lobbyID = useSelector(LobbySelector.lobbyID);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const currentID = searchParams.get("join") ?? "";
    if (lobbyID !== currentID) {
      if (lobbyID) {
        searchParams.set("join", lobbyID);
      } else {
        searchParams.delete("join");
      }
      navigate({
        search: "?" + searchParams.toString(),
      });
    }
  }, [lobbyID, navigate, location]);

  return (
    <Routes>
      <Route path="/" element={<MainView />} />
      <Route path="/about" element={<AboutView />} />
      <Route path="/how-to-play" element={<HowToPlayView />} />
      <Route path="/admin" element={<AdminView />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

function MainView() {
  const lobbyID = useSelector(LobbySelector.lobbyID);
  const inQueue = useSelector(LobbySelector.inQueue);
  const youInGame = useSelector(GameSelector.youInGame);
  
  let view = "welcome";
  if (youInGame) {
    view = "game";
  } else if (lobbyID !== "") {
    view = "lobby";
  } else if (inQueue) {
    view = "queue";
  }

  return view === "game" ? (
    <GameView />
  ) : view === "lobby" ? (
    <LobbyView />
  ) : view === "queue" ? (
    <QueueView />
  ) : (
    <WelcomeView />
  );
}
