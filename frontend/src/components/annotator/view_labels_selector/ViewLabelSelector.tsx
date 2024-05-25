import React, { useContext } from "react";
import { Dropdown, DropdownProps } from "semantic-ui-react";

import _ from "lodash";

import "./LabelSelector.css";
import { AnnotationStore } from "../context";
import { AnnotationLabelType } from "../../../graphql/types";
import useWindowDimensions from "../../hooks/WindowDimensionHook";

interface LabelSelectorProps {
  sidebarWidth: string;
}

export const LabelSelector = ({ sidebarWidth }: LabelSelectorProps) => {
  const annotationStore = useContext(AnnotationStore);

  // Some labels are not meant to be manually annotated (namely those for
  // analyzer results). The label selector should not allow the user to select
  // labels used by an analyzer (at least not for now), so we need to track that
  // list separately.
  const human_label_choices = annotationStore.humanSpanLabelChoices;
  const {
    showOnlySpanLabels,
    setViewLabels,
    addLabelsToView,
    clearViewLabels,
    removeLabelsToView,
  } = annotationStore;

  const handleChange = (
    event: React.SyntheticEvent<HTMLElement, Event>,
    data: DropdownProps
  ) => {
    console.log("Got event", event);
    console.log("Event data", data);
  };

  // Filter out already applied labels from the label options
  const labelOptions = _.map(human_label_choices, (label) => ({
    key: label.id,
    text: label.text ? label.text : "?",
    value: label.id,
  }));

  return (
    <Dropdown
      onChange={handleChange}
      value={showOnlySpanLabels ? showOnlySpanLabels.map((l) => l.id) : []}
      placeholder="Only Show Labels"
      fluid
      multiple
      search
      selection
      options={labelOptions}
    />
  );
};
