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
import { LabelDisplayBehavior } from "../../../types/graphql-api";
import { useAnnotationDisplay } from "../../annotator/context/UISettingsAtom";

interface ViewSettingsPopupProps {
  label_display_options: DropdownItemProps[];
}

export const ViewSettingsPopup: React.FC<ViewSettingsPopupProps> = ({
  label_display_options,
}) => {
  const {
    showLabels,
    setShowLabels,
    showStructural,
    setShowStructural,
    showSelectedOnly,
    setShowSelectedOnly,
    showBoundingBoxes,
    setShowBoundingBoxes,
  } = useAnnotationDisplay();

  const [localShowSelected, setLocalShowSelected] = useState(showSelectedOnly);
  const [localShowStructural, setLocalShowStructural] =
    useState(showStructural);
  const [localShowBoundingBoxes, setLocalShowBoundingBoxes] =
    useState(showBoundingBoxes);
  const [localLabelBehavior, setLocalLabelBehavior] = useState(showLabels);

  useEffect(() => {
    setShowSelectedOnly(showSelectedOnly);
    setShowStructural(showStructural);
    setShowBoundingBoxes(showBoundingBoxes);
    setShowLabels(showLabels);
  }, [showLabels, showStructural, showBoundingBoxes, showSelectedOnly]);

  const handleShowSelectedChange = (checked: boolean) => {
    setLocalShowSelected(checked);
    setShowSelectedOnly(checked);
  };

  const handleShowStructuralChange = () => {
    setLocalShowStructural(!localShowStructural);
    setShowStructural(!localShowStructural);
  };

  const handleShowBoundingBoxesChange = (checked: boolean) => {
    setLocalShowBoundingBoxes(checked);
    setShowBoundingBoxes(checked);
  };

  const handleLabelBehaviorChange = (value: LabelDisplayBehavior) => {
    setLocalLabelBehavior(value);
    setShowLabels(value);
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
