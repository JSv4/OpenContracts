import { useState } from "react";
import { CorpusItem } from "./CorpusItem";

import { useMutation, useReactiveVar } from "@apollo/client";
import {
  viewingCorpus,
  editingCorpus,
  openedCorpus,
  selectedCorpusIds,
  deletingCorpus,
} from "../../graphql/cache";

import { Card, Dimmer, Loader } from "semantic-ui-react";

import { PlaceholderCard } from "../placeholders/PlaceholderCard";
import { CorpusType, PageInfo } from "../../graphql/types";
import {
  StartExportCorpusInputs,
  StartExportCorpusOutputs,
  START_EXPORT_CORPUS,
  StartForkCorpusInput,
  StartForkCorpusOutput,
  START_FORK_CORPUS,
} from "../../graphql/mutations";
import { toast } from "react-toastify";
import { FetchMoreOnVisible } from "../widgets/infinite_scroll/FetchMoreOnVisible";

interface CorpusCardsProps {
  fetchMore: (args?: any) => void | any;
  items: CorpusType[] | null;
  pageInfo: PageInfo | undefined;
  loading: boolean;
  loading_message: string;
  style?: Record<string, any>;
}

export const CorpusCards = ({
  fetchMore,
  loading,
  items,
  loading_message,
  pageInfo,
  style,
}: CorpusCardsProps) => {
  const [contextMenuOpen, setContextMenuOpen] = useState<string | null>(null);
  const selected_corpus_ids = useReactiveVar(selectedCorpusIds);

  const handleUpdate = () => {
    console.log("Handle update");
    if (!loading && pageInfo?.hasNextPage) {
      console.log("Cursor should be: ", pageInfo.endCursor);
      fetchMore({
        variables: {
          limit: 20,
          cursor: pageInfo.endCursor,
        },
      });
    }
  };

  const [startForkCorpus, {}] = useMutation<
    StartForkCorpusOutput,
    StartForkCorpusInput
  >(START_FORK_CORPUS, {
    onCompleted: (data) => {
      toast.success(
        "SUCCESS! Fork started. Refresh the corpus page to view fork progress."
      );
    },
    onError: (err) => {
      toast.error("ERROR! Could not start corpus fork.");
    },
  });

  const triggerCorpusFork = (corpusId: string) => {
    startForkCorpus({ variables: { corpusId } });
  };

  const [startExportCorpus, {}] = useMutation<
    StartExportCorpusOutputs,
    StartExportCorpusInputs
  >(START_EXPORT_CORPUS, {
    onCompleted: (data) => {
      toast.success(
        "SUCCESS! Export started. Check export status under the user menu dropdown in the top right."
      );
    },
    onError: (err) => {
      toast.error("ERROR! Could not start corpus export.");
    },
  });

  const triggerCorpusExport = (corpusId: string) => {
    startExportCorpus({ variables: { corpusId } });
  };

  const toggleCorpusSelect = (id: string) => {
    if (selectedCorpusIds().includes(id)) {
      const values = [...selectedCorpusIds()];
      const index = values.indexOf(id);
      if (index > -1) {
        values.splice(index, 1);
      }
      selectedCorpusIds(values);
    } else {
      selectedCorpusIds([...selected_corpus_ids, id]);
    }
  };

  let cards: JSX.Element[] = [
    <PlaceholderCard key="Placeholder" description="No Matching Corpuses..." />,
  ];

  if (items && items.length > 0) {
    cards = items.map((item, index) => {
      return (
        <CorpusItem
          key={item.id}
          item={item}
          contextMenuOpen={contextMenuOpen}
          setContextMenuOpen={setContextMenuOpen}
          onOpen={() => {
            openedCorpus(item);
          }}
          onSelect={() => toggleCorpusSelect(item.id)}
          onDelete={() => deletingCorpus(item)}
          onFork={() => triggerCorpusFork(item.id)}
          onExport={() => triggerCorpusExport(item.id)}
          onEdit={() => editingCorpus(item)}
          onView={() => viewingCorpus(item)}
        />
      );
    });
  }

  let comp_style = {
    width: "100%",
    padding: "1rem",
  };
  if (style) {
    comp_style = { ...comp_style, ...style };
  }

  return (
    <>
      <Dimmer active={loading}>
        <Loader content={loading_message} />
      </Dimmer>
      <div
        style={{
          flex: 1,
          width: "100%",
          overflow: "hidden",
        }}
      >
        <Card.Group itemsPerRow={4} style={comp_style}>
          {cards}
        </Card.Group>
        <FetchMoreOnVisible fetchMore={handleUpdate} />
      </div>
    </>
  );
};
