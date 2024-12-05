# Documentation: Implementing Custom Cell Renderers in React Data Grid

This documentation provides a detailed explanation of how we implemented custom cell renderers using `react-data-grid` in our DataGrid. It also explains how to create additional custom renderers based on other properties of your data cells.

## Introduction

Custom cell rendering in `react-data-grid` allows you to define how each cell in your grid should be displayed. This is particularly useful when you need to display loading indicators, status icons, or any custom content based on the data cell's properties.

In this guide, we'll walk through the steps of:

- Creating custom cell renderers using the `renderCell` function in column definitions.
- Managing cell statuses to control what is displayed in each cell.
- Extending this approach to create more custom renderers based on other properties of your data cells.

---

## Step 1: Understanding the `renderCell` Function in `react-data-grid`

In `react-data-grid`, you can customize the rendering of cells by providing a `renderCell` function in your column definitions. This function receives cell properties and allows you to return a custom component or element to render.

Here's the basic idea:

```typescript
const columns = [
  {
    key: 'columnKey',
    name: 'Column Name',
    renderCell: (props) => {
      // Custom rendering logic
      return <CustomCellRenderer {...props} />;
    },
  },
  // ... other columns
];
```

---

## Step 2: Creating a Custom Cell Renderer Component

First, create a custom cell renderer component that will handle the rendering logic based on the cell's properties.

### **File: `ExtractCellFormatter.tsx`**

```typescript:src/components/extracts/datagrid/ExtractCellFormatter.tsx
import React from "react";
import { Icon } from "semantic-ui-react";

export interface CellStatus {
  isLoading: boolean;
  isApproved: boolean;
  isRejected: boolean;
  isEdited: boolean;
  originalData: any;
  correctedData: any;
  error?: any;
}

interface ExtractCellFormatterProps {
  value: string;
  cellStatus: CellStatus;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
}

/**
 * ExtractCellFormatter is a custom cell renderer that displays the cell's value
 * along with status icons based on the cell's status.
 */
export const ExtractCellFormatter: React.FC<ExtractCellFormatterProps> = ({
  value,
  cellStatus,
  onApprove,
  onReject,
  onEdit,
}) => {
  const cellStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    width: "100%",
    height: "100%",
    padding: "0 8px",
  };

  if (cellStatus.isLoading) {
    return (
      <div style={cellStyle}>
        <Icon name="spinner" loading />
      </div>
    );
  }

  return (
    <div style={cellStyle}>
      {value}
      {cellStatus.isApproved && (
        <Icon name="check" color="green" style={{ marginLeft: "auto" }} />
      )}
      {cellStatus.isRejected && (
        <Icon name="x" color="red" style={{ marginLeft: "auto" }} />
      )}
      {cellStatus.isEdited && (
        <Icon name="edit" color="blue" style={{ marginLeft: "auto" }} />
      )}
    </div>
  );
};
```

**Explanation:**

- The `ExtractCellFormatter` component accepts `value`, `cellStatus`, and action handlers as props.
- It displays a loading spinner if `cellStatus.isLoading` is `true`.
- Otherwise, it displays the cell's value and appropriate status icons based on `cellStatus`.

---

## Step 3: Mapping Cell Statuses

We need a way to determine the status of each cell to control what's displayed. We'll create a `cellStatusMap` that maps each cell to its status.

### **Implementation**

In your main `DataGrid` component file:

```typescript:src/components/extracts/datagrid/DataGrid.tsx
import React, { useMemo } from "react";
// ... other imports ...

import { ExtractCellFormatter, CellStatus } from "./ExtractCellFormatter";

// ... other code ...

/**
 * ExtractDataGrid component displays the data grid with custom cell renderers.
 */
export const ExtractDataGrid: React.FC<DataGridProps> = ({
  extract,
  cells,
  rows,
  columns,
  // ... other props ...
}) => {
  // ... existing state and effects ...

  /**
   * Creates a map of cell statuses for quick access during rendering.
   */
  const cellStatusMap = useMemo(() => {
    const map = new Map<string, CellStatus>();

    cells.forEach((cell) => {
      const extractIsProcessing =
        extract.started && !extract.finished && !extract.error;
      const cellIsProcessing =
        cell.started && !cell.completed && !cell.failed;
      const isProcessing =
        cellIsProcessing || (extractIsProcessing && !cell.started);

      const status: CellStatus = {
        isLoading: Boolean(isProcessing),
        isApproved: Boolean(cell.approvedBy),
        isRejected: Boolean(cell.rejectedBy),
        isEdited: Boolean(cell.correctedData),
        originalData: cell.data || null,
        correctedData: cell.correctedData || null,
        error: cell.failed || null,
      };

      const cellKey = `${cell.document.id}-${cell.column.id}`;
      map.set(cellKey, status);
    });

    return map;
  }, [cells, extract]);

  // ... other code ...
};
```

**Explanation:**

- The `cellStatusMap` uses a combination of `document.id` and `column.id` as the key to uniquely identify each cell.
- It stores the `CellStatus` for each cell, determining whether the cell is loading, approved, rejected, etc.

---

## Step 4: Updating Column Definitions to Use `renderCell`

Now, we'll update our column definitions to use the `renderCell` function, which utilizes our custom `ExtractCellFormatter`.

### **Implementation**

Still in your `DataGrid` component file:

```typescript:src/components/extracts/datagrid/DataGrid.tsx
// ... other imports ...

import DataGrid from "react-data-grid";
import { ExtractCellFormatter, CellStatus } from "./ExtractCellFormatter";

// ... other code ...

export const ExtractDataGrid: React.FC<DataGridProps> = (props) => {
  // ... existing state and effects ...

  /**
   * Defines the grid columns with custom renderers.
   */
  const gridColumns = useMemo(() => {
    return [
      // Static column for document titles
      {
        key: "documentTitle",
        name: "Document",
        frozen: true,
        width: 200,
        renderCell: (props: any) => {
          return <div>{props.row.documentTitle}</div>;
        },
      },
      // Dynamic columns based on `columns`
      ...columns.map((col) => ({
        key: col.id,
        name: col.name,
        width: 250,
        /**
         * Custom cell rendering for each column.
         */
        renderCell: (props: any) => {
          const cellKey = `${props.row.documentId}-${col.id}`;
          const cellStatus = cellStatusMap.get(cellKey) || {
            isLoading: true,
            isApproved: false,
            isRejected: false,
            isEdited: false,
            originalData: null,
            correctedData: null,
            error: null,
          };

          const value = props.row[col.id] || "";

          return (
            <ExtractCellFormatter
              value={String(value)}
              cellStatus={cellStatus}
              onApprove={() => {
                // Implement approval logic
              }}
              onReject={() => {
                // Implement rejection logic
              }}
              onEdit={() => {
                // Implement edit logic
              }}
            />
          );
        },
      })),
    ];
  }, [columns, cellStatusMap]);

  // ... existing code to generate gridRows ...

  return (
    <DataGrid
      columns={gridColumns}
      rows={gridRows}
      // ... other props ...
    />
  );
};
```

**Explanation:**

- For each column, we define a `renderCell` function.
- In `renderCell`, we:
  - Determine the `cellKey` to retrieve the cell's status.
  - Retrieve the `cellStatus` from `cellStatusMap`. If not found, we assume the cell is loading.
  - Fetch the cell's value from `props.row`.
  - Render the `ExtractCellFormatter`, passing in the necessary props.

---

## Step 5: Implementing Additional Custom Renderers

To create more custom renderers based on other properties of your data cells, you can follow a similar pattern. Here's how you can do it:

### **1. Define Additional Cell Status Properties**

Extend your `CellStatus` interface to include any new properties you need.

```typescript:src/components/extracts/datagrid/ExtractCellFormatter.tsx
export interface CellStatus {
  isLoading: boolean;
  isApproved: boolean;
  isRejected: boolean;
  isEdited: boolean;
  hasComment: boolean; // New property
  needsReview: boolean; // New property
  originalData: any;
  correctedData: any;
  error?: any;
}
```

### **2. Update `cellStatusMap` to Include New Properties**

Modify the mapping logic to set these new properties based on your data.

```typescript:src/components/extracts/datagrid/DataGrid.tsx
const cellStatusMap = useMemo(() => {
  const map = new Map<string, CellStatus>();

  cells.forEach((cell) => {
    // ... existing logic ...

    const status: CellStatus = {
      // ... existing properties ...
      hasComment: Boolean(cell.comment),
      needsReview: Boolean(cell.needsReview),
    };

    // ... existing logic ...
  });

  return map;
}, [cells, extract]);
```

### **3. Update the Custom Cell Renderer to Handle New Properties**

Modify your `ExtractCellFormatter` to display additional icons or elements based on the new status properties.

```typescript:src/components/extracts/datagrid/ExtractCellFormatter.tsx
export const ExtractCellFormatter: React.FC<ExtractCellFormatterProps> = ({
  value,
  cellStatus,
  onApprove,
  onReject,
  onEdit,
}) => {
  // ... existing code ...

  return (
    <div style={cellStyle}>
      {value}
      {cellStatus.hasComment && (
        <Icon name="comment" color="grey" style={{ marginLeft: "auto" }} />
      )}
      {cellStatus.needsReview && (
        <Icon name="exclamation circle" color="orange" style={{ marginLeft: "auto" }} />
      )}
      {/* Existing status icons */}
      {cellStatus.isApproved && (
        <Icon name="check" color="green" style={{ marginLeft: "auto" }} />
      )}
      {cellStatus.isRejected && (
        <Icon name="x" color="red" style={{ marginLeft: "auto" }} />
      )}
      {cellStatus.isEdited && (
        <Icon name="edit" color="blue" style={{ marginLeft: "auto" }} />
      )}
    </div>
  );
};
```

**Explanation:**

- The new properties `hasComment` and `needsReview` control whether additional icons are displayed.
- You can add any number of new properties and correspondingly update the rendering logic.

### **4. Create Completely New Custom Renderers**

If you need entirely different rendering logic for certain columns or cells, you can create new components.

#### **Example: A Date Formatter**

Suppose you have a column that displays dates, and you want to format them in a specific way.

**Create the Custom Renderer:**

```typescript:src/components/extracts/datagrid/DateCellFormatter.tsx
import React from "react";
import { format } from "date-fns";

interface DateCellFormatterProps {
  value: string;
}

/**
 * DateCellFormatter formats a date string into a readable format.
 */
export const DateCellFormatter: React.FC<DateCellFormatterProps> = ({ value }) => {
  const date = new Date(value);
  const formattedDate = format(date, "yyyy-MM-dd"); // Customize the format as needed

  return <div>{formattedDate}</div>;
};
```

**Update the Column Definition:**

```typescript:src/components/extracts/datagrid/DataGrid.tsx
// ... imports ...

import { DateCellFormatter } from "./DateCellFormatter";

// ... other code ...

const gridColumns = useMemo(() => {
  return [
    // ... other columns ...
    {
      key: "dateColumn",
      name: "Date",
      width: 150,
      renderCell: (props: any) => {
        const value = props.row["dateColumn"];
        return <DateCellFormatter value={value} />;
      },
    },
    // ... other columns ...
  ];
}, [/* dependencies */]);
```

---

## Step 6: Additional Considerations

### **Type Safety**

Ensure that all your components and functions are correctly typed. This helps catch errors during development.

- Use `interface` or `type` definitions for your props and state variables.
- Type your functions and hooks appropriately.

### **Action Handlers**

Implement the action handlers passed to your cell renderers (`onApprove`, `onReject`, `onEdit`, etc.).

```typescript
const handleApprove = (cellKey: string) => {
  // Implement approval logic
};

const handleReject = (cellKey: string) => {
  // Implement rejection logic
};

const handleEdit = (cellKey: string) => {
  // Implement edit logic
};
```

Pass these handlers to your `ExtractCellFormatter`:

```typescript
renderCell: (props: any) => {
  const cellKey = `${props.row.documentId}-${col.id}`;
  // ... existing code ...

  return (
    <ExtractCellFormatter
      // ... existing props ...
      onApprove={() => handleApprove(cellKey)}
      onReject={() => handleReject(cellKey)}
      onEdit={() => handleEdit(cellKey)}
    />
  );
},
```

### **Styling**

Customize the styling of your cells and components using CSS or inline styles.

---

## Conclusion

By following these steps, you can implement custom cell renderers in `react-data-grid` that display loading indicators and status icons based on the properties of your data cells. You can extend this approach to create additional custom renderers tailored to your specific requirements.

**Key Takeaways:**

- Use the `renderCell` function in column definitions to customize cell rendering.
- Maintain a `cellStatusMap` or similar structure to manage the state and status of each cell.
- Create reusable components for different types of cell renderers.
- Ensure type safety and include docstrings for better maintainability.
