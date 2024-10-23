import { UserType } from "./graphql-api";

export interface ExtractGridRow {
  id: string;
  documentId: string;
  documentTitle: string;
  [key: string]: any; // For dynamic column data
}

export interface ExtractGridColumn {
  key: string;
  name: string;
  width?: number;
  frozen?: boolean;
  formatter?: React.ComponentType<FormatterProps>;
  editor?: React.ComponentType<EditorProps>;
  editable?: boolean;
  sortable?: boolean;
}

export interface CellStatus {
  isApproved: boolean;
  isRejected: boolean;
  approvedBy?: UserType;
  rejectedBy?: UserType;
  isEdited: boolean;
  originalData?: any;
  correctedData?: any;
}

export interface FormatterProps {
  row: ExtractGridRow;
  column: ExtractGridColumn;
  cellStatus: CellStatus;
  onApprove?: () => void;
  onReject?: () => void;
  onEdit?: (value: any) => void;
  onViewSource?: () => void;
}

export interface EditorProps {
  row: ExtractGridRow;
  column: ExtractGridColumn;
  onSave: (value: any) => void;
  onClose: () => void;
}
