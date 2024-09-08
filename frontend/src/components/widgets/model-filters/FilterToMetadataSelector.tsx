import { SyntheticEvent, useEffect } from "react";
import { Menu, Label, Dropdown, DropdownProps } from "semantic-ui-react";

import { useQuery, useReactiveVar } from "@apollo/client";
import { selectedMetaAnnotationId } from "../../../graphql/cache";
import {
  GetCorpusMetadataInputs,
  GetCorpusMetadataOutputs,
  GET_CORPUS_METADATA,
} from "../../../graphql/queries";
import useWindowDimensions from "../../hooks/WindowDimensionHook";
import { toast } from "react-toastify";

interface FilterToMetadataSelectorProps {
  selected_corpus_id: string;
  style?: Record<string, any>;
}

export const FilterToMetadataSelector = ({
  selected_corpus_id,
  style,
}: FilterToMetadataSelectorProps) => {
  const { width } = useWindowDimensions();
  const use_mobile_layout = width <= 600;
  const selected_annotation_id = useReactiveVar(selectedMetaAnnotationId);

  const {
    refetch: refetchLabels,
    loading: metadata_loading,
    data: metadata_data,
    error: metadata_error,
  } = useQuery<GetCorpusMetadataOutputs, GetCorpusMetadataInputs>(
    GET_CORPUS_METADATA,
    {
      variables: {
        metadataForCorpusId: selected_corpus_id,
      },
      notifyOnNetworkStatusChange: true,
      skip: !Boolean(selected_corpus_id),
    }
  );

  useEffect(() => {
    if (selected_corpus_id) {
      refetchLabels();
    }
  }, [selected_corpus_id]);

  if (metadata_error) {
    toast.error(
      "Error fetching metadata for corpus... can't properly filter on metadata"
    );
  }

  const labels = metadata_data?.corpus?.allAnnotationSummaries
    ? metadata_data.corpus.allAnnotationSummaries.map((annot) => ({
        key: annot.id,
        value: annot.id,
        text: `${annot.annotationLabel.text}: ${annot.rawText}`,
      }))
    : [];

  const handleChange = (
    e: SyntheticEvent<HTMLElement, Event>,
    data: DropdownProps
  ) => selectedMetaAnnotationId(data.value ? String(data.value) : "");

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
        <div>Filter by Metadata:</div>
      </Label>
      <Dropdown
        fluid
        selection
        clearable
        search
        loading={metadata_loading}
        options={labels}
        onChange={handleChange}
        placeholder="Filter by label..."
        value={selected_annotation_id ? selected_annotation_id : ""}
        style={{
          margin: "0px",
          width: "15rem",
          ...style,
        }}
      />
    </Menu>
  );
};
