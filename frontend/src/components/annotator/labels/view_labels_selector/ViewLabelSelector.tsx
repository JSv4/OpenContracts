import React, { useContext, useMemo } from "react";
import { Dropdown, DropdownProps } from "semantic-ui-react";
import _ from "lodash";
import { AnnotationStore } from "../../context";
import { AnnotationLabelType } from "../../../../graphql/types";

export const ViewLabelSelector: React.FC = () => {
  const annotationStore = useContext(AnnotationStore);

  const allLabelChoices = useMemo(() => {
    const humanLabels = annotationStore.humanSpanLabelChoices;
    const spanLabels = annotationStore.spanLabels;

    // Combine both label types and remove duplicates
    return _.uniqBy([...humanLabels, ...spanLabels], "id");
  }, [annotationStore.humanSpanLabelChoices, annotationStore.spanLabels]);

  const { showOnlySpanLabels, setViewLabels } = annotationStore;

  const handleChange = (
    event: React.SyntheticEvent<HTMLElement, Event>,
    data: DropdownProps
  ) => {
    const selectedLabels = allLabelChoices.filter((l) =>
      data?.value && Array.isArray(data.value) ? data.value.includes(l.id) : []
    );
    setViewLabels(selectedLabels);
  };

  const labelOptions = useMemo(() => {
    return allLabelChoices.map((label: AnnotationLabelType) => ({
      key: label.id,
      text: label.text || "?",
      value: label.id,
    }));
  }, [allLabelChoices]);

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
      style={{ minWidth: "10em" }}
    />
  );
};
