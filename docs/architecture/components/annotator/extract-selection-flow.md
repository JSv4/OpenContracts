# Extract Data Loading & Display Flow

## Selection Trigger
When an extract is selected (via `onSelectExtract`), it initiates a cascade of state changes and data loading:

```typescript
const onSelectExtract = (extract: ExtractType | null) => {
  setSelectedExtract(extract);
  setSelectedAnalysis(null);
};
```

## Data Loading Process
1. **State Reset**
   - User input is disabled
   - Existing annotations are cleared
   - Current datacells are cleared
   - Analysis selection is cleared

2. **Data Fetch**
   - GraphQL query `GET_DATACELLS_FOR_EXTRACT` is executed with the extract ID
   - Loading states are tracked and errors are handled via toast notifications

3. **Data Processing**
   ```typescript
   if (datacellsData?.extract && selectedDocument?.id) {
     const filteredDatacells = datacellsData.extract.fullDatacellList
       .filter((datacell) => datacell.document?.id === selectedDocument.id);

     setDataCells(filteredDatacells);
     setColumns(datacellsData.extract.fieldset.fullColumnList);

     // Process associated annotations
     const processedAnnotations = filteredDatacells
       .flatMap((datacell) => datacell.fullSourceList)
       .map((annotation) => convertToServerAnnotation(annotation));
     replaceAnnotations(processedAnnotations);
   }
   ```

## UI Update Flow
The data flows through the component hierarchy:
```
DocumentAnnotator
  └─ DocumentViewer
      └─ AnnotatorSidebar
          └─ SingleDocumentExtractResults
```

When an extract is selected:
- The sidebar's "Data" tab becomes visible
- "Annotations" and "Relationships" tabs are hidden
- Data cells are rendered with their values, approval states, and associated annotations

This centralized data management through `useAnalysisManager` ensures consistent state across all components while maintaining clean separation of concerns between data fetching, processing, and display.
