import React, { useState } from "react";
import {
  Card,
  Input,
  Button,
  Icon,
  Dropdown,
  Modal,
  Select,
  Checkbox,
} from "semantic-ui-react";
import { ColumnType, LanguageModelType } from "../../../graphql/types";
import { LanguageModelDropdown } from "../../../components/widgets/selectors/LanguageModelDropdown";

const ColumnHeaderCard: React.FC<{
  column: ColumnType;
  onEdit: (column: ColumnType) => void;
  onDelete: (columnId: string) => void;
}> = ({ column, onEdit, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedColumn, setEditedColumn] = useState<ColumnType>(column);

  const handleEdit = () => {
    setIsEditing(true);
    setEditedColumn(column);
  };

  const handleSave = () => {
    onEdit(editedColumn);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedColumn(column);
  };

  return (
    <Card>
      <Card.Content>
        <Card.Header>
          {column.name}
          <Dropdown
            icon={null}
            trigger={<Icon name="cog" style={{ float: "right" }} />}
            pointing="top right"
            style={{ float: "right" }}
          >
            <Dropdown.Menu>
              <Dropdown.Item text="Edit" onClick={handleEdit} />
              <Dropdown.Item
                text="Delete"
                onClick={() => onDelete(column.id)}
              />
            </Dropdown.Menu>
          </Dropdown>
        </Card.Header>
        <Card.Description>
          <p>Query: {column.query}</p>
          <p>Match Text: {column.matchText}</p>
          <p>Output Type: {column.outputType}</p>
          <p>Limit To Label: {column.limitToLabel}</p>
          <p>Instructions: {column.instructions}</p>
          <p>Language Model: {column.languageModel}</p>
          <p>Agentic: {column.agentic ? "Yes" : "No"}</p>
        </Card.Description>
      </Card.Content>
      <Modal open={isEditing} onClose={handleCancel}>
        <Modal.Header>Edit Column</Modal.Header>
        <Modal.Content>
          <Input
            label="Name"
            value={editedColumn.name}
            onChange={(_, data) =>
              setEditedColumn({ ...editedColumn, name: data.value })
            }
          />
          <Input
            label="Query"
            value={editedColumn.query}
            onChange={(_, data) =>
              setEditedColumn({ ...editedColumn, query: data.value })
            }
          />
          <Input
            label="Match Text"
            value={editedColumn.matchText}
            onChange={(_, data) =>
              setEditedColumn({ ...editedColumn, matchText: data.value })
            }
          />
          <Select
            label="Output Type"
            options={[
              { key: "text", value: "text", text: "Text" },
              { key: "number", value: "number", text: "Number" },
              // Add more output type options as needed
            ]}
            value={editedColumn.outputType}
            onChange={(_, data) =>
              setEditedColumn({
                ...editedColumn,
                outputType: data.value as string,
              })
            }
          />
          <Input
            label="Limit To Label"
            value={editedColumn.limitToLabel}
            onChange={(_, data) =>
              setEditedColumn({ ...editedColumn, limitToLabel: data.value })
            }
          />
          <Input
            label="Instructions"
            value={editedColumn.instructions}
            onChange={(_, data) =>
              setEditedColumn({ ...editedColumn, instructions: data.value })
            }
          />
          <LanguageModelDropdown
            onChange={(data) =>
              setEditedColumn({
                ...editedColumn,
                languageModel: data ? data : null,
              })
            }
            languageModel={
              editedColumn?.languageModel
                ? editedColumn.languageModel
                : undefined
            }
          />
          <Checkbox
            label="Agentic"
            checked={editedColumn.agentic}
            onChange={(_, data) =>
              setEditedColumn({
                ...editedColumn,
                agentic: data.checked || false,
              })
            }
          />
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={handleCancel}>Cancel</Button>
          <Button primary onClick={handleSave}>
            Save
          </Button>
        </Modal.Actions>
      </Modal>
    </Card>
  );
};
