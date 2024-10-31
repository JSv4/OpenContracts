declare module "@uiw/react-json-view" {
  import * as React from "react";

  interface EditAction {
    updated_src: any;
    existing_src: any;
    name: string;
    namespace: string;
    src: any;
  }

  interface JsonViewProps {
    src: any;
    theme?: object;
    displayDataTypes?: boolean;
    displayObjectSize?: boolean;
    enableClipboard?: boolean;
    onEdit?: (edit: EditAction) => void;
    onAdd?: (add: EditAction) => void;
    onDelete?: (del: EditAction) => void;
    indentWidth?: number;
    collapsed?: boolean | number;
    [key: string]: any; // For any additional props
  }

  const JsonView: React.FC<JsonViewProps>;

  export default JsonView;
}
