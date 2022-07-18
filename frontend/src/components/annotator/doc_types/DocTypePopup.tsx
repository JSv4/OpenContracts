import React, { useState } from "react";
import { Segment, Button, Comment, Input } from "semantic-ui-react";
import { EmptyLabelListItem, LabelListItem } from "../sidebar/LabelListItems";
import Fuse from "fuse.js";
import _ from "lodash";
import { AnnotationLabelType } from "../../../graphql/types";

interface DocTypePopupProps {
  labels: AnnotationLabelType[];
  onAdd: (label: AnnotationLabelType) => void;
}

export const DocTypePopup = ({ labels, onAdd }: DocTypePopupProps) => {
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
      }}
    >
      <Segment style={{ width: "100%", margin: "0px" }}>
        <Input
          style={{ width: "100%" }}
          placeholder="Search..."
          name="searchString"
          icon="search"
          value={searchString}
          onChange={handleChange}
        />
      </Segment>
      <Segment>
        <Comment.Group
          style={{
            height: "30vh",
            overflowY: "scroll",
          }}
        >
          {items}
        </Comment.Group>
      </Segment>
      <div>
        <Button
          disabled={!selectedLabel}
          floated="right"
          positive
          onClick={selectedLabel ? () => onAdd(selectedLabel) : () => {}}
        >
          Add Label
        </Button>
      </div>
    </div>
  );
};
