import React, { useState } from "react";
import {
  Segment,
  Button,
  Comment,
  Input,
  Label as SemanticLabel,
} from "semantic-ui-react";
import styled from "styled-components";

import Fuse from "fuse.js";
import _ from "lodash";
import { AnnotationLabelType } from "../../../../types/graphql-api";
import {
  EmptyLabelListItem,
  LabelListItem,
} from "../../sidebar/LabelListItems";

interface DocTypePopupProps {
  labels: AnnotationLabelType[];
  onSelect: (label: AnnotationLabelType) => void;
}

export const LabelSelectorDialog = ({
  labels,
  onSelect,
}: DocTypePopupProps) => {
  console.log("LabelSelectorDialog - labels", labels);

  const [selectedLabel, selectLabel] = useState<AnnotationLabelType>();
  const [searchString, setSearchString] = useState("");

  const labelFuse = new Fuse(labels, {
    threshold: 0.4,
    keys: ["label", "description"],
  });

  const filteredLabels =
    searchString === ""
      ? labels
      : labelFuse.search(searchString).map((item) => item.item);

  const items =
    filteredLabels.length > 0 ? (
      filteredLabels.map((label) => (
        <LabelListItem
          key={label.id}
          label={label}
          selected={Boolean(selectedLabel && selectedLabel.id === label.id)}
          onSelect={selectLabel}
        />
      ))
    ) : (
      <EmptyLabelListItem />
    );

  function handleChange(e: {
    target: { value: React.SetStateAction<string> };
  }) {
    setSearchString(e.target.value);
  }

  return (
    <LabelSelectorDialogContainer className="LabelSelectorDialogContainer">
      <Segment
        secondary
        style={{ border: "0px", width: "100%", padding: "0px", margin: "0px" }}
      >
        <Input
          style={{ width: "100%" }}
          placeholder="Search..."
          name="searchString"
          icon="search"
          value={searchString}
          onChange={handleChange}
        />
      </Segment>
      <Segment style={{ padding: "5px" }}>
        <SemanticLabel attached="top">Available Labels:</SemanticLabel>
        <Comment.Group
          style={{
            minHeight: "100px",
            maxHeight: "30vh",
            overflowY: "auto",
            marginRight: "0px",
          }}
        >
          {items}
        </Comment.Group>
      </Segment>
      <div>
        <Button
          disabled={!selectedLabel}
          floated="right"
          primary
          onClick={selectedLabel ? () => onSelect(selectedLabel) : () => {}}
        >
          Use Label
        </Button>
      </div>
    </LabelSelectorDialogContainer>
  );
};

const LabelSelectorDialogContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  z-index: 100000;
`;
