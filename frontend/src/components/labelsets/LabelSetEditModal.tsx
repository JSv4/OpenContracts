import { useState } from "react";
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
import { HorizontallyCenteredDiv } from "../layout/Wrappers";
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

const fuse_options = {
  includeScore: false,
  findAllMatches: true,
  // Search in `label` and in `description` fields
  keys: ["label", "description"],
};

interface LabelSetEditModalProps {
  open: boolean;
  toggleModal: () => any;
}

export const LabelSetEditModal = ({
  open,
  toggleModal,
}: LabelSetEditModalProps) => {
  const opened_labelset = useReactiveVar(openedLabelset);
  console.log("Opened labelset", opened_labelset);

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
  console.log("my_permissions", my_permissions);

  const [createAnnotationLabelForLabelset, {}] = useMutation<
    CreateAnnotationLabelForLabelsetOutputs,
    CreateAnnotationLabelForLabelsetInputs
  >(CREATE_ANNOTATION_LABEL_FOR_LABELSET);

  const [
    mutateLabelset,
    { data: create_data, loading: create_loading, error: create_error },
  ] = useMutation<CreateLabelsetOutputs, CreateLabelsetInputs>(CREATE_LABELSET);

  const [mutateAnnotationLabel, {}] = useMutation<
    UpdateAnnotationLabelOutputs,
    UpdateAnnotationLabelInputs
  >(UPDATE_ANNOTATION_LABEL);

  const [deleteMultipleLabels, {}] = useMutation<
    DeleteMultipleAnnotationLabelOutputs,
    DeleteMultipleAnnotationLabelInputs
  >(DELETE_MULTIPLE_ANNOTATION_LABELS);

  const {
    refetch,
    loading: label_set_loading,
    error: label_set_fetch_error,
    data: label_set_data,
    fetchMore,
  } = useQuery<GetLabelsetWithLabelsOutputs, GetLabelsetWithLabelsInputs>(
    GET_LABELSET_WITH_ALL_LABELS,
    {
      variables: {
        id: opened_labelset?.id ? opened_labelset.id : "",
      },
      notifyOnNetworkStatusChange: true, // required to get loading signal on fetchMore
    }
  );

  if (label_set_fetch_error || label_set_loading) {
    return (
      <Modal closeIcon open={open} onClose={() => toggleModal()} size="large">
        <HorizontallyCenteredDiv>
          <CreateAndSearchBar
            onChange={() => {}}
            actions={[]}
            placeholder="Search for label by description or name..."
            value={""}
          />
        </HorizontallyCenteredDiv>
        <Modal.Content>
          {label_set_loading || create_loading ? (
            <Dimmer active={true}>
              <Loader
                content={create_loading ? "Updating..." : "Loading labels..."}
              />
            </Dimmer>
          ) : (
            <></>
          )}
        </Modal.Content>
        <Modal.Actions>
          <Button basic color="grey">
            <Icon name="remove" /> Close
          </Button>
          {canSave ? (
            <Button color="green" inverted>
              <Icon name="checkmark" /> Save
            </Button>
          ) : (
            <></>
          )}
        </Modal.Actions>
      </Modal>
    );
  }

  // console.log("LabelSetEditModal - labelset data", label_set_data);

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
        // console.log("Success deleting labels!", data);
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

  const updateLabelSet = (obj: LabelSetType) => {
    mutateLabelset({ variables: { ...obj } })
      .then(() => refetch())
      .catch((err) => {
        console.log("Error updating labelset: ", err);
      });
  };

  const updateLabel = (obj: UpdateAnnotationLabelInputs) => {
    // console.log("Update label", obj);
    mutateAnnotationLabel({ variables: { ...obj } })
      .then((data) => {
        refetch();
      })
      .catch((err) => {
        console.log("Error updating label", err);
      });
  };

  const onCRUDChange = (labelsetData: LabelSetType) => {
    // console.log("On CRUD Change", onCRUDChange);
    setChangedValues({ ...changedValues, ...labelsetData });
    // console.log("changedValues", changedValues);
    setUpdatedObject({ ...opened_labelset, ...updatedObject, ...labelsetData });
    // console.log("Updated object", updatedObject);
    setCanSave(true);
  };

  const handleTabChange = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
    data: TabProps
  ) => setActiveIndex(data?.activeIndex ? data.activeIndex : 0);

  const handleSave = () => {
    // console.log("Handle save", {id: opened_labelset?.id ? opened_labelset.id : "", ...changedValues});
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

  // console.log("Labels is", labels);

  // Split out the labels by type
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
  // console.log("Filtered by type", text_labels, doc_type_labels, relationship_labels);

  //Filter the text & doc label sets:
  let text_label_fuse = new Fuse(text_labels, fuse_options);
  let doc_label_fuse = new Fuse(doc_type_labels, fuse_options);
  let relationship_label_fuse = new Fuse(relationship_labels, fuse_options);
  let metadata_label_fuse = new Fuse(metadata_labels, fuse_options);

  let text_label_results: AnnotationLabelType[] = [];
  let doc_label_results: AnnotationLabelType[] = [];
  let relationship_label_results: AnnotationLabelType[] = [];
  let metadata_label_results: AnnotationLabelType[] = [];

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
  } else {
    text_label_results = text_labels;
    doc_label_results = doc_type_labels;
    relationship_label_results = relationship_labels;
    metadata_label_results = metadata_labels;
  }

  //Build text label components
  let text_data_labels: JSX.Element[] = [];
  if (text_label_results && text_label_results.length > 0) {
    text_data_labels = text_label_results.map((label, index) => {
      return (
        <AnnotationLabelCard
          key={label?.id ? label.id : index}
          label={label}
          selected={selectedLabels.map((label) => label.id).includes(label.id)}
          onDelete={() => handleDeleteLabel([label])}
          onSelect={toggleLabelSelect}
          onSave={updateLabel}
        />
      );
    });
  }

  //Build doc label components
  let doc_data_labels: JSX.Element[] = [];
  if (doc_label_results && doc_label_results.length > 0) {
    doc_data_labels = doc_label_results.map((label, index) => {
      return (
        <AnnotationLabelCard
          key={label.id}
          label={label}
          selected={selectedLabels.map((label) => label.id).includes(label.id)}
          onDelete={() => handleDeleteLabel([label])}
          onSelect={toggleLabelSelect}
          onSave={updateLabel}
        />
      );
    });
  }

  // Build relationship label components
  let relationship_data_labels: JSX.Element[] = [];
  if (relationship_label_results && relationship_label_results.length > 0) {
    relationship_data_labels = relationship_label_results.map(
      (label, index) => {
        return (
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
        );
      }
    );
  }

  // Build metadata label components
  let metadata_data_labels: JSX.Element[] = [];
  if (metadata_label_results && metadata_label_results.length > 0) {
    metadata_data_labels = metadata_label_results.map((label, index) => {
      return (
        <AnnotationLabelCard
          key={label.id}
          label={label}
          selected={selectedLabels.map((label) => label.id).includes(label.id)}
          onDelete={() => handleDeleteLabel([label])}
          onSelect={toggleLabelSelect}
          onSave={updateLabel}
        />
      );
    });
  }

  const panes = [
    {
      menuItem: {
        key: "description",
        icon: "bars",
        content: "Details",
      },
      render: () => (
        <Tab.Pane
          key={0}
          style={{
            overflowY: "scroll",
            padding: "1em",
            width: "100%",
            flex: 1,
          }}
        >
          <CRUDWidget
            has_file
            mode={
              my_permissions.includes(PermissionTypes.CAN_UPDATE)
                ? "EDIT"
                : "VIEW"
            }
            model_name="Label Set"
            data_schema={newLabelSetForm_Schema}
            ui_schema={newLabelSetForm_Ui_Schema}
            instance={
              _.isEmpty(updatedObject)
                ? opened_labelset
                  ? opened_labelset
                  : {}
                : updatedObject
            }
            show_header
            accepted_file_types=".png,.jpg"
            handleInstanceChange={onCRUDChange}
            file_is_image
            file_field="icon"
            file_label="Labelset Icon"
          />
        </Tab.Pane>
      ),
    },
    {
      menuItem: {
        key: "metadata",
        icon: "braille",
        content: `Metadata (${metadata_data_labels?.length})`,
      },
      render: () => (
        <Tab.Pane
          key={1}
          style={{
            overflowY: "scroll",
            padding: "1em",
            width: "100%",
            flex: 1,
          }}
        >
          <Card.Group itemsPerRow={1}>{metadata_data_labels}</Card.Group>
        </Tab.Pane>
      ),
    },
    {
      menuItem: {
        key: "text",
        icon: "language",
        content: `Text (${text_data_labels?.length})`,
      },
      render: () => (
        <Tab.Pane
          key={1}
          style={{
            overflowY: "scroll",
            padding: "1em",
            width: "100%",
            flex: 1,
          }}
        >
          <Card.Group itemsPerRow={1}>{text_data_labels}</Card.Group>
        </Tab.Pane>
      ),
    },
    {
      menuItem: {
        key: "text",
        icon: "file pdf outline",
        content: `Doc Types (${doc_data_labels?.length})`,
      },
      render: () => (
        <Tab.Pane
          key={2}
          style={{
            overflowY: "scroll",
            padding: "1em",
            width: "100%",
            flex: 1,
          }}
        >
          <Card.Group itemsPerRow={1}>{doc_data_labels}</Card.Group>
        </Tab.Pane>
      ),
    },
    {
      menuItem: {
        key: "relation",
        icon: "handshake outline",
        content: `Relations (${relationship_data_labels?.length})`,
      },
      render: () => (
        <Tab.Pane
          key={2}
          style={{
            overflowY: "scroll",
            padding: "1em",
            width: "100%",
            flex: 1,
          }}
        >
          <Card.Group itemsPerRow={1}>{relationship_data_labels}</Card.Group>
        </Tab.Pane>
      ),
    },
  ];

  let button_actions: DropdownActionProps[] = [];

  if (
    [1, 2, 3, 4].includes(parseInt(`${activeIndex}`)) &&
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
          ? "Create OCR Label"
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
    <Modal closeIcon open={open} onClose={() => toggleModal()} size="large">
      {label_set_loading || create_loading ? (
        <Dimmer active={true}>
          <Loader
            content={create_loading ? "Updating..." : "Loading labels..."}
          />
        </Dimmer>
      ) : (
        <></>
      )}
      <HorizontallyCenteredDiv>
        <div style={{ marginTop: "1rem", textAlign: "left" }}>
          <Header as="h2">
            <Icon name="tags" />
            <Header.Content>
              Edit Label Set:{" "}
              {updatedObject ? (updatedObject as LabelSetType).title : ""}
            </Header.Content>
          </Header>
        </div>
      </HorizontallyCenteredDiv>
      <Segment
        secondary
        style={{
          flex: 1,
          marginRight: "1.5rem",
          marginLeft: "1.5rem",
          marginBottom: "0px",
          paddingTop: ".75rem",
          paddingBottom: ".75rem",
        }}
      >
        <CreateAndSearchBar
          onChange={(value) => setSearchTerm(value)}
          actions={button_actions}
          placeholder="Search for label by description or name..."
          value={searchTerm}
        />
      </Segment>

      <Modal.Content>
        <Segment
          raised
          style={{
            height: "50vh",
            width: "100%",
            padding: "0px",
            display: "flex",
            margin: "0px",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "center",
          }}
        >
          <Tab
            menu={{
              pointing: true,
              secondary: true,
              style: {
                display: "flex",
                flexDirection: "row",
                justifyContent: "center",
                fontSize: "large",
                width: "100%",
                margin: "0px",
              },
            }}
            panes={panes}
            activeIndex={activeIndex}
            onTabChange={handleTabChange}
            style={{
              display: "flex",
              justifyContent: "center",
              flexDirection: "column",
              alignItems: "flex-start",
              minHeight: "50%",
              width: "100%",
              overflow: "hidden",
              flex: 1,
            }}
          />
        </Segment>
      </Modal.Content>
      <Modal.Actions>
        <Button basic color="grey" onClick={() => toggleModal()}>
          <Icon name="remove" /> Close
        </Button>
        {canSave ? (
          <Button color="green" inverted onClick={() => handleSave()}>
            <Icon name="checkmark" /> Save
          </Button>
        ) : (
          <></>
        )}
      </Modal.Actions>
    </Modal>
  );
};
