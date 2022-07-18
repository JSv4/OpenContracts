import { Label, Icon, Modal, Header, Button } from "semantic-ui-react";

interface ConfirmModalProps {
  message: string;
  visible: boolean;
  yesAction: (args?: any) => void;
  noAction: (args?: any) => void;
  toggleModal: (args?: any) => void;
}
export function ConfirmModal({
  message,
  visible,
  yesAction,
  noAction,
  toggleModal,
}: ConfirmModalProps) {
  const onYesClick = () => {
    yesAction();
    toggleModal();
  };

  const onNoClick = () => {
    noAction();
    toggleModal();
  };

  return (
    <Modal open={visible} basic size="small">
      <Label
        corner="right"
        color="grey"
        icon="cancel"
        onClick={() => toggleModal()}
      />
      <Header icon="exclamation circle" content="ARE YOU SURE?" />
      <Modal.Content>
        <p>{message}</p>
      </Modal.Content>
      <Modal.Actions>
        <Button basic color="red" inverted onClick={() => onNoClick()}>
          <Icon name="remove" /> No
        </Button>
        <Button color="green" inverted onClick={() => onYesClick()}>
          <Icon name="checkmark" /> Yes
        </Button>
      </Modal.Actions>
    </Modal>
  );
}
