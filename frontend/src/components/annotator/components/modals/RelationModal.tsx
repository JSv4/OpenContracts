import { useState } from "react";
import { Transfer as SemanticTransfer } from "../../../widgets/data-display/Transfer";
import { Modal, Button, Label, Icon } from "semantic-ui-react";
import { RelationGroup } from "../../types/annotations";
import { AnnotationLabelType } from "../../../../types/graphql-api";
import styled from "styled-components";
import { useCreateRelationship } from "../../hooks/AnnotationHooks";
import { useRelationLabels } from "../../context/CorpusAtom";

interface RelationModalProps {
  visible: boolean;
  source: string[];
  label: AnnotationLabelType;
  onClose?: () => void;
}

export const RelationModal = ({
  visible,
  source,
  label,
  onClose,
}: RelationModalProps) => {
  const [targetKeys, setTargetKeys] = useState<string[]>([]);
  const createRelationship = useCreateRelationship();
  const { relationLabels } = useRelationLabels();
  const transferSource = source.map((a) => ({ key: a, annotation: a }));

  const handleOk = async () => {
    const sourceIds = source
      .filter((s) => !targetKeys.some((k) => k === s))
      .map((s) => s);

    // Create the relation using the hook
    await createRelationship(new RelationGroup(sourceIds, targetKeys, label));

    // Reset state
    setTargetKeys([]);
    onClose?.();
  };

  const handleCancel = () => {
    // Reset state
    setTargetKeys([]);
    onClose?.();
  };

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
        {relationLabels.map((relation) => (
          <Label
            as="a"
            key={relation.text}
            onClick={() => {
              // TODO: Handle relation label selection
              // This functionality needs to be lifted up to the parent component
              // or handled through a separate atom for active relation label
            }}
            style={{
              backgroundColor: relation.id === label.id ? "green" : "gray",
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
        <Button color="green" onClick={handleOk}>
          Save Change
        </Button>
        <Button color="black" onClick={handleCancel}>
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
