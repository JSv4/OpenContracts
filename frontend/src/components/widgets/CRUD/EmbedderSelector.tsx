import { useEffect } from "react";
import { useQuery } from "@apollo/client";
import {
  Header,
  Segment,
  Loader,
  Dimmer,
  Dropdown,
  Message,
} from "semantic-ui-react";
import {
  GetEmbeddersInput,
  GetEmbeddersOutput,
  GET_EMBEDDERS,
} from "../../../graphql/queries";
import { PipelineComponentType } from "../../../types/graphql-api";

interface EmbedderSelectorProps {
  read_only?: boolean;
  preferredEmbedder?: string;
  style?: Record<string, any>;
  onChange?: (values: any) => void;
}

/**
 * EmbedderSelector component displays a dropdown of available embedders
 * and allows the user to select a preferred embedder for a corpus.
 *
 * When an embedder is selected, it updates the preferredEmbedder property
 * with the className of the selected embedder.
 */
export const EmbedderSelector = ({
  onChange,
  read_only,
  style,
  preferredEmbedder,
}: EmbedderSelectorProps) => {
  const { loading, error, data } = useQuery<
    GetEmbeddersOutput,
    GetEmbeddersInput
  >(GET_EMBEDDERS);

  const handleChange = (_e: any, { value }: any) => {
    // If user has not actually changed the embedder, do nothing
    if (value === preferredEmbedder) return;

    // If user explicitly clears, value === undefined => preferredEmbedder null
    // Otherwise preferredEmbedder is the new value (the className)
    onChange?.({ preferredEmbedder: value ?? null });
  };

  const embedders = data?.pipelineComponents?.embedders || [];
  const hasEmbedders = embedders.length > 0;

  const options = embedders.map((embedder: PipelineComponentType) => ({
    key: embedder.className,
    text: embedder.title || embedder.name,
    value: embedder.className,
    content: (
      <Header
        image={embedder.author ? undefined : undefined} // Could add an icon based on author if needed
        content={embedder.title || embedder.name}
        subheader={`${embedder.description || ""} (${
          embedder.vectorSize || "Unknown"
        } dimensions)`}
      />
    ),
  }));

  return (
    <div style={{ width: "100%" }}>
      <Header as="h5" attached="top">
        Preferred Embedder:
      </Header>
      <Segment attached>
        <Dimmer active={loading} inverted>
          <Loader content="Loading embedders..." />
        </Dimmer>

        {error && (
          <Message negative compact size="tiny">
            <Message.Header>Failed to load embedders</Message.Header>
            <p>{error.message}</p>
          </Message>
        )}

        {!loading && !error && !hasEmbedders && (
          <Message info compact size="tiny">
            <Message.Header>No embedders available</Message.Header>
            <p>There are currently no embedders configured in the system.</p>
          </Message>
        )}

        <Dropdown
          disabled={read_only || loading || !hasEmbedders}
          selection
          clearable
          fluid
          options={options}
          style={{ ...style }}
          onChange={handleChange}
          placeholder={
            loading ? "Loading embedders..." : "Choose a preferred embedder"
          }
          value={preferredEmbedder}
          noResultsMessage="No embedders match your search"
          loading={loading}
        />
      </Segment>
    </div>
  );
};
