import React, { useState } from "react";
import {
  Button,
  Modal,
  Header,
  Icon,
  Card,
  Segment,
  Tab,
  Dimmer,
  Loader,
  TabProps,
  Message,
} from "semantic-ui-react";
import _ from "lodash";
import Fuse from "fuse.js";
import { AnnotationLabelCard } from "./AnnotationLabelCard";
import { CRUDWidget } from "../widgets/CRUD/CRUDWidget";
import { useQuery, useMutation, useReactiveVar } from "@apollo/client";
import {
  GetLabelsetWithLabelsInputs,
  GetLabelsetWithLabelsOutputs,
  GET_LABELSET_WITH_ALL_LABELS,
} from "../../graphql/queries";
import {
  CreateLabelsetOutputs,
  CreateLabelsetInputs,
  CREATE_LABELSET,
  UpdateAnnotationLabelInputs,
  UpdateAnnotationLabelOutputs,
  UPDATE_ANNOTATION_LABEL,
  DeleteMultipleAnnotationLabelOutputs,
  DeleteMultipleAnnotationLabelInputs,
  DELETE_MULTIPLE_ANNOTATION_LABELS,
  CreateAnnotationLabelForLabelsetOutputs,
  CreateAnnotationLabelForLabelsetInputs,
  CREATE_ANNOTATION_LABEL_FOR_LABELSET,
} from "../../graphql/mutations";
import {
  CreateAndSearchBar,
  DropdownActionProps,
} from "../layout/CreateAndSearchBar";
import { openedLabelset } from "../../graphql/cache";
import {
  AnnotationLabelType,
  LabelSetType,
  LabelType,
} from "../../graphql/types";
import {
  newLabelSetForm_Schema,
  newLabelSetForm_Ui_Schema,
} from "../forms/schemas";
import { toast } from "react-toastify";
import { getPermissions } from "../../utils/transform";
import { PermissionTypes } from "../types";
import styled from "styled-components";

const fuse_options = {
  includeScore: false,
  findAllMatches: true,
  keys: ["label", "description"],
};

interface LabelSetEditModalProps {
  open: boolean;
  toggleModal: () => any;
}

const StyledModal = styled(Modal)`
  &&& {
    max-width: 90vw;
    width: 1200px;
    border-radius: 12px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
  }
`;

const ModalContent = styled(Modal.Content)`
  &&& {
    padding: 2rem;
  }
`;

const TabContainer = styled(Tab)`
  &&& {
    height: 60vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
`;

const TabPane = styled(Tab.Pane)`
  &&& {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    max-width: 100%;
  }
`;

const SearchBarContainer = styled.div`
  margin-bottom: 1rem;
`;

const CardGroup = styled(Card.Group)`
  &&& {
    margin-top: 1rem;
    width: 100%;
  }
`;

const EmptyStateMessage = styled(Message)`
  &&& {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    text-align: center;
  }
`;

const ScrollableTabPane = styled(TabPane)`
  &&& {
    overflow-y: auto;
    max-height: calc(60vh - 2rem); // Adjust this value as needed
  }
`;

export const LabelSetEditModal = ({
  open,
  toggleModal,
}: LabelSetEditModalProps) => {
  const opened_labelset = useReactiveVar(openedLabelset);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [activeIndex, setActiveIndex] = useState<number | string>(0);
  const [updatedObject, setUpdatedObject] = useState<LabelSetType | {}>({});
  const [changedValues, setChangedValues] = useState<LabelSetType | {}>({});
  const [canSave, setCanSave] = useState<boolean>(false);
  const [selectedLabels, setSelectedLabels] = useState<AnnotationLabelType[]>(
    []
  );

  let my_permissions = getPermissions(
    opened_labelset?.myPermissions ? opened_labelset.myPermissions : []
  );

  const [createAnnotationLabelForLabelset] = useMutation<
    CreateAnnotationLabelForLabelsetOutputs,
    CreateAnnotationLabelForLabelsetInputs
  >(CREATE_ANNOTATION_LABEL_FOR_LABELSET);

  const [mutateLabelset, { loading: create_loading }] = useMutation<
    CreateLabelsetOutputs,
    CreateLabelsetInputs
  >(CREATE_LABELSET);

  const [mutateAnnotationLabel] = useMutation<
    UpdateAnnotationLabelOutputs,
    UpdateAnnotationLabelInputs
  >(UPDATE_ANNOTATION_LABEL);

  const [deleteMultipleLabels] = useMutation<
    DeleteMultipleAnnotationLabelOutputs,
    DeleteMultipleAnnotationLabelInputs
  >(DELETE_MULTIPLE_ANNOTATION_LABELS);

  const {
    refetch,
    loading: label_set_loading,
    error: label_set_fetch_error,
    data: label_set_data,
  } = useQuery<GetLabelsetWithLabelsOutputs, GetLabelsetWithLabelsInputs>(
    GET_LABELSET_WITH_ALL_LABELS,
    {
      variables: {
        id: opened_labelset?.id ? opened_labelset.id : "",
      },
      notifyOnNetworkStatusChange: true,
    }
  );

  if (label_set_fetch_error || label_set_loading) {
    return (
      <StyledModal closeIcon open={open} onClose={() => toggleModal()}>
        <ModalContent>
          <Dimmer active={true}>
            <Loader
              content={create_loading ? "Updating..." : "Loading labels..."}
            />
          </Dimmer>
        </ModalContent>
      </StyledModal>
    );
  }

  const labels: AnnotationLabelType[] = label_set_data?.labelset
    ?.allAnnotationLabels
    ? (label_set_data.labelset.allAnnotationLabels.filter(
        (item) => item!!
      ) as AnnotationLabelType[])
    : [];

  const handleDeleteLabel = (labels: AnnotationLabelType[]) => {
    deleteMultipleLabels({
      variables: { labelIdsToDelete: labels.map((label) => label.id) },
    })
      .then((data) => {
        refetch();
      })
      .catch((err) => {
        console.log("Error deleting label", err);
      });
  };

  const handleCreateMetadataLabel = () => {
    createAnnotationLabelForLabelset({
      variables: {
        color: "00000",
        description: "New field to hold user-entered values",
        icon: "braille",
        text: "Custom Field Name",
        labelType: LabelType.MetadataLabel,
        labelsetId: opened_labelset?.id ? opened_labelset.id : "",
      },
    })
      .then((data) => {
        toast.success("Success! Label created.");
        refetch();
      })
      .catch((err) => {
        toast.error("Error! Failed to create label");
        console.log("Error creating new metdata value label", err);
      });
  };

  const handleCreateTextLabel = () => {
    createAnnotationLabelForLabelset({
      variables: {
        color: "00000",
        description: "New label",
        icon: "tag",
        text: "New Label",
        labelType: LabelType.TokenLabel,
        labelsetId: opened_labelset?.id ? opened_labelset.id : "",
      },
    })
      .then((data) => {
        toast.success("Success! Label created.");
        refetch();
      })
      .catch((err) => {
        toast.error("Error! Failed to create label");
        console.log("Error creating new text / span label", err);
      });
  };

  const handleCreateDocumentLabel = () => {
    createAnnotationLabelForLabelset({
      variables: {
        color: "00000",
        description: "New label",
        icon: "tag",
        text: "New Label",
        labelType: LabelType.DocTypeLabel,
        labelsetId: opened_labelset?.id ? opened_labelset.id : "",
      },
    })
      .then(() => refetch())
      .catch((err) => {
        console.log("Error creating document label: ", err);
      });
  };

  const handleCreateRelationshipLabel = () => {
    createAnnotationLabelForLabelset({
      variables: {
        color: "00000",
        description: "New label",
        icon: "tag",
        text: "New Label",
        labelType: LabelType.RelationshipLabel,
        labelsetId: opened_labelset?.id ? opened_labelset.id : "",
      },
    })
      .then(() => refetch())
      .catch((err) => {
        console.log("Error trying to create relationship label: ", err);
      });
  };

  const handleCreateSpanLabel = () => {
    createAnnotationLabelForLabelset({
      variables: {
        color: "00000",
        description: "New span label",
        icon: "tag",
        text: "New Span Label",
        labelType: LabelType.SpanLabel,
        labelsetId: opened_labelset?.id ? opened_labelset.id : "",
      },
    })
      .then(() => refetch())
      .catch((err) => {
        console.log("Error trying to create span label: ", err);
      });
  };

  const updateLabelSet = (obj: LabelSetType) => {
    mutateLabelset({ variables: { ...obj } })
      .then(() => refetch())
      .catch((err) => {
        console.log("Error updating labelset: ", err);
      });
  };

  const updateLabel = (obj: UpdateAnnotationLabelInputs) => {
    mutateAnnotationLabel({ variables: { ...obj } })
      .then((data) => {
        refetch();
      })
      .catch((err) => {
        console.log("Error updating label", err);
      });
  };

  const onCRUDChange = (labelsetData: LabelSetType) => {
    setChangedValues({ ...changedValues, ...labelsetData });
    setUpdatedObject({ ...opened_labelset, ...updatedObject, ...labelsetData });
    setCanSave(true);
  };

  const handleTabChange = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
    data: TabProps
  ) => setActiveIndex(data?.activeIndex ? data.activeIndex : 0);

  const handleSave = () => {
    updateLabelSet({
      id: opened_labelset?.id ? opened_labelset.id : "",
      ...changedValues,
    });
    setChangedValues({});
    setUpdatedObject(opened_labelset ? opened_labelset : {});
    setCanSave(false);
    setSearchTerm("");
    setActiveIndex(0);
    toggleModal();
  };

  const toggleLabelSelect = (label: AnnotationLabelType) => {
    if (selectedLabels.map((label) => label.id).includes(label.id)) {
      setSelectedLabels(_.remove(selectedLabels, { id: label.id }));
    } else {
      setSelectedLabels([...selectedLabels, label]);
    }
  };

  let text_labels = labels.filter(
    (label): label is AnnotationLabelType =>
      !!label && label !== undefined && label.labelType === LabelType.TokenLabel
  );
  let doc_type_labels = labels.filter(
    (label): label is AnnotationLabelType =>
      !!label && label.labelType === LabelType.DocTypeLabel
  );
  let relationship_labels = labels.filter(
    (label): label is AnnotationLabelType =>
      !!label && label.labelType === LabelType.RelationshipLabel
  );
  let metadata_labels = labels.filter(
    (label): label is AnnotationLabelType =>
      !!label && label.labelType === LabelType.MetadataLabel
  );
  let span_labels = labels.filter(
    (label): label is AnnotationLabelType =>
      !!label && label.labelType === LabelType.SpanLabel
  );

  let text_label_fuse = new Fuse(text_labels, fuse_options);
  let doc_label_fuse = new Fuse(doc_type_labels, fuse_options);
  let relationship_label_fuse = new Fuse(relationship_labels, fuse_options);
  let metadata_label_fuse = new Fuse(metadata_labels, fuse_options);
  let span_label_fuse = new Fuse(span_labels, fuse_options);

  let text_label_results: AnnotationLabelType[] = [];
  let doc_label_results: AnnotationLabelType[] = [];
  let relationship_label_results: AnnotationLabelType[] = [];
  let metadata_label_results: AnnotationLabelType[] = [];
  let span_label_results: AnnotationLabelType[] = [];

  if (searchTerm.length > 0) {
    text_label_results = text_label_fuse
      .search(searchTerm)
      .map((item) => item.item) as AnnotationLabelType[];
    doc_label_results = doc_label_fuse
      .search(searchTerm)
      .map((item) => item.item) as AnnotationLabelType[];
    relationship_label_results = relationship_label_fuse
      .search(searchTerm)
      .map((item) => item.item) as AnnotationLabelType[];
    metadata_label_results = metadata_label_fuse
      .search(searchTerm)
      .map((item) => item.item) as AnnotationLabelType[];
    span_label_results = span_label_fuse
      .search(searchTerm)
      .map((item) => item.item) as AnnotationLabelType[];
  } else {
    text_label_results = text_labels;
    doc_label_results = doc_type_labels;
    relationship_label_results = relationship_labels;
    metadata_label_results = metadata_labels;
    span_label_results = span_labels;
  }

  const renderLabelCards = (labels: AnnotationLabelType[]) => {
    if (labels.length === 0) {
      return (
        <EmptyStateMessage icon>
          <Icon name="search" size="huge" />
          <Message.Content>
            <Message.Header>No matching labels found</Message.Header>
            <p>Try adjusting your search or create a new label.</p>
          </Message.Content>
        </EmptyStateMessage>
      );
    }

    return (
      <CardGroup itemsPerRow={1}>
        {labels.map((label, index) => (
          <AnnotationLabelCard
            key={label.id}
            label={label}
            selected={selectedLabels
              .map((label) => label.id)
              .includes(label.id)}
            onDelete={() => handleDeleteLabel([label])}
            onSelect={toggleLabelSelect}
            onSave={updateLabel}
          />
        ))}
      </CardGroup>
    );
  };

  const panes = [
    {
      menuItem: {
        key: "description",
        icon: "bars",
        content: "Details",
      },
      render: () => (
        <ScrollableTabPane>
          <CRUDWidget
            hasFile
            mode={
              my_permissions.includes(PermissionTypes.CAN_UPDATE)
                ? "EDIT"
                : "VIEW"
            }
            modelName="Label Set"
            dataSchema={newLabelSetForm_Schema}
            uiSchema={newLabelSetForm_Ui_Schema}
            instance={
              _.isEmpty(updatedObject)
                ? opened_labelset
                  ? opened_labelset
                  : {}
                : updatedObject
            }
            showHeader
            acceptedFileTypes=".png,.jpg"
            handleInstanceChange={onCRUDChange}
            fileIsImage
            fileField="icon"
            fileLabel="Labelset Icon"
          />
        </ScrollableTabPane>
      ),
    },
    {
      menuItem: {
        key: "metadata",
        icon: "braille",
        content: `Metadata (${metadata_label_results.length})`,
      },
      render: () => (
        <TabPane>{renderLabelCards(metadata_label_results)}</TabPane>
      ),
    },
    {
      menuItem: {
        key: "text",
        icon: "language",
        content: `Text (${text_label_results.length})`,
      },
      render: () => <TabPane>{renderLabelCards(text_label_results)}</TabPane>,
    },
    {
      menuItem: {
        key: "doc",
        icon: "file pdf outline",
        content: `Doc Types (${doc_label_results.length})`,
      },
      render: () => <TabPane>{renderLabelCards(doc_label_results)}</TabPane>,
    },
    {
      menuItem: {
        key: "relation",
        icon: "handshake outline",
        content: `Relations (${relationship_label_results.length})`,
      },
      render: () => (
        <TabPane>{renderLabelCards(relationship_label_results)}</TabPane>
      ),
    },
    {
      menuItem: {
        key: "span",
        icon: "i cursor",
        content: `Spans (${span_label_results.length})`,
      },
      render: () => <TabPane>{renderLabelCards(span_label_results)}</TabPane>,
    },
  ];

  let button_actions: DropdownActionProps[] = [];

  if (
    [1, 2, 3, 4, 5].includes(parseInt(`${activeIndex}`)) &&
    my_permissions.includes(PermissionTypes.CAN_UPDATE)
  ) {
    button_actions.push({
      key: `label_edit_modal_action_0`,
      color: "gray",
      title:
        activeIndex === 1
          ? "Create Metadata Field"
          : activeIndex === 2
          ? "Create Text Label"
          : activeIndex === 3
          ? "Create Document Type Label"
          : activeIndex === 4
          ? "Create Relationship Label"
          : activeIndex === 5
          ? "Create Span Label"
          : "",
      icon: "plus",
      action_function:
        activeIndex === 1
          ? () => handleCreateMetadataLabel()
          : activeIndex === 2
          ? () => handleCreateTextLabel()
          : activeIndex === 3
          ? () => handleCreateDocumentLabel()
          : activeIndex === 4
          ? () => handleCreateRelationshipLabel()
          : activeIndex === 5
          ? () => handleCreateSpanLabel()
          : () => {},
    });
  }
  if (
    selectedLabels?.length > 0 &&
    my_permissions.includes(PermissionTypes.CAN_UPDATE)
  ) {
    button_actions.push({
      key: `label_edit_modal_action_${button_actions.length}`,
      color: "red",
      title: "Delete Selected Label(s)",
      icon: "remove circle",
      action_function: () => handleDeleteLabel(selectedLabels),
    });
  }

  return (
    <StyledModal closeIcon open={open} onClose={() => toggleModal()}>
      {(label_set_loading || create_loading) && (
        <Dimmer active={true}>
          <Loader
            content={create_loading ? "Updating..." : "Loading labels..."}
          />
        </Dimmer>
      )}
      <Modal.Header>
        <Header as="h2">
          <Icon name="tags" />
          <Header.Content>
            Edit Label Set:{" "}
            {updatedObject ? (updatedObject as LabelSetType).title : ""}
          </Header.Content>
        </Header>
      </Modal.Header>
      <ModalContent>
        <SearchBarContainer>
          <CreateAndSearchBar
            onChange={(value) => setSearchTerm(value)}
            actions={button_actions}
            placeholder="Search for label by description or name..."
            value={searchTerm}
          />
        </SearchBarContainer>
        <TabContainer
          menu={{
            pointing: true,
            secondary: true,
            fluid: true,
            vertical: true,
          }}
          panes={panes}
          activeIndex={activeIndex}
          onTabChange={handleTabChange}
        />
      </ModalContent>
      <Modal.Actions>
        <Button basic color="grey" onClick={() => toggleModal()}>
          <Icon name="remove" /> Close
        </Button>
        {canSave && (
          <Button color="green" onClick={() => handleSave()}>
            <Icon name="checkmark" /> Save
          </Button>
        )}
      </Modal.Actions>
    </StyledModal>
  );
};
