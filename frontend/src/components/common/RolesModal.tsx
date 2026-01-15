import Modal from "react-bootstrap/esm/Modal";
import s from "./RolesModal.module.scss";
import { TRole } from "./TextFormat";

type RolesModalProps = {
  hideFullRulesLink?: boolean;
  show: boolean;
  onClose: () => void;
};

export default function RolesModal(props: RolesModalProps) {
  return (
    <Modal show={props.show} onHide={props.onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Avalon Roles</Modal.Title>
      </Modal.Header>
      <Modal.Body className={s.body}>
        <h1 className={s.header}>Good</h1>
        <span>
          <TRole role="merlin" />{" "}
        </span>
        <span>Knows all evil players except Mordred</span>
        <span>
          <TRole role="percival" />{" "}
        </span>
        <span>Sees Merlin and Morgana but doesn't know which is which</span>
        <span>
          <TRole role="loyal_servant" />{" "}
        </span>
        <span>Regular good player with no special abilities</span>
        <h1 className={s.header}>Evil</h1>
        <span>
          <TRole role="assassin" />{" "}
        </span>
        <span>Can assassinate Merlin if good wins 3 missions</span>
        <span>
          <TRole role="morgana" />{" "}
        </span>
        <span>Appears as Merlin to Percival</span>
        <span>
          <TRole role="mordred" />{" "}
        </span>
        <span>Hidden from Merlin</span>
        <span>
          <TRole role="oberon" />{" "}
        </span>
        <span>Unknown to and doesn't know other evil players</span>
      </Modal.Body>
    </Modal>
  );
}
