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
    const newStructuralValue = !localShowStructural;
    setLocalShowStructural(newStructuralValue);
    setShowStructural(newStructuralValue);

    // If enabling structural view, force "show selected only" to be true
    if (newStructuralValue) {
      setLocalShowSelected(true);
      setShowSelectedOnly(true);
    }
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
      id="view-settings-popup"
      className="SettingsPopup"
      on="click"
      trigger={
        <Label as="a" corner="left" icon="sliders horizontal" color="violet" />
      }
      style={{ padding: "1em", zIndex: "2100 !important" }}
    >
      <Grid
        celled="internally"
        columns="equal"
        style={{
          width: `420px`,
          background: "#f9f9f9",
          borderRadius: "8px",
        }}
      >
        <Grid.Row>
          <Grid.Column textAlign="center" verticalAlign="middle">
            <Header size="tiny" style={{ marginBottom: "0.8em" }}>
              <i className="icon user outline" />
              Show Only Selected
            </Header>
            <Checkbox
              toggle
              onChange={(e, data) =>
                handleShowSelectedChange(data?.checked ?? false)
              }
              checked={localShowSelected}
              disabled={localShowStructural}
              style={{ transform: "scale(1.1)" }}
            />
          </Grid.Column>

          <Grid.Column textAlign="center" verticalAlign="middle">
            <Header size="tiny" style={{ marginBottom: "0.8em" }}>
              <i className="icon square outline" />
              Show Bounding Boxes
            </Header>
            <Checkbox
              toggle
              onChange={(e, data) =>
                handleShowBoundingBoxesChange(data?.checked ?? false)
              }
              checked={localShowBoundingBoxes}
              style={{ transform: "scale(1.1)" }}
            />
          </Grid.Column>
        </Grid.Row>
        <Grid.Row>
          <Grid.Column textAlign="center" verticalAlign="middle">
            <Header size="tiny" style={{ marginBottom: "0.8em" }}>
              <i className="icon sitemap" />
              Show Structural
            </Header>
            <Checkbox
              toggle
              onChange={handleShowStructuralChange}
              checked={localShowStructural}
              style={{ transform: "scale(1.1)" }}
            />
          </Grid.Column>
          <Grid.Column textAlign="center" verticalAlign="middle">
            <Header size="tiny" style={{ marginBottom: "0.8em" }}>
              <i className="icon tags" />
              Label Display
            </Header>
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
        </Grid.Row>
        <Grid.Row>
          <Grid.Column textAlign="center" verticalAlign="middle" width={16}>
            <Header size="tiny" style={{ marginBottom: "0.8em" }}>
              <i className="icon filter" />
              Label Filter
            </Header>
            <ViewLabelSelector />
          </Grid.Column>
        </Grid.Row>
      </Grid>
    </Popup>
  );
};
