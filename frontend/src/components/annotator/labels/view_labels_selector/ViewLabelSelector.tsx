import React, { useMemo } from "react";
import { Dropdown, DropdownProps } from "semantic-ui-react";
import _ from "lodash";
import { AnnotationLabelType } from "../../../../types/graphql-api";
import { useCorpusState } from "../../context/CorpusAtom";
import { useAnnotationControls } from "../../context/UISettingsAtom";

export const ViewLabelSelector: React.FC = () => {
  const { humanSpanLabels, spanLabels } = useCorpusState();

  const allLabelChoices = useMemo(() => {
    // Combine both label types and remove duplicates
    return _.uniqBy([...humanSpanLabels, ...spanLabels], "id");
  }, [humanSpanLabels, spanLabels]);

  const annotationControls = useAnnotationControls();
  const { spanLabelsToView, setSpanLabelsToView } = annotationControls;

  const handleChange = (
    event: React.SyntheticEvent<HTMLElement, Event>,
    data: DropdownProps
  ) => {
    const selectedLabels = allLabelChoices.filter((l) =>
      data?.value && Array.isArray(data.value) ? data.value.includes(l.id) : []
    );
    setSpanLabelsToView(selectedLabels);
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
      value={spanLabelsToView ? spanLabelsToView.map((l) => l.id) : []}
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
