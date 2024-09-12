import React, { useState, useEffect } from "react";
import {
  Popup,
  Grid,
  Checkbox,
  Header,
  Dropdown,
  Label,
  DropdownItemProps,
} from "semantic-ui-react";
import { ViewLabelSelector } from "../../annotator/labels/view_labels_selector/ViewLabelSelector";
import { LabelDisplayBehavior } from "../../../graphql/types";

interface ViewSettingsPopupProps {
  show_selected_annotation_only: boolean;
  showSelectedAnnotationOnly: (checked: boolean) => void;
  showStructuralLabels: boolean;
  toggleShowStructuralLabels: () => void;
  show_annotation_bounding_boxes: boolean;
  showAnnotationBoundingBoxes: (checked: boolean) => void;
  label_display_behavior: LabelDisplayBehavior;
  showAnnotationLabels: (value: LabelDisplayBehavior) => void;
  label_display_options: DropdownItemProps[];
}

export const ViewSettingsPopup: React.FC<ViewSettingsPopupProps> = ({
  show_selected_annotation_only,
  showSelectedAnnotationOnly,
  showStructuralLabels,
  toggleShowStructuralLabels,
  show_annotation_bounding_boxes,
  showAnnotationBoundingBoxes,
  label_display_behavior,
  showAnnotationLabels,
  label_display_options,
}) => {
  const [localShowSelected, setLocalShowSelected] = useState(
    show_selected_annotation_only
  );
  const [localShowStructural, setLocalShowStructural] =
    useState(showStructuralLabels);
  const [localShowBoundingBoxes, setLocalShowBoundingBoxes] = useState(
    show_annotation_bounding_boxes
  );
  const [localLabelBehavior, setLocalLabelBehavior] = useState(
    label_display_behavior
  );

  useEffect(() => {
    setLocalShowSelected(show_selected_annotation_only);
    setLocalShowStructural(showStructuralLabels);
    setLocalShowBoundingBoxes(show_annotation_bounding_boxes);
    setLocalLabelBehavior(label_display_behavior);
  }, [
    show_selected_annotation_only,
    showStructuralLabels,
    show_annotation_bounding_boxes,
    label_display_behavior,
  ]);

  const handleShowSelectedChange = (checked: boolean) => {
    setLocalShowSelected(checked);
    showSelectedAnnotationOnly(checked);
  };

  const handleShowStructuralChange = () => {
    setLocalShowStructural(!localShowStructural);
    toggleShowStructuralLabels();
  };

  const handleShowBoundingBoxesChange = (checked: boolean) => {
    setLocalShowBoundingBoxes(checked);
    showAnnotationBoundingBoxes(checked);
  };

  const handleLabelBehaviorChange = (value: LabelDisplayBehavior) => {
    setLocalLabelBehavior(value);
    showAnnotationLabels(value);
  };

  return (
    <Popup
      className="SettingsPopup"
      on="click"
      trigger={<Label as="a" corner="left" icon="eye" color="violet" />}
      style={{ padding: "0px", zIndex: "2100 !important" }}
    >
      <Grid celled="internally" columns="equal" style={{ width: `400px` }}>
        <Grid.Row>
          <Grid.Column textAlign="center" verticalAlign="middle">
            <Header size="tiny">Show Only Selected</Header>
            <Checkbox
              toggle
              onChange={(e, data) =>
                handleShowSelectedChange(data?.checked ?? false)
              }
              checked={localShowSelected}
            />
          </Grid.Column>
          <Grid.Column textAlign="center" verticalAlign="middle">
            <Header size="tiny">Show Layout Blocks</Header>
            <Checkbox
              toggle
              onChange={handleShowStructuralChange}
              checked={localShowStructural}
            />
          </Grid.Column>
          <Grid.Column textAlign="center" verticalAlign="middle">
            <Header size="tiny">Show Bounding Boxes</Header>
            <Checkbox
              toggle
              onChange={(e, data) =>
                handleShowBoundingBoxesChange(data?.checked ?? false)
              }
              checked={localShowBoundingBoxes}
            />
          </Grid.Column>
        </Grid.Row>
        <Grid.Row>
          <Grid.Column textAlign="center" verticalAlign="middle">
            <Header size="tiny">Label Display Behavior</Header>
            <Dropdown
              onChange={(e, { value }) =>
                handleLabelBehaviorChange(value as LabelDisplayBehavior)
              }
              options={label_display_options}
              selection
              value={localLabelBehavior}
              style={{ minWidth: "12em" }}
            />
          </Grid.Column>
          <Grid.Column textAlign="center" verticalAlign="middle">
            <Header size="tiny">These Labels Only</Header>
            <ViewLabelSelector />
          </Grid.Column>
        </Grid.Row>
      </Grid>
    </Popup>
  );
};
