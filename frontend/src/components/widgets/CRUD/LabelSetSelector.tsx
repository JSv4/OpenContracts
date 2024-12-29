import { useEffect } from "react";
import { useQuery, useReactiveVar } from "@apollo/client";
import { Header, Segment, Loader, Dimmer, Dropdown } from "semantic-ui-react";
import _ from "lodash";
import { labelsetSearchTerm } from "../../../graphql/cache";
import {
  GetLabelsetInputs,
  GetLabelsetOutputs,
  GET_LABELSETS,
} from "../../../graphql/queries";
import { LabelSetType } from "../../../types/graphql-api";

interface LabelSetSelectorProps {
  read_only?: boolean;
  labelSet?: LabelSetType;
  style?: Record<string, any>;
  onChange?: (values: any) => void;
}

/**
 * If the user picks the same labelSet or hasn't changed it, we won't fire onChange.
 * If the user clears the dropdown, we explicitly set labelSet: null.
 */
export const LabelSetSelector = ({
  onChange,
  read_only,
  style,
  labelSet,
}: LabelSetSelectorProps) => {
  const search_term = useReactiveVar(labelsetSearchTerm);
  const { refetch, loading, error, data, fetchMore } = useQuery<
    GetLabelsetOutputs,
    GetLabelsetInputs
  >(GET_LABELSETS, {
    variables: {
      description: search_term,
    },
    notifyOnNetworkStatusChange: true,
  });

  useEffect(() => {
    refetch();
  }, [search_term, refetch]);

  const handleChange = (_e: any, { value }: any) => {
    // If user has not actually changed the labelSet, do nothing:
    if (value === labelSet?.id) return;

    // If user explicitly clears, value === undefined => labelSet null
    // Otherwise labelSet is new value (the new labelSet.id).
    onChange?.({ labelSet: value ?? null });
  };

  let items = data?.labelsets?.edges ? data.labelsets.edges : [];
  let options = items.map((labelsetEdge, index) => {
    const node = labelsetEdge.node;
    return {
      key: node.id,
      text: node.title,
      value: node.id,
      content: (
        <Header
          key={index}
          image={node.icon}
          content={node.title}
          subheader={node.description}
        />
      ),
    };
  });

  return (
    <div style={{ width: "100%" }}>
      <Header as="h5" attached="top">
        Label Set:
      </Header>
      <Segment attached>
        <Dimmer active={loading}>
          <Loader content="Loading Label Sets..." />
        </Dimmer>
        <Dropdown
          disabled={read_only}
          selection
          clearable
          fluid
          options={options}
          style={{ ...style }}
          onChange={handleChange}
          placeholder="Choose a label set"
          value={labelSet?.id}
        />
      </Segment>
    </div>
  );
};
