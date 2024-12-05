import { UserType } from "./graphql-api";

export interface ExtractGridRow {
  id: string;
  documentId: string;
  documentTitle: string;
  [key: string]: any; // For dynamic column data
}

export interface ExtractGridColumn {
  id?: string;
  key: string;
  name: string;
  width?: number;
  frozen?: boolean;
  formatter?: React.ComponentType<FormatterProps>;
  editor?: React.ComponentType<EditorProps>;
  editable?: boolean;
  sortable?: boolean;
  resizable?: boolean;
}

export interface CellStatus {
  isLoading: boolean;
  isApproved: boolean;
  isRejected: boolean;
  isEdited: boolean;
  originalData: any | null;
  correctedData: any | null;
  error?: any | null;
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
