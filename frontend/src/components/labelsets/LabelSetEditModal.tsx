import React, { useState } from "react";
import styled from "styled-components";
import {
  Button,
  Modal,
  Header,
  Icon,
  Card,
  Dimmer,
  Loader,
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
} from "../../types/graphql-api";
import {
  newLabelSetForm_Schema,
  newLabelSetForm_Ui_Schema,
} from "../forms/schemas";
import { toast } from "react-toastify";
import { getPermissions } from "../../utils/transform";
import { PermissionTypes } from "../types";

const fuse_options = {
  includeScore: false,
  findAllMatches: true,
  keys: ["label", "description"],
};

interface LabelSetEditModalProps {
  open: boolean;
  toggleModal: () => any;
}

interface StyledModalProps {
  className?: string;
}

const StyledModal = styled(Modal)<StyledModalProps>`
  &&& {
    max-width: 90vw;
    width: 1200px;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
    margin: 2rem auto;
    height: calc(100vh - 4rem) !important;
    display: flex !important;
    flex-direction: column;

    > .header {
      flex: 0 0 auto;
      padding: 1rem 1.5rem;
      border-bottom: 1px solid #e9ecef;
      margin: 0 !important;

      h2 {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0;
        font-size: 1.1rem;
        color: #2d3748;

        i.icon {
          font-size: 1.1em;
          margin: 0;
          color: #4a5568;
        }
      }
    }

    > .content {
      flex: 1 1 auto;
      margin: 0 !important;
      padding: 0 !important;
      min-height: 0;
      display: flex !important;
      flex-direction: column;
    }

    > .actions {
      flex: 0 0 auto;
      border-top: 1px solid #e9ecef;
      padding: 0.75rem 1.5rem;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin: 0 !important;
      background: #fff;
    }
  }
`;

const ContentLayout = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
`;

const SidebarList = styled.div`
  width: 240px;
  border-right: 1px solid #e9ecef;
  background: #f8f9fa;
  overflow-y: auto;
  flex: 0 0 auto;
`;

const MainContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #fff;
`;

const SearchBarContainer = styled.div`
  padding: 1rem;
  border-bottom: 1px solid #e9ecef;
  flex: 0 0 auto;
  background: #fff;
`;

const ContentArea = styled.div`
  flex: 1;
  padding: 1rem;
  overflow-y: auto;
  min-height: 0;

  .crud-container {
    > div {
      form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
    }
  }
`;

interface ListItemProps {
  active?: boolean;
}

const ListItem = styled.div<ListItemProps>`
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  border-left: 3px solid transparent;
  user-select: none;

  ${(props) =>
    props.active &&
    `
    background: #fff;
    border-left-color: #3182ce;
    font-weight: 500;
  `}

  &:hover:not([active]) {
    background: #edf2f7;
  }

  i.icon {
    width: 16px;
    color: #4a5568;
    font-size: 1rem;
  }

  .label-count {
    margin-left: auto;
    font-size: 0.85rem;
    color: #718096;
    background: ${(props) => (props.active ? "#ebf8ff" : "#edf2f7")};
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
  }
`;

const CardGroup = styled(Card.Group)`
  margin: 0.5rem 0 0 0;
  width: 100%;
  gap: 0.75rem;
`;

const EmptyStateMessage = styled(Message)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  text-align: center;
  background: #f8fafc;
  border: 1px dashed #e2e8f0;
  border-radius: 8px;
  box-shadow: none;
  margin: 1rem 0;

  i.icon {
    color: #a0aec0;
    margin-bottom: 0.75rem;
  }

  .content {
    .header {
      color: #4a5568;
      font-size: 1.1rem;
      margin-bottom: 0.5rem;
    }

    p {
      color: #718096;
      font-size: 0.9rem;
      margin: 0;
    }
  }
`;

const ActionButton = styled(Button)`
  transition: all 0.2s ease;
  padding: 0.6rem 1rem !important;

  &.basic {
    box-shadow: 0 0 0 1px #cbd5e0 inset;

    &:hover {
      box-shadow: 0 0 0 1px #a0aec0 inset;
      background: #f7fafc !important;
    }
  }

  &.green {
    background: #38a169;

    &:hover {
      background: #2f855a;
    }
  }

  i.icon {
    margin-right: 6px !important;
    font-size: 0.9em !important;
  }
`;

export const LabelSetEditModal = ({
  open,
  toggleModal,
}: LabelSetEditModalProps) => {
  const opened_labelset = useReactiveVar(openedLabelset);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [activeIndex, setActiveIndex] = useState<number>(0);
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
        <Modal.Content>
          <Dimmer active={true}>
            <Loader
              content={create_loading ? "Updating..." : "Loading labels..."}
            />
          </Dimmer>
        </Modal.Content>
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

  const renderContent = () => {
    switch (activeIndex) {
      case 0:
        return (
          <div className="crud-container">
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
                _.isEmpty(updatedObject) ? opened_labelset || {} : updatedObject
              }
              showHeader
              acceptedFileTypes=".png,.jpg"
              handleInstanceChange={onCRUDChange}
              fileIsImage
              fileField="icon"
              fileLabel="Labelset Icon"
            />
          </div>
        );
      case 1:
        return renderLabelCards(metadata_label_results);
      case 2:
        return renderLabelCards(text_label_results);
      case 3:
        return renderLabelCards(doc_label_results);
      case 4:
        return renderLabelCards(relationship_label_results);
      case 5:
        return renderLabelCards(span_label_results);
      default:
        return null;
    }
  };

  const menuItems = [
    { key: 0, icon: "bars", label: "Details" },
    {
      key: 1,
      icon: "braille",
      label: "Metadata",
      count: metadata_label_results.length,
    },
    {
      key: 2,
      icon: "language",
      label: "Text",
      count: text_label_results.length,
    },
    {
      key: 3,
      icon: "file pdf outline",
      label: "Document Types",
      count: doc_label_results.length,
    },
    {
      key: 4,
      icon: "handshake outline",
      label: "Relations",
      count: relationship_label_results.length,
    },
    {
      key: 5,
      icon: "i cursor",
      label: "Spans",
      count: span_label_results.length,
    },
  ];

  const button_actions: DropdownActionProps[] = [];

  if (
    activeIndex !== 0 &&
    my_permissions.includes(PermissionTypes.CAN_UPDATE)
  ) {
    button_actions.push({
      key: "create_new_label",
      color: "gray",
      title: (() => {
        switch (activeIndex) {
          case 1:
            return "Create Metadata Field";
          case 2:
            return "Create Text Label";
          case 3:
            return "Create Document Type Label";
          case 4:
            return "Create Relationship Label";
          case 5:
            return "Create Span Label";
          default:
            return "";
        }
      })(),
      icon: "plus",
      action_function: (() => {
        switch (activeIndex) {
          case 1:
            return handleCreateMetadataLabel;
          case 2:
            return handleCreateTextLabel;
          case 3:
            return handleCreateDocumentLabel;
          case 4:
            return handleCreateRelationshipLabel;
          case 5:
            return handleCreateSpanLabel;
          default:
            return () => {};
        }
      })(),
    });
  }

  if (
    selectedLabels?.length > 0 &&
    my_permissions.includes(PermissionTypes.CAN_UPDATE)
  ) {
    button_actions.push({
      key: "delete_selected",
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
            size="large"
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
      <Modal.Content>
        <ContentLayout>
          <SidebarList>
            {menuItems.map((item) => (
              <ListItem
                key={item.key}
                active={activeIndex === item.key}
                onClick={() => setActiveIndex(item.key)}
              >
                <Icon name={item.icon as any} />
                {item.label}
                {item.count !== undefined && (
                  <span className="label-count">{item.count}</span>
                )}
              </ListItem>
            ))}
          </SidebarList>
          <MainContent>
            <SearchBarContainer>
              <CreateAndSearchBar
                onChange={(value) => setSearchTerm(value)}
                actions={button_actions}
                placeholder="Search for label by description or name..."
                value={searchTerm}
              />
            </SearchBarContainer>
            <ContentArea>{renderContent()}</ContentArea>
          </MainContent>
        </ContentLayout>
      </Modal.Content>
      <Modal.Actions>
        <ActionButton basic onClick={() => toggleModal()}>
          <Icon name="remove" /> Close
        </ActionButton>
        {canSave && (
          <ActionButton color="green" onClick={() => handleSave()}>
            <Icon name="checkmark" /> Save
          </ActionButton>
        )}
      </Modal.Actions>
    </StyledModal>
  );
};
