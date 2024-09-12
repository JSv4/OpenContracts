import { useQuery, useReactiveVar } from "@apollo/client";

import { Dropdown, Menu, Label, DropdownItemProps } from "semantic-ui-react";

import _ from "lodash";

import { filterToCorpus, userObj } from "../../../graphql/cache";
import {
  GetCorpusesOutputs,
  GetCorpusesInputs,
  GET_CORPUSES,
} from "../../../graphql/queries";
import { CorpusType } from "../../../graphql/types";
import { useEffect } from "react";
import { LooseObject } from "../../types";
import useWindowDimensions from "../../hooks/WindowDimensionHook";
import { MOBILE_VIEW_BREAKPOINT } from "../../../assets/configurations/constants";

interface FilterToCorpusSelector {
  style?: Record<string, any>;
  uses_labelset_id?: string | null;
}

export const FilterToCorpusSelector = ({
  style,
  uses_labelset_id,
}: FilterToCorpusSelector) => {
  const { width } = useWindowDimensions();
  const use_mobile_layout = width <= MOBILE_VIEW_BREAKPOINT;

  const filtered_to_corpus = useReactiveVar(filterToCorpus);
  const user_obj = useReactiveVar(userObj);

  let corpus_variables: LooseObject = [];
  if (uses_labelset_id) {
    corpus_variables["usesLabelsetId"] = uses_labelset_id;
  }

  const { refetch, loading, data, error } = useQuery<
    GetCorpusesOutputs,
    GetCorpusesInputs
  >(GET_CORPUSES, {
    variables: corpus_variables,
    notifyOnNetworkStatusChange: true, // required to get loading signal on fetchMore
  });

  useEffect(() => {
    refetch();
  }, []);

  useEffect(() => {
    refetch();
  }, [user_obj]);

  const corpus_edges = data?.corpuses?.edges ? data.corpuses.edges : [];
  const corpus_items = corpus_edges
    .map((edge) => (edge?.node ? edge.node : undefined))
    .filter((item): item is CorpusType => !!item);

  let label_options: DropdownItemProps[] = [];
  if (corpus_items) {
    label_options = corpus_items
      .filter((item): item is CorpusType => !!item)
      .map((label) => ({
        key: label.id,
        text: label?.title ? label.title : "",
        value: label.id,
        image: { avatar: true, src: label.icon },
      }));
  }

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
        <div>Filter by Corpus:</div>
      </Label>
      <Menu.Menu position="right">
        <Dropdown
          fluid
          selection
          clearable
          search
          loading={loading}
          options={label_options}
          onChange={(e, { value }) => {
            if (value === "") {
              filterToCorpus(null);
            } else {
              let matching_corpuses = corpus_items.filter(
                (item) => item.id === value
              );
              if (matching_corpuses.length === 1) {
                filterToCorpus(matching_corpuses[0]);
              }
            }
          }}
          placeholder="Filter by corpus..."
          value={filtered_to_corpus ? filtered_to_corpus.id : ""}
          style={{
            margin: "0px",
            width: "15rem",
            ...style,
          }}
        />
      </Menu.Menu>
    </Menu>
  );
};
