import React, { useState, useEffect } from "react";
import styled from "styled-components";
import ReactJson from "react-json-view";

interface CellEditorProps {
  value: any;
  onSave: (newValue: any) => void;
  onClose: () => void;
  loading: boolean;
}

export const CellEditor: React.FC<CellEditorProps> = ({
  value,
  onSave,
  onClose,
  loading,
}) => {
  const [editedValue, setEditedValue] = useState(value);

  // Sync editedValue when value prop changes
  useEffect(() => {
    setEditedValue(value);
  }, [value]);

  const isObject = typeof value === "object" && value !== null;

  const handleSave = () => {
    onSave(editedValue);
  };

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        {loading && (
          <LoaderOverlay>
            <Loader />
          </LoaderOverlay>
        )}

        <CloseModalButton onClick={onClose}>&times;</CloseModalButton>
        <ModalHeader>Edit Value</ModalHeader>
        {isObject ? (
          <ReactJson
            src={editedValue}
            onEdit={(edit) => setEditedValue(edit.updated_src)}
            onAdd={(add) => setEditedValue(add.updated_src)}
            onDelete={(del) => setEditedValue(del.updated_src)}
            enableClipboard={false}
            displayDataTypes={false}
          />
        ) : (
          <InputField
            type="text"
            value={editedValue}
            onChange={(e) => setEditedValue(e.target.value)}
          />
        )}
        <ModalActions>
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button primary onClick={handleSave} disabled={loading}>
            Save
          </Button>
        </ModalActions>
      </ModalContent>
    </ModalOverlay>
  );
};

// Modal Overlay
const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
`;

// Modal Content
const ModalContent = styled.div`
  background-color: #fff;
  padding: 24px;
  border-radius: 8px;
  width: 600px;
  max-width: 90%;
  max-height: 80%;
  overflow-y: auto;
  position: relative;
`;

// Close Button
const CloseModalButton = styled.button`
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  border: none;
  font-size: 24px;
  color: #6b7280;
  cursor: pointer;

  &:hover {
    color: #111827;
  }
`;

// Header
const ModalHeader = styled.h2`
  margin-top: 0;
  margin-bottom: 16px;
  font-size: 1.5rem;
  color: #111827;
`;

// Actions Container
const ModalActions = styled.div`
  margin-top: 24px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
`;

// Button
const Button = styled.button<{ primary?: boolean; disabled?: boolean }>`
  padding: 8px 16px;
  font-size: 0.9rem;
  border-radius: 4px;
  cursor: pointer;
  border: none;
  background-color: ${({ primary }) => (primary ? "#3b82f6" : "#e5e7eb")};
  color: ${({ primary }) => (primary ? "#fff" : "#111827")};
  opacity: ${({ disabled }) => (disabled ? 0.6 : 1)};
  pointer-events: ${({ disabled }) => (disabled ? "none" : "auto")};

  &:hover {
    background-color: ${({ primary }) => (primary ? "#2563eb" : "#d1d5db")};
  }
`;

// Loader Overlay
const LoaderOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(255, 255, 255, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
`;

// Loader Spinner
const Loader = styled.div`
  border: 4px solid #e5e7eb;
  border-top: 4px solid #3b82f6;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

// Input Field
const InputField = styled.input`
  width: 100%;
  padding: 8px;
  font-size: 1rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  margin-top: 8px;
`;
