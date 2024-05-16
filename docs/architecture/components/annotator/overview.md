# Open Contracts Annotator Components

## Key Questions

1. How is the PDF loaded?
   - The PDF is loaded in the `Annotator.tsx` component.
   - Inside the `useEffect` hook that runs when the `openedDocument` prop changes, the PDF loading process is initiated.
   - The `pdfjsLib.getDocument` function from the `pdfjs-dist` library is used to load the PDF file specified by `openedDocument.pdfFile`.
   - The loading progress is tracked using the `loadingTask.onProgress` callback, which updates the `progress` state.
   - Once the PDF is loaded, the `loadingTask.promise` is resolved, and the `PDFDocumentProxy` object is obtained.
   - The `PDFPageInfo` objects are created for each page of the PDF using `doc.getPage(i)` and stored in the `pages` state.

2. Where and how are annotations loaded?
   - Annotations are loaded using the `REQUEST_ANNOTATOR_DATA_FOR_DOCUMENT` GraphQL query in the `Annotator.tsx` component.
   - The `useQuery` hook from Apollo Client is used to fetch the annotator data based on the provided `initial_query_vars`.
   - The `annotator_data` received from the query contains information about existing text annotations, document label annotations, and relationships.
   - The annotations are transformed into `ServerAnnotation`, `DocTypeAnnotation`, and `RelationGroup` objects and stored in the `pdfAnnotations` state using `setPdfAnnotations`.

3. Where is the PAWLs layer loaded?
   - The PAWLs layer is loaded in the `Annotator.tsx` component.
   - Inside the `useEffect` hook that runs when the `openedDocument` prop changes, the PAWLs layer is loaded using the `getPawlsLayer` function from `api/rest.ts`.
   - The `getPawlsLayer` function makes an HTTP GET request to fetch the PAWLs data file specified by `openedDocument.pawlsParseFile`.
   - The PAWLs data is expected to be an array of `PageTokens` objects, which contain token information for each page of the PDF.
   - The loaded PAWLs data is then used to create `PDFPageInfo` objects for each page, which include the page tokens.

## High-level Components Overview

   - The `Annotator` component is the top-level component that manages the state and data loading for the annotator.
   - It renders the `PDFView` component, which is responsible for displaying the PDF and annotations.
   - The `PDFView` component renders various sub-components, such as `LabelSelector`, `DocTypeLabelDisplay`, `AnnotatorSidebar`, `AnnotatorTopbar`, and `PDF`.
   - The `PDF` component renders individual `Page` components for each page of the PDF.
   - Each `Page` component renders `Selection` and `SearchResult` components for annotations and search results, respectively.
   - The `AnnotatorSidebar` component displays the list of annotations, relations, and a search widget.
   - The `PDFStore` and `AnnotationStore` are context providers that hold the PDF and annotation data, respectively.

## Specific Component Deep Dives

### PDFView.tsx

The `PDFView` component is a top-level component that renders the PDF document with annotations, relations, and text search capabilities. It manages the state and functionality related to annotations, relations, and user interactions. Here's a detailed explanation of how the component works:

1. The `PDFView` component receives several props, including permissions, callbacks for CRUD operations on annotations and relations, refs for container and selection elements, and various configuration options.

2. It initializes several state variables using the `useState` hook, including:
   - `selectionElementRefs` and `searchResultElementRefs`: Refs for annotation selections and search results.
   - `pageElementRefs`: Refs for individual PDF pages.
   - `scrollContainerRef`: Ref for the scroll container.
   - `textSearchMatches` and `searchText`: State for text search matches and search text.
   - `selectedAnnotations` and `selectedRelations`: State for currently selected annotations and relations.
   - `pageSelection` and `pageSelectionQueue`: State for current page selection and queued selections.
   - `pdfPageInfoObjs`: State for PDF page information objects.
   - Various other state variables for active labels, relation modal visibility, and annotation options.

3. The component defines several functions for updating state and handling user interactions, such as:
   - `insertSelectionElementRef`, `insertSearchResultElementRefs`, and `insertPageRef`: Functions to add refs for selections, search results, and pages.
   - `onError`: Error handling callback.
   - `advanceTextSearchMatch` and `reverseTextSearchMatch`: Functions to navigate through text search matches.
   - `onRelationModalOk` and `onRelationModalCancel`: Callbacks for relation modal actions.
   - `createMultiPageAnnotation`: Function to create a multi-page annotation from queued selections.

4. The component uses the `useEffect` hook to handle side effects, such as:
   - Setting the scroll container ref on load.
   - Listening for changes in the shift key and triggering annotation creation.
   - Updating text search matches when the search text changes.

5. The component renders the PDF document and its related components using the `PDFStore` and `AnnotationStore` contexts:
   - The `PDFStore` context provides the PDF document, pages, and error handling.
   - The `AnnotationStore` context provides annotation-related state and functions.

6. The component renders the following main sections:
   - `LabelSelector`: Allows the user to select the active label for annotations.
   - `DocTypeLabelDisplay`: Displays the document type labels.
   - `AnnotatorSidebar`: Sidebar component for managing annotations and relations.
   - `AnnotatorTopbar`: Top bar component for additional controls and options.
   - `PDF`: The actual PDF component that renders the PDF pages and annotations.

7. The `PDF` component, defined in `PDF.tsx`, is responsible for rendering the PDF pages and annotations. It receives props from the `PDFView` component, such as permissions, configuration options, and callbacks.

8. The `PDF` component maps over each page of the PDF document and renders a `Page` component for each page, passing the necessary props.

9. The `Page` component, also defined in `PDF.tsx`, is responsible for rendering a single page of the PDF document along with its annotations and search results. It handles mouse events for creating and modifying annotations.

10. The `PDFView` component also renders the `RelationModal` component when the active relation label is set and the user has the necessary permissions. The modal allows the user to create or modify relations between annotations.

### PDF.tsx

`PDF` renders the actual PDF document with annotations and text search capabilities. PDFView (see above) is what actually
interacts with the backend / API.

1. The `PDF` component receives several props:
   - `shiftDown`: Indicates whether the Shift key is pressed (optional).
   - `doc_permissions` and `corpus_permissions`: Specify the permissions for the document and corpus, respectively.
   - `read_only`: Determines if the component is in read-only mode.
   - `show_selected_annotation_only`: Specifies whether to show only the selected annotation.
   - `show_annotation_bounding_boxes`: Specifies whether to show annotation bounding boxes.
   - `show_annotation_labels`: Specifies the behavior for displaying annotation labels.
   - `setJumpedToAnnotationOnLoad`: A callback function to set the jumped-to annotation on load.
2. The `PDF` component retrieves the PDF document and pages from the `PDFStore` context.
3. It maps over each page of the PDF document and renders a `Page` component for each page, passing the necessary props.
4. The `Page` component is responsible for rendering a single page of the PDF document along with its annotations and search results.
5. Inside the `Page` component:
   - It creates a canvas element using the `useRef` hook to render the PDF page.
   - It retrieves the annotations for the current page from the `AnnotationStore` context.
   - It defines a `ConvertBoundsToSelections` function that converts the selected bounds to annotations and tokens.
   - It uses the `useEffect` hook to set up the PDF page rendering and event listeners for resizing and scrolling.
   - It renders the PDF page canvas, annotations, search results, and queued selections.
6. The `Page` component renders the following sub-components:
   - `PageAnnotationsContainer`: A styled container for the page annotations.
   - `PageCanvas`: A styled canvas element for rendering the PDF page.
   - `Selection`: Represents a single annotation selection on the page.
   - `SearchResult`: Represents a search result on the page.
7. The `Page` component handles mouse events for creating and modifying annotations:
   - On `mouseDown`, it initializes the selection if the necessary permissions are granted and the component is not in read-only mode.
   - On `mouseMove`, it updates the selection bounds if a selection is active.
   - On `mouseUp`, it adds the completed selection to the `pageSelectionQueue` and triggers the creation of a multi-page annotation if the Shift key is not pressed.
8. The `Page` component also handles fetching more annotations for previous and next pages using the `FetchMoreOnVisible` component.
9. The `SelectionBoundary` and `SelectionTokens` components are used to render the annotation boundaries and tokens, respectively.
10. The `PDFPageRenderer` class is responsible for rendering a single PDF page on the canvas. It manages the rendering tasks and provides methods for canceling and rescaling the rendering.
11. The `getPageBoundsFromCanvas` function calculates the bounding box of the page based on the canvas dimensions and its parent container.
