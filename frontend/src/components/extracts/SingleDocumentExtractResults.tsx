import React, { useState, useRef } from "react";
import styled from "styled-components";
import { FiCode, FiCheck, FiX, FiEye, FiEyeOff } from "react-icons/fi"; // Import icons you need
import { Dimmer, Loader } from "semantic-ui-react";
import {
  ColumnType,
  DatacellType,
  LabelDisplayBehavior,
} from "../../types/graphql-api";
import { useMutation } from "@apollo/client";
import {
  REQUEST_APPROVE_DATACELL,
  REQUEST_REJECT_DATACELL,
  RequestApproveDatacellInputType,
  RequestApproveDatacellOutputType,
  RequestRejectDatacellInputType,
  RequestRejectDatacellOutputType,
} from "../../graphql/mutations";
import { TruncatedText } from "../widgets/data-display/TruncatedText";
import { HighlightItem } from "../annotator/sidebar/HighlightItem";
import {
  displayAnnotationOnAnnotatorLoad,
  onlyDisplayTheseAnnotations,
  showSelectedAnnotationOnly,
  showAnnotationBoundingBoxes,
  showStructuralAnnotations,
  showAnnotationLabels,
} from "../../graphql/cache";
import { toast } from "react-toastify";
import { convertToServerAnnotation } from "../../utils/transform";
import ReactJson from "react-json-view";

interface SingleDocumentExtractResultsProps {
  datacells: DatacellType[];
  columns: ColumnType[];
}

/**
 * SingleDocumentExtractResults component displays the extraction results for a single document.
 * It renders a table with columns and their extracted data, along with any associated annotations.
 */
export const SingleDocumentExtractResults: React.FC<
  SingleDocumentExtractResultsProps
> = ({ datacells, columns }) => {
  // State variables
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [tryingApprove, setTryingApprove] = useState(false);
  const [tryingReject, setTryingReject] = useState(false);
  const [activeCell, setActiveCell] = useState<DatacellType | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openPopupCellId, setOpenPopupCellId] = useState<string | null>(null);
  const [annotationVisibility, setAnnotationVisibility] = useState<{
    [key: string]: boolean;
  }>({});
  const cellRefs = useRef<{ [key: string]: HTMLDivElement }>({});

  const [requestApprove] = useMutation<
    { requestApproveDatacell: RequestApproveDatacellOutputType },
    RequestApproveDatacellInputType
  >(REQUEST_APPROVE_DATACELL);

  const [requestReject] = useMutation<
    { requestRejectDatacell: RequestRejectDatacellOutputType },
    RequestRejectDatacellInputType
  >(REQUEST_REJECT_DATACELL);

  const lastCells = datacells;

  /**
   * Toggles the visibility of annotations under a cell.
   * @param cellId - The ID of the datacell.
   */
  const toggleAnnotationVisibility = (cellId: string) => {
    setAnnotationVisibility((prevState) => ({
      ...prevState,
      [cellId]: !prevState[cellId],
    }));
  };

  /**
   * Gets the status color for a datacell based on its approval status.
   * @param cell - The datacell to get the status color for.
   * @returns The color representing the cell's status.
   */
  const getStatusColor = (cell: DatacellType): string => {
    if (cell.approvedBy) return "rgba(76, 175, 80, 1)"; // Green
    if (cell.rejectedBy) return "rgba(244, 67, 54, 1)"; // Red
    if (cell.correctedData) return "rgba(33, 150, 243, 1)"; // Blue
    return "rgba(128, 128, 128, 1)"; // Grey
  };

  /**
   * Renders the value of a datacell.
   * @param cell - The datacell to render the value for.
   * @returns The rendered value as JSX.
   */
  const renderCellValue = (cell: DatacellType) => {
    const value = cell.correctedData?.data || cell.data?.data || "";
    const ref = cellRefs.current[cell.id];
    const cellWidth = ref?.offsetWidth ?? 0;

    return (
      <DataCell>
        <div style={{ flex: 1 }}>
          {typeof value === "object" && value !== null ? (
            <JsonViewButton
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveCell(cell);
                setIsModalOpen(true);
              }}
            >
              <FiCode />
              <span>View JSON</span>
            </JsonViewButton>
          ) : (
            <TruncatedText text={String(value)} limit={cellWidth - 100} />
          )}
        </div>
      </DataCell>
    );
  };

  /**
   * Renders the action buttons (approve/reject) in the popup.
   * @param cell - The datacell to render the action buttons for.
   * @returns The action buttons as JSX.
   */
  const renderActionButtons = (cell: DatacellType) => (
    <ButtonContainer>
      <div className="buttons">
        <StyledButton
          color="#22c55e" // Green
          hoverColor="#16a34a"
          onClick={(e) => {
            e.stopPropagation();
            setTryingApprove(true);
            requestApprove({ variables: { datacellId: cell.id } })
              .then(() => {
                toast.success("Cell approved successfully.");
              })
              .catch(() => {
                toast.error("Failed to approve cell.");
              })
              .finally(() => {
                setTryingApprove(false);
              });
            setOpenPopupCellId(null);
          }}
          disabled={Boolean(cell.approvedBy)}
          title="Approve"
        >
          <FiCheck />
          Approve
        </StyledButton>
        <StyledButton
          color="#ef4444" // Red
          hoverColor="#dc2626"
          onClick={(e) => {
            e.stopPropagation();
            setTryingReject(true);
            requestReject({ variables: { datacellId: cell.id } })
              .then(() => {
                toast.success("Cell rejected successfully.");
              })
              .catch(() => {
                toast.error("Failed to reject cell.");
              })
              .finally(() => {
                setTryingReject(false);
              });
            setOpenPopupCellId(null);
          }}
          disabled={Boolean(cell.rejectedBy)}
          title="Reject"
        >
          <FiX />
          Reject
        </StyledButton>
      </div>
      {cell.approvedBy && (
        <div className="status-message">Cell is currently approved</div>
      )}
      {cell.rejectedBy && (
        <div className="status-message">Cell is currently rejected</div>
      )}
    </ButtonContainer>
  );

  return (
    <Container>
      <Dimmer.Dimmable
        as={TableContainer}
        dimmed={tryingApprove || tryingReject}
      >
        <Dimmer active={tryingApprove || tryingReject}>
          <Loader>
            {tryingApprove && "Approving..."}
            {tryingReject && "Rejecting..."}
          </Loader>
        </Dimmer>

        <Table>
          <thead>
            <tr>
              <TableHeader>Column</TableHeader>
              <TableHeader>Data</TableHeader>
            </tr>
          </thead>
          <tbody>
            {columns.map((column: ColumnType) => {
              const cell = lastCells.find((c) => c.column.id === column.id);
              return (
                <React.Fragment key={column.id}>
                  <TableRow
                    isHovered={hoveredRow === column.id}
                    onMouseEnter={() => setHoveredRow(column.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    <TableCell>
                      <CellContent>
                        <div
                          style={{ display: "flex", flexDirection: "column" }}
                        >
                          <span>{column.name}</span>
                          {cell &&
                            cell.fullSourceList &&
                            cell.fullSourceList.length > 0 && (
                              <AnnotationShield
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleAnnotationVisibility(cell.id);
                                }}
                              >
                                {annotationVisibility[cell.id] ? (
                                  <FiEye />
                                ) : (
                                  <FiEyeOff />
                                )}
                                {cell.fullSourceList.length} Annotation
                                {cell.fullSourceList.length !== 1 ? "s" : ""}
                              </AnnotationShield>
                            )}
                        </div>
                        {cell && (
                          <CellStatus>
                            {cell.approvedBy && <FiCheck color="green" />}
                            {cell.rejectedBy && <FiX color="red" />}
                            {cell.correctedData && <FiCode color="blue" />}
                          </CellStatus>
                        )}
                      </CellContent>
                    </TableCell>
                    <TableCell>
                      <CellContainer
                        ref={(el) => cell && (cellRefs.current[cell.id] = el!)}
                        style={{ position: "relative" }}
                      >
                        {cell ? renderCellValue(cell) : "-"}

                        {cell && (
                          <>
                            <StatusDot
                              statusColor={getStatusColor(cell)}
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenPopupCellId(
                                  openPopupCellId === cell.id ? null : cell.id
                                );
                              }}
                            />

                            {/* Conditionally render action buttons */}
                            {openPopupCellId === cell.id && (
                              <ActionButtonsWrapper>
                                {renderActionButtons(cell)}
                              </ActionButtonsWrapper>
                            )}
                          </>
                        )}
                      </CellContainer>
                    </TableCell>
                  </TableRow>
                  {cell &&
                    cell.fullSourceList &&
                    cell.fullSourceList.length > 0 &&
                    annotationVisibility[cell.id] && (
                      <AnnotationRow>
                        <TableCell colSpan={2}>
                          <AnnotationsContainer>
                            {cell.fullSourceList.map((annotation) => (
                              <HighlightItem
                                key={annotation.id}
                                annotation={convertToServerAnnotation(
                                  annotation
                                )}
                                read_only={true}
                                relations={[]}
                                onSelect={(annotationId: string) => {
                                  onlyDisplayTheseAnnotations([annotation]);
                                  displayAnnotationOnAnnotatorLoad(annotation);
                                  showSelectedAnnotationOnly(false);
                                  showAnnotationBoundingBoxes(true);
                                  showStructuralAnnotations(true);
                                  showAnnotationLabels(
                                    LabelDisplayBehavior.ALWAYS
                                  );
                                }}
                              />
                            ))}
                          </AnnotationsContainer>
                        </TableCell>
                      </AnnotationRow>
                    )}
                </React.Fragment>
              );
            })}
          </tbody>
        </Table>
      </Dimmer.Dimmable>

      {isModalOpen && (
        <ModalOverlay onClick={() => setIsModalOpen(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <CloseModalButton onClick={() => setIsModalOpen(false)}>
              &times;
            </CloseModalButton>
            {activeCell && (
              <ReactJson
                src={activeCell.correctedData?.data || activeCell.data?.data}
                theme="rjv-default"
                style={{ padding: "20px" }}
                enableClipboard={false}
                displayDataTypes={false}
                collapsed={2}
              />
            )}
          </ModalContent>
        </ModalOverlay>
      )}
    </Container>
  );
};

// Styled Components
const Container = styled.div`
  height: 100%;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
  border: 1px solid rgba(0, 0, 0, 0.08);
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const TableContainer = styled.div`
  flex: 1;
  overflow: auto;
  margin: 0;
  background: #fff;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
  color: #1e293b;
  table-layout: fixed;
`;

const TableHeader = styled.th`
  position: sticky;
  top: 0;
  background: #f1f5f9;
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  border-bottom: 2px solid #e2e8f0;
  z-index: 1;
  color: #0f172a;

  &:first-child {
    width: 200px;
  }
`;

const TableRow = styled.tr<{ isHovered: boolean }>`
  cursor: default;
  transition: background-color 0.2s ease;
  background-color: ${(props) => (props.isHovered ? "#f8fafc" : "#fff")};

  &:hover {
    background-color: #f1f5f9;
  }

  &:last-child td {
    border-bottom: none;
  }
`;

const TableCell = styled.td`
  padding: 0;
  border-bottom: 1px solid #e2e8f0;
  vertical-align: top;
`;

const CellContent = styled.div`
  display: flex;
  align-items: center;
  padding: 12px 16px;
  gap: 8px;
  min-height: 48px;
`;

const DataCell = styled(CellContent)`
  display: flex;
  align-items: center;
  padding-right: 32px;
  position: relative;
`;

const JsonViewButton = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #3b82f6;
  font-size: 0.9rem;
  position: relative;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: rgba(59, 130, 246, 0.1);
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const AnnotationCount = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  color: #64748b;
  font-size: 0.85rem;
  white-space: nowrap;
`;

const CellContainer = styled.div`
  position: relative;
  width: 100%;
  min-height: 50px;
  display: flex;
  align-items: center;
  padding: 8px 24px 8px 12px;
  font-size: 0.9rem;
  color: #334155;
  line-height: 1.5;
  background-color: inherit;
`;

const AnnotationRow = styled.tr`
  background-color: #f9fafb;
`;

const AnnotationsContainer = styled.div`
  padding: 8px 16px;
  background-color: #f9fafb;
`;

const AnnotationToggle = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  position: absolute;
  top: 8px;
  right: 32px;
  color: #4b5563;

  &:hover {
    color: #1f2937;
  }
`;

const CellStatus = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const StatusDot = styled.div<{ statusColor: string }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: ${({ statusColor }) => statusColor};
  position: absolute;
  top: 8px;
  right: 8px;
  cursor: pointer;
  z-index: 5;
  transition: transform 0.2s ease;

  &:hover {
    transform: scale(1.2);
  }
`;

const ButtonContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.99);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 0, 0, 0.04);
  z-index: 2000; // Ensure the button container is above other elements

  .buttons {
    display: flex;
    gap: 8px;
  }

  .status-message {
    font-size: 0.75rem;
    color: #64748b;
    text-align: center;
    margin-top: 4px;
    font-weight: 500;
  }

  .ui.button {
    margin: 0;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    border-radius: 8px;
    min-width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;

    &:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    &:active:not(:disabled) {
      transform: translateY(0);
    }

    &.green {
      background: linear-gradient(135deg, #22c55e, #16a34a);

      &:hover:not(:disabled) {
        background: linear-gradient(135deg, #16a34a, #15803d);
      }
    }

    &.red {
      background: linear-gradient(135deg, #ef4444, #dc2626);

      &:hover:not(:disabled) {
        background: linear-gradient(135deg, #dc2626, #b91c1c);
      }
    }
  }
`;

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
  z-index: 1000;
`;

const ModalContent = styled.div`
  background-color: #fff;
  width: 80%;
  max-width: 600px;
  padding: 20px;
  border-radius: 8px;
  position: relative;
`;

const CloseModalButton = styled.button`
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
`;

// Styled Button Component
const StyledButton = styled.button<{ color?: string; hoverColor?: string }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background-color: ${({ color }) => color || "#e5e7eb"};
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 6px 8px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color 0.2s ease;
  margin-right: 8px;

  &:hover {
    background-color: ${({ hoverColor }) => hoverColor || "#d1d5db"};
  }

  &:disabled {
    background-color: #e5e7eb;
    cursor: not-allowed;
    opacity: 0.6;
  }

  svg {
    margin-right: 4px;
  }
`;

// Annotation Shield Button
const AnnotationShield = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 4px 8px;
  font-size: 0.75rem;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-top: 4px;

  &:hover {
    background: #f1f5f9;
    color: #475569;
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

const ActionButtonsWrapper = styled.div`
  position: absolute;
  top: -10px;
  right: 30px;
  z-index: 100;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 8px;
  box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.1);
`;
