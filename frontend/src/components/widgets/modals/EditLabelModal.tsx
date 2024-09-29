import {
  MouseEvent,
  useContext,
  useState,
  useEffect,
  SyntheticEvent,
} from "react";
import _ from "lodash";

import {
  Modal,
  Dropdown,
  DropdownItemProps,
  DropdownProps,
  Button,
} from "semantic-ui-react";
import {
  AnnotationStore,
  ServerTokenAnnotation,
} from "../../annotator/context/AnnotationStore";

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
  const annotationStore = useContext(AnnotationStore);

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
      // Numeric keys 1-9
      e.preventDefault();
      e.stopPropagation();
      if (e.keyCode >= 49 && e.keyCode <= 57) {
        const index = Number.parseInt(e.key) - 1;
        if (index < annotationStore.spanLabels.length) {
          annotationStore.updateAnnotation(
            new ServerTokenAnnotation(
              annotation.page,
              annotationStore.spanLabels[index],
              annotation.rawText,
              annotation.structural,
              annotation.json,
              annotation.myPermissions,
              annotation.approved,
              annotation.rejected,
              annotation.canComment,
              annotation.id
            )
          );
          onHide();
        }
      }
    };
    window.addEventListener("keydown", onKeyPress);
    return () => {
      window.removeEventListener("keydown", onKeyPress);
    };
  }, [annotationStore, annotation]);

  const dropdownOptions: DropdownItemProps[] = annotationStore.spanLabels.map(
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
    const label = annotationStore.spanLabels.find((l) => l.id === data.value);
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
            // Call mutation to update annotation on server and reflect change locally if it succeeds.
            event.preventDefault();
            event.stopPropagation();

            annotationStore.updateAnnotation(
              new ServerTokenAnnotation(
                annotation.page,
                selectedLabel,
                annotation.rawText,
                annotation.structural,
                annotation.json,
                annotation.myPermissions,
                annotation.approved,
                annotation.rejected,
                annotation.canComment,
                annotation.id
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
