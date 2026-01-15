import { useState } from "react";
import Col from "react-bootstrap/esm/Col";
import Container from "react-bootstrap/esm/Container";
import Row from "react-bootstrap/esm/Row";
import { Link } from "react-router-dom";
import RolesModal from "../common/RolesModal";
import { TFail, TRole, TSuccess } from "../common/TextFormat";
import s from "./HowToPlayView.module.scss";

export default function HowToPlayView() {
  const [rolesShown, setRolesShown] = useState(false);
  return (
    <div className={s.HowToPlayView}>
      <Link className={s.back} to="..">
        Back to homepage
      </Link>
      <RolesModal
        show={rolesShown}
        onClose={() => setRolesShown(false)}
        hideFullRulesLink
      />
      <Container>
        <Row>
          <Col xs={0} lg={1} />
          <Col xs={12} lg={10}>
            <h1 className={s.title}>Avalon</h1>
            <h2>Basic Rules</h2>
            <p>
              Avalon is a social deduction game where players are divided into two teams: the{" "}
              <TSuccess>Knights of the Round Table</TSuccess> (Good) and the{" "}
              <TFail>Minions of Mordred</TFail> (Evil). The Good team must complete 3 successful Quests, while the Evil team must sabotage 3 Quests or assassinate Merlin to win.
            </p>
            <p>
              Each round, players propose and vote on a team to go on a Quest. Good players always succeed Quests, but Evil players can choose to fail them. The game includes special roles with unique abilities that add strategy and deception.
            </p>
            <p>
              <strong>Key Roles:</strong>
            </p>
            <ul>
              <li><TRole role="merlin" /> (Good): Sees all Evil players except Mordred</li>
              <li><TRole role="percival" /> (Good): Sees Merlin and Morgana, but doesn't know which is which</li>
              <li><TRole role="loyal_servant" /> (Good): Regular Good player with no special abilities</li>
              <li><TRole role="assassin" /> (Evil): Can assassinate Merlin at the end if Good would win</li>
              <li><TRole role="morgana" /> (Evil): Appears as Merlin to Percival</li>
              <li><TRole role="mordred" /> (Evil): Hidden from Merlin</li>
              <li><TRole role="oberon" /> (Evil): Doesn't know other Evil players and they don't know him</li>
            </ul>
            <p>
              <button className={s.linkButton} onClick={() => setRolesShown(true)}>Click here</button> for detailed role descriptions.
            </p>
            <h2>Game Modes</h2>
            <h3>Easy Mode (5 Players)</h3>
            <p>
              Perfect for beginners. Includes the core roles: Merlin, Percival, Loyal Servant, Assassin, and Morgana. This mode introduces the basic deception mechanics without overwhelming complexity.
            </p>
            <p><strong>Team Composition:</strong> 3 Good (Merlin, Percival, Loyal Servant) vs 2 Evil (Assassin, Morgana)</p>
            
            <h3>Medium Mode (7 Players)</h3>
            <p>
              Adds more strategy with an additional Good player and Mordred. Mordred's ability to hide from Merlin creates interesting bluffing opportunities.
            </p>
            <p><strong>Team Composition:</strong> 4 Good (Merlin, Percival, 2 Loyal Servants) vs 3 Evil (Assassin, Morgana, Mordred)</p>
            
            <h3>Hard Mode (9 Players)</h3>
            <p>
              The full Avalon experience with Oberon. Oberon's isolation from both Good and Evil adds a layer of uncertainty and makes the game more challenging.
            </p>
            <p><strong>Team Composition:</strong> 5 Good (Merlin, Percival, 3 Loyal Servants) vs 4 Evil (Assassin, Morgana, Mordred, Oberon)</p>
            
            <h2>How to Win</h2>
            <p>
              <TSuccess>Good wins</TSuccess> by successfully completing 3 Quests.
            </p>
            <p>
              <TFail>Evil wins</TFail> by failing 3 Quests, or by assassinating Merlin at the end of the game if Good has completed 3 successful Quests.
            </p>
            <p>
              The game ends immediately when either condition is met.
            </p>
            <h2>Video Tutorial</h2>
            <p>
              For a more thorough explaination, the following video explains the
              full rules of The Resistance / Avalon
            </p>
            <iframe
              className={s.video}
              width="560"
              height="315"
              src="https://www.youtube.com/embed/MpZYDpIM2dQ"
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </Col>
          <Col xs={0} lg={1} />
        </Row>
      </Container>
    </div>
  );
}
