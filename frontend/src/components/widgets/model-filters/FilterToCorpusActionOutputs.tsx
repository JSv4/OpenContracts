import React from "react";
import { useReactiveVar } from "@apollo/client";
import { Checkbox, Menu, Label } from "semantic-ui-react";
import { showCorpusActionOutputs } from "../../../graphql/cache";
import useWindowDimensions from "../../hooks/WindowDimensionHook";

export const FilterToCorpusActionOutputs: React.FC = () => {
  const { width } = useWindowDimensions();
  const use_mobile_layout = width <= 400;

  const show_corpus_action_analyses = useReactiveVar(showCorpusActionOutputs);

  return (
    <Menu
      style={{
        padding: "0px",
        margin: use_mobile_layout ? ".25rem" : "0px",
        marginRight: ".25rem",
      }}
    >
      <Label
        style={{
          marginRight: "0px",
          borderRadius: "5px 0px 0px 5px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div>Corpus Action Analyses:</div>
      </Label>
      <Menu.Item style={{ padding: "0px 8px 0px 8px" }}>
        <Checkbox
          toggle
          checked={show_corpus_action_analyses}
          onChange={() => showCorpusActionOutputs(!show_corpus_action_analyses)}
        />
      </Menu.Item>
    </Menu>
  );
};
