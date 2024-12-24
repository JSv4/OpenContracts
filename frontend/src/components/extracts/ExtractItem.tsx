import { useMutation } from "@apollo/client";
import { toast } from "react-toastify";
import { Button, Card, Dimmer, Icon, Label, Loader } from "semantic-ui-react";
import {
  RequestDeleteExtractInputType,
  RequestDeleteExtractOutputType,
  REQUEST_DELETE_EXTRACT,
} from "../../graphql/mutations";
import { GetExtractsOutput, GET_EXTRACTS } from "../../graphql/queries";
import { ExtractType, CorpusType } from "../../types/graphql-api";

import _ from "lodash";
import { PermissionTypes } from "../types";
import { getPermissions } from "../../utils/transform";
import useWindowDimensions from "../hooks/WindowDimensionHook";
import { MOBILE_VIEW_BREAKPOINT } from "../../assets/configurations/constants";

interface ExtractItemProps {
  extract: ExtractType;
  selected?: boolean;
  read_only?: boolean;
  corpus?: CorpusType | null | undefined;
  compact?: boolean;
  onSelect?: () => any | never;
}

export const ExtractItem = ({
  extract,
  selected,
  read_only,
  corpus: selectedCorpus,
  onSelect,
  compact,
}: ExtractItemProps) => {
  const { width } = useWindowDimensions();
  const use_mobile_layout = width <= MOBILE_VIEW_BREAKPOINT;

  const [requestDeleteExtract] = useMutation<
    RequestDeleteExtractOutputType,
    RequestDeleteExtractInputType
  >(REQUEST_DELETE_EXTRACT, {
    variables: {
      id: extract.id,
    },
    onCompleted: (data) => {
      toast.success("Extract deleting...");
    },
    onError: (data) => {
      toast.error("Could not delete extract...");
    },
    update: (cache, { data: delete_extract_data }) => {
      if (!selectedCorpus?.id) return;

      try {
        const cache_data: GetExtractsOutput | null = cache.readQuery({
          query: GET_EXTRACTS,
          variables: { corpusId: selectedCorpus.id },
        });

        if (cache_data?.extracts?.edges) {
          const new_cache_data = _.cloneDeep(cache_data);
          new_cache_data.extracts.edges = new_cache_data.extracts.edges.filter(
            (edge) => edge.node.id !== extract.id
          );

          cache.writeQuery({
            query: GET_EXTRACTS,
            variables: { corpusId: selectedCorpus.id },
            data: new_cache_data,
          });
        }
      } catch (error) {
        console.warn("Failed to update cache after extract deletion:", error);
      }
    },
  });

  const my_permissions = getPermissions(
    extract.myPermissions ? extract.myPermissions : []
  );
  const can_delete = my_permissions.includes(PermissionTypes.CAN_REMOVE);

  const cardContent = (
    <>
      <Card.Content>
        {!read_only && can_delete && (
          <div
            style={{
              position: "absolute",
              bottom: ".5vh",
              right: ".5vh",
              cursor: "pointer",
            }}
          >
            <Button
              circular
              icon="trash"
              color="red"
              onClick={(e) => {
                e.stopPropagation();
                requestDeleteExtract();
              }}
            />
          </div>
        )}
        {!extract.finished && (
          <Dimmer active inverted>
            <Loader inverted>Processing...</Loader>
          </Dimmer>
        )}
        <Icon name="grid layout" size="big" />
        <Card.Header style={{ wordBreak: "break-all" }}>
          {extract.name}
        </Card.Header>
        <Card.Meta>
          <span className="date">
            Created: {new Date(extract.created).toLocaleDateString()}
          </span>
        </Card.Meta>
        {!compact && (
          <Card.Description>
            {extract.fieldset?.description || "No description available"}
          </Card.Description>
        )}
      </Card.Content>
      <Card.Content extra>
        <Label>
          <Icon name="file" />
          {extract.fullDocumentList?.length || 0} Documents
        </Label>
        <Label>
          <Icon name="table" />
          {extract.fieldset?.fullColumnList?.length || 0} Columns
        </Label>
      </Card.Content>
    </>
  );

  return (
    <Card
      raised
      onClick={onSelect && extract.finished ? onSelect : undefined}
      style={{
        padding: ".5em",
        margin: ".75em",
        ...(use_mobile_layout ? { width: "200px" } : { minWidth: "300px" }),
        ...(selected ? { backgroundColor: "#e2ffdb" } : {}),
      }}
    >
      {extract.corpusAction && (
        <Label attached="top" color="green" size="tiny">
          <Icon name="cog" /> Action - {extract.corpusAction.name}
        </Label>
      )}
      {cardContent}
    </Card>
  );
};
