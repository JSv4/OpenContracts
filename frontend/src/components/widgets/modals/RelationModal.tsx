import { useState, useContext } from "react";
import { Transfer as SemanticTransfer } from "../../../components/widgets/data-display/Transfer";
import { Modal, Button, Label, Icon } from "semantic-ui-react";
import { AnnotationStore } from "../../annotator/context/AnnotationStore";
import { RelationGroup } from "../../annotator/types/annotations";
import { AnnotationLabelType } from "../../../types/graphql-api";
import styled from "styled-components";

interface RelationModalProps {
  visible: boolean;
  onClick: (group: RelationGroup) => void;
  onCancel: () => void;
  source: string[];
  label: AnnotationLabelType;
}

export const RelationModal = ({
  visible,
  onClick,
  onCancel,
  source,
  label,
}: RelationModalProps) => {
  const annotationStore = useContext(AnnotationStore);
  const [targetKeys, setTargetKeys] = useState<string[]>([]);
  const transferSource = source.map((a) => ({ key: a, annotation: a }));

  return (
    <Modal
      header="Annotate Relations"
      style={{ width: "800px" }}
      open={visible}
    >
      <Modal.Header>
        <h5>Choose a Relation</h5>
      </Modal.Header>
      <Modal.Content>
        {annotationStore.relationLabels.map((relation) => (
          <Label
            as="a"
            key={relation.text}
            onClick={() => {
              annotationStore.setActiveRelationLabel(relation);
            }}
            style={{
              backgroundColor:
                relation.id === annotationStore.activeRelationLabel?.id
                  ? "green"
                  : "gray",
            }}
          >
            <Icon name={relation.icon ? relation.icon : "tag"} />
            {relation.text}
          </Label>
        ))}
        <br />
        <hr />
        <TransferContainer>
          <SemanticTransfer
            dataSource={transferSource}
            targetKeys={targetKeys}
            onChange={setTargetKeys}
          />
        </TransferContainer>
      </Modal.Content>
      <Modal.Actions>
        <Button
          color="green"
          onClick={() => {
            const sourceIds = source
              .filter((s) => !targetKeys.some((k) => k === s))
              .map((s) => s);
            onClick(new RelationGroup(sourceIds, targetKeys, label));
            setTargetKeys([]);
          }}
        >
          Save Change
        </Button>
        <Button
          color="black"
          onClick={() => {
            setTargetKeys([]);
            onCancel();
          }}
        >
          Cancel
        </Button>
      </Modal.Actions>
    </Modal>
  );
};

const TransferContainer = styled.div(
  ({ theme }) => `
      padding: ${theme.spacing.sm};
      display: flex;
      flex-direction: row;
      justify-content: center;
  `
);
