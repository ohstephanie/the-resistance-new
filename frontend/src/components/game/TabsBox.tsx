import { useState } from "react";
import Tab from "react-bootstrap/esm/Tab";
import Tabs from "react-bootstrap/esm/Tabs";
import ChatBox from "./ChatBox";
import GameInfoBox from "./GameInfoBox";
import s from "./TabsBox.module.scss";
import VoteHistoryBox from "./VoteHistoryBox";

export default function TabsBox() {
  // Keep track of active tab - default to "chat" and allow user to switch
  const [activeKey, setActiveKey] = useState<string>("chat");

  return (
    <div className={s.TabsBox}>
      <Tabs 
        activeKey={activeKey} 
        onSelect={(k) => setActiveKey(k || "chat")} 
        id="chat-history-tabs"
      >
        <Tab eventKey="chat" title="Chat">
          <ChatBox />
        </Tab>
        <Tab eventKey="history" title="Vote Log">
          <VoteHistoryBox />
        </Tab>
        <Tab eventKey="info" title="Info">
          <GameInfoBox />
        </Tab>
      </Tabs>
    </div>
  );
}
