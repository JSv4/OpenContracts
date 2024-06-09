import { useEffect, useState } from "react";
import { Modal, Grid, Dimmer, Loader, Button } from "semantic-ui-react";
import QueryResultsViewer from "../../queries/QueryResultsViewer";
import { useQuery } from "@apollo/client";
import {
  GET_CORPUS_QUERY_DETAILS,
  GetCorpusQueryDetailsInputType,
  GetCorpusQueryDetailsOutputType,
} from "../../../graphql/queries";
import { CorpusQueryType } from "../../../graphql/types";

interface ViewQueryResultsModalProps {
  query_id: string;
  open: boolean;
  onClose: () => void;
}

export const ViewQueryResultsModal = ({
  query_id,
  open,
  onClose,
}: ViewQueryResultsModalProps) => {
  const [loadedQueryDetails, setLoadedQueryDetails] =
    useState<CorpusQueryType | null>(null);
  const { data, error, loading, startPolling, stopPolling, refetch } = useQuery<
    GetCorpusQueryDetailsOutputType,
    GetCorpusQueryDetailsInputType
  >(GET_CORPUS_QUERY_DETAILS, {
    variables: {
      id: query_id,
    },
  });

  // If job isn't actually done...
  useEffect(() => {
    if (data) {
      setLoadedQueryDetails(data.corpusQuery);
      if (data.corpusQuery.completed && !data.corpusQuery.failed) {
        startPolling(5000);
      } else {
        stopPolling();
      }
    } else {
      setLoadedQueryDetails(null);
      stopPolling();
    }
  }, [data]);

  useEffect(() => {
    refetch();
  }, [query_id]);

  return (
    <Modal open={open} onClose={onClose}>
      <Modal.Header>"Create a New Column"</Modal.Header>
      <Modal.Content>
        <Grid centered divided>
          <Grid.Column>
            <Grid.Row>
              {loading && !data ? (
                <Dimmer>
                  <Loader>Loading...</Loader>
                </Dimmer>
              ) : loadedQueryDetails === null ? (
                <p>ERROR!</p>
              ) : (
                <QueryResultsViewer query_obj={loadedQueryDetails} />
              )}
            </Grid.Row>
          </Grid.Column>
        </Grid>
      </Modal.Content>
      <Modal.Actions>
        <Button icon="cancel" content="Close" onClick={() => onClose()} />
      </Modal.Actions>
    </Modal>
  );
};
