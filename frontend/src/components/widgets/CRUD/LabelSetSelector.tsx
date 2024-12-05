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
    notifyOnNetworkStatusChange: true, // required to get loading signal on fetchMore
  });

  // console.log("GET_LABELSETS", data);

  useEffect(() => {
    refetch();
  }, [search_term]);

  const handleChange = (e: any, { value }: any) => {
    if (onChange) onChange({ labelSet: value });
  };

  let items = data?.labelsets?.edges ? data.labelsets.edges : [];
  let options = items.map((labelset, index) => ({
    key: labelset.node.id,
    text: labelset.node.title,
    value: labelset.node.id,
    content: (
      <Header
        key={index}
        image={labelset.node.icon}
        content={labelset.node.title}
        subheader={labelset.node.description}
      />
    ),
  }));

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
