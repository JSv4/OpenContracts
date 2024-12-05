import { useState, useEffect, useCallback } from "react";
import {
  Button,
  Modal,
  Form,
  Loader,
  Dimmer,
  Segment,
  Header,
  Icon,
  Card,
  Image,
  Label,
  List,
  Message,
} from "semantic-ui-react";
import _ from "lodash";
import {
  LinkDocumentsToCorpusInputs,
  LinkDocumentsToCorpusOutputs,
  LINK_DOCUMENTS_TO_CORPUS,
} from "../../../graphql/mutations";
import { selectedDocumentIds } from "../../../graphql/cache";
import { useMutation, useQuery, useReactiveVar } from "@apollo/client";
import {
  GetCorpusesInputs,
  GetCorpusesOutputs,
  GET_CORPUSES,
} from "../../../graphql/queries";
import { CorpusType, DocumentType } from "../../../types/graphql-api";
import { toast } from "react-toastify";
import { getPermissions } from "../../../utils/transform";
import { PermissionTypes } from "../../types";
import { CorpusSelector } from "../../corpuses/CorpusSelector";

const SELECT_VIEW = "SELECT_VIEW";
const CONFIRM_VIEW = "CONFIRM_VIEW";
const STATUS_VIEW = "STATUS_VIEW";

interface AddToCorpusModalDocumentItemProps {
  document: DocumentType;
  onRemove: (args?: any) => any | void;
}

function AddToCorpusModalDocumentItem({
  document,
  onRemove,
}: AddToCorpusModalDocumentItemProps) {
  return (
    <List.Item>
      <div style={{ float: "right" }}>
        <Icon name="trash" color="red" onClick={onRemove} />
      </div>
      <List.Icon
        name="file alternate"
        size="large"
        color="blue"
        verticalAlign="middle"
      />
      <List.Content>
        <List.Header>{document.title}</List.Header>
        <List.Description>
          <Label>
            <Icon name="at" />
            Author: {document?.creator?.email}
          </Label>
        </List.Description>
      </List.Content>
    </List.Item>
  );
}

interface AddToCorpusModalCorpusItem {
  corpus: CorpusType;
  selected: boolean;
  onClick: (args?: any) => any | void;
}
function CorpusItem({ corpus, selected, onClick }: AddToCorpusModalCorpusItem) {
  // console.log("Make a corpus item for corpus: ", corpus);
  return (
    <Card
      style={selected ? { backgroundColor: "#e2ffdb" } : {}}
      onClick={() => onClick(corpus)}
    >
      <Card.Content>
        <Image floated="right" size="mini" src={corpus?.icon} />
        <Card.Header>{corpus?.title}</Card.Header>
        <Card.Meta>
          <em>Author: </em>
          {corpus?.creator?.email}
        </Card.Meta>
        <Card.Description>{corpus?.description}</Card.Description>
      </Card.Content>
      <Card.Content extra>
        <Label>
          <Icon name="file text outline" /> # Documents
        </Label>
        <Label>
          <Icon name="tags" /> Label Set:{" "}
          {corpus?.labelSet?.title ? corpus.labelSet.title : "N/A"}
        </Label>
      </Card.Content>
    </Card>
  );
}

interface AddToCorpusModalConfirmDocumentsProps {
  selected_documents: DocumentType[];
  onRemove: (args?: any) => any | void;
}

function AddToCorpusModalConfirmDocuments({
  selected_documents,
  onRemove,
}: AddToCorpusModalConfirmDocumentsProps) {
  const items = selected_documents.map((document) => {
    return (
      <AddToCorpusModalDocumentItem
        key={document.id}
        onRemove={() => onRemove(document)}
        document={document}
      />
    );
  });
  return (
    <List style={{ height: "100%", width: "100%" }} celled>
      {items}
    </List>
  );
}

interface AddToCorpusModalProps {
  open: boolean;
  documents: DocumentType[];
  toggleModal: (args?: any) => any | void;
}

export function AddToCorpusModal({
  open,
  documents,
  toggleModal,
}: AddToCorpusModalProps) {
  const selected_doc_ids = useReactiveVar(selectedDocumentIds);
  const [search_term, setSearchTerm] = useState("");
  const [view, setView] = useState<
    "SELECT_VIEW" | "CONFIRM_VIEW" | "STATUS_VIEW"
  >(SELECT_VIEW);
  const [selected_corpus, setSelectedCorpus] = useState<CorpusType | null>(
    null
  );
  const selected_documents = _.intersectionWith(
    documents,
    selected_doc_ids,
    (o, id) => o.id === id
  );

  // Debounce the search function
  const updateSearch = useCallback(
    _.debounce(setSearchTerm, 400, { maxWait: 1000 }),
    []
  );

  const [
    tryLinkDocuments,
    { loading: add_docs_loading, error: add_docs_error, data: add_docs_data },
  ] = useMutation<LinkDocumentsToCorpusOutputs, LinkDocumentsToCorpusInputs>(
    LINK_DOCUMENTS_TO_CORPUS,
    {
      onCompleted: (data) => {
        toast.success("SUCCESS! Added documents to Corpus.");
        selectedDocumentIds([]);
        toggleModal();
      },
      onError: (err) => {
        toast.error("ERROR! Could not add documents to Corpus.");
        toggleModal();
      },
    }
  );

  let corpus_variables = {
    textSearch: search_term,
  };
  const {
    refetch: refetch_corpuses,
    loading: corpus_loading,
    data: corpus_load_data,
    error: corpus_load_error,
  } = useQuery<GetCorpusesOutputs, GetCorpusesInputs>(GET_CORPUSES, {
    variables: corpus_variables,
    notifyOnNetworkStatusChange: true, // required to get loading signal on fetchMore
  });

  useEffect(() => {
    refetch_corpuses();
  }, [search_term]);

  useEffect(() => {
    refetch_corpuses();
  }, []);

  // console.log("Corpus load data", corpus_load_data);
  const corpuses = corpus_load_data?.corpuses?.edges
    ? corpus_load_data.corpuses.edges
        .map((edge) => (edge ? edge.node : undefined))
        .filter((item): item is CorpusType => !!item)
    : [];

  const toggleDocumentSelect = (document: DocumentType) => {
    if (_.find(selected_doc_ids, { id: document.id })) {
      const values = selected_doc_ids.filter((id) => id !== document.id);
      selectedDocumentIds(values);
    } else {
      selectedDocumentIds([...selected_doc_ids, document.id]);
    }
  };

  const handleAddDocsToCorpus = () => {
    tryLinkDocuments({
      variables: {
        corpusId: selected_corpus?.id ? selected_corpus.id : "",
        documentIds: selected_doc_ids,
      },
    });
  };

  const onClose = () => {
    setSearchTerm("");
    setView(SELECT_VIEW);
    selectedDocumentIds([]);
    setSelectedCorpus(null);
    toggleModal();
  };

  const goForward = () => {
    setView(CONFIRM_VIEW);
  };

  const goBackward = () => {
    setView(SELECT_VIEW);
  };

  const renderSwitch = (
    view: "SELECT_VIEW" | "CONFIRM_VIEW" | "STATUS_VIEW"
  ) => {
    if (view === SELECT_VIEW) {
      return (
        <CorpusSelector
          selected_corpus={selected_corpus}
          onClick={setSelectedCorpus}
          searchCorpus={refetch_corpuses}
          setSearchTerm={updateSearch}
          search_term={search_term}
          loading={corpus_loading}
          corpuses={corpuses}
        />
      );
    } else if (view === CONFIRM_VIEW) {
      return (
        <AddToCorpusModalConfirmDocuments
          selected_documents={selected_documents}
          onRemove={toggleDocumentSelect}
        />
      );
    } else if (view === STATUS_VIEW) {
      if (corpus_loading) {
        return (
          <Dimmer active inverted>
            <Loader inverted>Fetching Corpuses...</Loader>
          </Dimmer>
        );
      } else if (add_docs_loading) {
        return (
          <Dimmer active inverted>
            <Loader inverted>Adding to Corpus...</Loader>
          </Dimmer>
        );
      } else if (add_docs_data) {
        return (
          <Message positive>
            <Message.Header>Successfully Added to Corpus</Message.Header>
          </Message>
        );
      } else if (add_docs_error)
        return (
          <Message negative>
            <Message.Header>
              Sorry, Unable to Link These Documents
            </Message.Header>
          </Message>
        );
    } else {
      return <></>;
    }
  };

  const navButtons = (view: "SELECT_VIEW" | "CONFIRM_VIEW" | "STATUS_VIEW") => {
    let buttons = [
      <Button
        key="cancel"
        icon="cancel"
        content="Close"
        onClick={() => onClose()}
      />,
    ];
    switch (view) {
      case SELECT_VIEW:
        return [
          ...buttons,
          <Button
            key="SelectButton"
            labelPosition="right"
            icon="right chevron"
            content="Select"
            color="green"
            onClick={() => goForward()}
          />,
        ];
      case CONFIRM_VIEW:
        return [
          <Button
            key="BackButton"
            labelPosition="left"
            icon="left chevron"
            content="Back"
            color="red"
            onClick={() => goBackward()}
          />,
          ...buttons,
          <Button
            key="ForwardButton"
            labelPosition="right"
            icon="linkify"
            content="Add"
            color="green"
            onClick={() => handleAddDocsToCorpus()}
          />,
        ];
      case STATUS_VIEW:
        return buttons;
      default:
        return buttons;
    }
  };

  const modalHeader = (
    view: "SELECT_VIEW" | "CONFIRM_VIEW" | "STATUS_VIEW"
  ) => {
    switch (view) {
      case SELECT_VIEW:
        return (
          <Header as="h2">
            <Icon name="file text outline" />
            <Header.Content>
              Add to Corpus
              <Header.Subheader>
                Add selected documents to a corpus
              </Header.Subheader>
            </Header.Content>
          </Header>
        );
      case CONFIRM_VIEW:
        return (
          <Header as="h2">
            <Icon name="file text outline" />
            <Header.Content>
              Confirm Selected Documents
              <Header.Subheader>
                Confirm you want to add the documents below to corpus
              </Header.Subheader>
            </Header.Content>
          </Header>
        );
      default:
        return <></>;
    }
  };

  return (
    <Modal closeIcon open={open} onClose={() => onClose()}>
      <div style={{ marginTop: "1rem", textAlign: "left" }}>
        {modalHeader(view)}
      </div>
      <Modal.Content>{renderSwitch(view)}</Modal.Content>
      <Modal.Actions>
        <Button.Group>{navButtons(view)}</Button.Group>
      </Modal.Actions>
    </Modal>
  );
}
