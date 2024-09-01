import React from "react";
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
}) => (
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
              showSelectedAnnotationOnly(data?.checked ? data.checked : false)
            }
            checked={show_selected_annotation_only}
          />
        </Grid.Column>
        <Grid.Column textAlign="center" verticalAlign="middle">
          <Header size="tiny">Show Layout Blocks</Header>
          <Checkbox
            toggle
            onChange={(e, data) => toggleShowStructuralLabels()}
            checked={showStructuralLabels}
          />
        </Grid.Column>
        <Grid.Column textAlign="center" verticalAlign="middle">
          <Header size="tiny">Show Bounding Boxes</Header>
          <Checkbox
            toggle
            onChange={(e, data) =>
              showAnnotationBoundingBoxes(data?.checked ? data.checked : false)
            }
            checked={show_annotation_bounding_boxes}
          />
        </Grid.Column>
      </Grid.Row>
      <Grid.Row>
        <Grid.Column textAlign="center" verticalAlign="middle">
          <Header size="tiny">Label Display Behavior</Header>
          <Dropdown
            onChange={(e, { value }) =>
              showAnnotationLabels(value as LabelDisplayBehavior)
            }
            options={label_display_options}
            selection
            value={label_display_behavior}
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
