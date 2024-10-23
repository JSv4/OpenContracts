import { useEffect } from "react";
import { useQuery, useReactiveVar } from "@apollo/client";
import {
  Dropdown,
  Header,
  Menu,
  Label,
  DropdownItemProps,
} from "semantic-ui-react";

import _ from "lodash";

import {
  filterToLabelId,
  filterToLabelsetId,
  userObj,
} from "../../../graphql/cache";
import {
  GetAnnotationLabelsInput,
  GetAnnotationLabelsOutput,
  GET_ANNOTATION_LABELS,
} from "../../../graphql/queries";
import { AnnotationLabelType, LabelType } from "../../../types/graphql-api";
import { LooseObject } from "../../types";
import { toast } from "react-toastify";
import useWindowDimensions from "../../hooks/WindowDimensionHook";
import { MOBILE_VIEW_BREAKPOINT } from "../../../assets/configurations/constants";

interface FilterToLabelSelectorProps {
  style?: Record<string, any>;
  label_type?: LabelType;
  only_labels_for_corpus_id?: string;
  only_labels_for_labelset_id?: string;
}

export const FilterToLabelSelector = ({
  style,
  label_type,
  only_labels_for_corpus_id,
  only_labels_for_labelset_id,
}: FilterToLabelSelectorProps) => {
  const { width } = useWindowDimensions();
  const use_mobile_layout = width <= MOBILE_VIEW_BREAKPOINT;

  const filtered_to_label_id = useReactiveVar(filterToLabelId);
  const filtered_to_labelset_id = useReactiveVar(filterToLabelsetId);
  const user_obj = useReactiveVar(userObj);

  let annotations_variables: LooseObject = {};
  if (label_type) {
    annotations_variables["labelType"] = label_type;
  }
  if (only_labels_for_corpus_id) {
    annotations_variables["corpusId"] = only_labels_for_corpus_id;
  }
  if (only_labels_for_labelset_id) {
    annotations_variables["labelsetId"] = only_labels_for_labelset_id;
  }

  const {
    refetch: refetch_labels,
    loading: annotation_labels_loading,
    data: annotation_labels_data,
    error: annotation_labels_loading_error,
  } = useQuery<GetAnnotationLabelsOutput, GetAnnotationLabelsInput>(
    GET_ANNOTATION_LABELS,
    {
      variables: annotations_variables,
      notifyOnNetworkStatusChange: true,
    }
  );

  if (annotation_labels_loading_error) {
    toast.error("ERROR\nCould not fetch available labels for filtering.");
  }

  useEffect(() => {
    refetch_labels();
    return function clearSelectedLabelOnUnmount() {
      filterToLabelId("");
    };
  }, []);

  useEffect(() => {
    // console.log("only_labels_for_corpus_id");
    refetch_labels();
  }, [only_labels_for_corpus_id]);

  useEffect(() => {
    // console.log("only_labels_for_labelset_id");
    if (!only_labels_for_corpus_id && !only_labels_for_labelset_id) {
      filterToLabelId("");
    } else {
      refetch_labels();
    }
  }, [only_labels_for_labelset_id]);

  useEffect(() => {
    // console.log("filtered_to_labelset_id");
    refetch_labels();
  }, [filtered_to_labelset_id]);

  useEffect(() => {
    // console.log("label_type");
    refetch_labels();
  }, [label_type]);

  useEffect(() => {
    // console.log("user_obj");
    refetch_labels();
  }, [user_obj]);

  // console.log("Annotation label selector data", annotation_labels_data);

  const labels = annotation_labels_data?.annotationLabels
    ? annotation_labels_data.annotationLabels.edges
        .map((edge) => (edge ? edge.node : null))
        .filter((edge) => edge != null)
    : [];
  // console.log("Labels", labels);

  let label_options: DropdownItemProps[] = [];
  if (labels) {
    label_options = labels
      .filter((item): item is AnnotationLabelType => !!item)
      .map((label) => ({
        key: label.id,
        text: label.text,
        value: label.id,
        content: (
          <Header
            icon={label.icon}
            content={label.text}
            subheader={label.description}
          />
        ),
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
        <div>Filter by Label:</div>
      </Label>
      <Dropdown
        fluid
        selection
        clearable
        search
        loading={annotation_labels_loading}
        options={label_options}
        onChange={(e, { value }) => {
          // console.log("Set filter label id", value);
          filterToLabelId(String(value));
        }}
        placeholder="Filter by label..."
        value={filtered_to_label_id ? filtered_to_label_id : ""}
        style={{
          margin: "0px",
          width: "15rem",
          ...style,
        }}
      />
    </Menu>
  );
};
