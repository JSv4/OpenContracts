import { MouseEvent, useState, useEffect, SyntheticEvent } from "react";
import _ from "lodash";

import {
  Modal,
  Dropdown,
  DropdownItemProps,
  DropdownProps,
  Button,
} from "semantic-ui-react";
import { useCorpusState } from "../../context/CorpusAtom";
import { ServerTokenAnnotation } from "../../types/annotations";

interface EditLabelModalProps {
  annotation: ServerTokenAnnotation;
  visible: boolean;
  onHide: () => void;
}

export const EditLabelModal = ({
  annotation,
  visible,
  onHide,
}: EditLabelModalProps) => {
  const { spanLabels, setSpanLabels } = useCorpusState();

  const [selectedLabel, setSelectedLabel] = useState(
    annotation.annotationLabel
  );

  // There are onMouseDown listeners on the <canvas> that handle the
  // creation of new annotations. We use this function to prevent that
  // from being triggered when the user engages with other UI elements.
  const onMouseDown = (e: MouseEvent) => {
    e.stopPropagation();
  };

  useEffect(() => {
    const onKeyPress = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.keyCode >= 49 && e.keyCode <= 57) {
        const index = Number.parseInt(e.key) - 1;
        if (index < spanLabels.length) {
          // Note: You'll need to implement updateAnnotation functionality separately
          setSpanLabels(
            spanLabels.map((label, i) => (i === index ? selectedLabel : label))
          );
          onHide();
        }
      }
    };
    window.addEventListener("keydown", onKeyPress);
    return () => {
      window.removeEventListener("keydown", onKeyPress);
    };
  }, [spanLabels, annotation]);

  const dropdownOptions: DropdownItemProps[] = spanLabels.map(
    (label, index) => ({
      key: label.id,
      text: label.text,
      value: label.id,
    })
  );

  const handleDropdownChange = (
    event: SyntheticEvent<HTMLElement, Event>,
    data: DropdownProps
  ) => {
    event.stopPropagation();
    event.preventDefault();
    const label = spanLabels.find((l) => l.id === data.value);
    if (!label) {
      return;
    }
    setSelectedLabel(label);
  };

  return (
    <Modal header="Edit Label" open={visible} onMouseDown={onMouseDown}>
      <Modal.Content>
        <Dropdown
          placeholder="Select label"
          search
          selection
          options={dropdownOptions}
          onChange={handleDropdownChange}
          onMouseDown={onMouseDown}
          value={selectedLabel.id}
        />
      </Modal.Content>
      <Modal.Actions>
        <Button
          color="green"
          onClick={(event: SyntheticEvent) => {
            event.preventDefault();
            event.stopPropagation();

            setSpanLabels(
              spanLabels.map((label, i) =>
                i === spanLabels.indexOf(selectedLabel) ? selectedLabel : label
              )
            );

            onHide();
          }}
          onMouseDown={onMouseDown}
        >
          Save Change
        </Button>
        <Button color="black" onClick={onHide} onMouseDown={onMouseDown}>
          Cancel
        </Button>
      </Modal.Actions>
    </Modal>
  );
};
