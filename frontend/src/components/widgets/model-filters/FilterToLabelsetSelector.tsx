import { useQuery, useReactiveVar } from "@apollo/client";

import { Dropdown, Menu, Label, DropdownItemProps } from "semantic-ui-react";

import _ from "lodash";

import { filterToLabelsetId, userObj } from "../../../graphql/cache";
import {
  GetLabelsetOutputs,
  GetLabelsetInputs,
  GET_LABELSETS,
} from "../../../graphql/queries";
import { LabelSetType } from "../../../graphql/types";
import { useEffect } from "react";
import { LooseObject } from "../../types";
import useWindowDimensions from "../../hooks/WindowDimensionHook";
import { MOBILE_VIEW_BREAKPOINT } from "../../../assets/configurations/constants";

interface FilterToLabelsetSelectorProps {
  style?: Record<string, any>;
  fixed_labelset_id?: string;
}

export const FilterToLabelsetSelector = ({
  style,
  fixed_labelset_id,
}: FilterToLabelsetSelectorProps) => {
  const { width } = useWindowDimensions();
  const use_mobile_layout = width <= MOBILE_VIEW_BREAKPOINT;

  const filtered_to_labelset_id = useReactiveVar(filterToLabelsetId);
  const user_obj = useReactiveVar(userObj);

  let labelset_variables: LooseObject = {};
  if (fixed_labelset_id) {
    labelset_variables["labelsetId"] = fixed_labelset_id;
  }

  const { refetch, loading, data, error } = useQuery<
    GetLabelsetOutputs,
    GetLabelsetInputs
  >(GET_LABELSETS, {
    variables: labelset_variables,
    notifyOnNetworkStatusChange: true, // required to get loading signal on fetchMore
  });

  useEffect(() => {
    refetch();
  }, []);

  useEffect(() => {
    if (!fixed_labelset_id) {
      refetch();
    }
  }, [filtered_to_labelset_id]);

  useEffect(() => {
    refetch();
  }, [fixed_labelset_id]);

  useEffect(() => {
    refetch();
  }, [user_obj]);

  const labelset_edges = data?.labelsets?.edges ? data.labelsets.edges : [];
  const labelset_items = labelset_edges
    .map((edge) => (edge?.node ? edge.node : undefined))
    .filter((item): item is LabelSetType => !!item);

  let label_options: DropdownItemProps[] = [];
  if (labelset_items) {
    label_options = labelset_items
      .filter((item): item is LabelSetType => !!item)
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
        <div>Filter by Labelset:</div>
      </Label>
      <Dropdown
        fluid
        loading={loading}
        selection
        clearable
        search
        disabled={Boolean(fixed_labelset_id)}
        options={label_options}
        onChange={(e, { value }) => {
          filterToLabelsetId(String(value));
        }}
        placeholder="Filter by Labelset..."
        value={
          fixed_labelset_id
            ? fixed_labelset_id
            : filtered_to_labelset_id
            ? filtered_to_labelset_id
            : ""
        }
        style={{
          margin: "0px",
          width: "15rem",
          ...style,
        }}
      />
    </Menu>
  );
};
