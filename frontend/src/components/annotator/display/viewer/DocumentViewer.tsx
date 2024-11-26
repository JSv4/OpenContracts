import { useCallback, useEffect, useState } from "react";
import { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import styled from "styled-components";

import {
  BoundingBox,
  PermissionTypes,
  SinglePageAnnotationJson,
  TextSearchSpanResult,
  TokenId,
  ViewState,
} from "../../../types";
import {
  AnalysisType,
  AnnotationLabelType,
  ColumnType,
  CorpusType,
  DatacellType,
  DocumentType,
  ExtractType,
  LabelDisplayBehavior,
  LabelType,
} from "../../../../types/graphql-api";

import _ from "lodash";

import * as listeners from "../../listeners";

import AnnotatorSidebar from "../../sidebar/AnnotatorSidebar";
import { SidebarContainer } from "../../../common";

import { TextSearchTokenResult } from "../../../types";
import { AnnotatorTopbar } from "../../topbar/AnnotatorTopbar";
import useWindowDimensions from "../../../hooks/WindowDimensionHook";

import "./DocumentViewer.css";
import { RelationModal } from "../../components/modals/RelationModal";
import { PDF } from "../../renderers/pdf/PDF";
import { DocTypeLabelDisplay } from "../../labels/doc_types/DocTypeLabelDisplay";
import { LabelSelector } from "../../labels/label_selector/LabelSelector";
import { Dimmer, Loader } from "semantic-ui-react";
import { Menu } from "semantic-ui-react";
import { PDFActionBar } from "../components/ActionBar";
import {
  setTopbarVisible,
  showSelectCorpusAnalyzerOrFieldsetModal,
} from "../../../../graphql/cache";
import { MOBILE_VIEW_BREAKPOINT } from "../../../../assets/configurations/constants";
import TxtAnnotator from "../../renderers/txt/TxtAnnotator";
import {
  ServerSpanAnnotation,
  RelationGroup,
  PdfAnnotations,
  ServerTokenAnnotation,
} from "../../types/annotations";
import { PDFPageInfo } from "../../types/pdf";

export const PDFViewContainer = styled.div`
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "row",
  justifyContent: "flex-start",
`;

export const PDFViewContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

export const StyledMenu = styled(Menu)`
  &.ui.menu {
    margin: 0;
    border-radius: 0;
  }
`;

const PDFContainer = styled.div<{ width?: number }>(
  ({ width }) => `
    overflow-y: scroll;
    overflow-x: scroll;
    height: 100%;
    background: #f7f9f9;
    padding: 1rem;
    flex: 1;
  `
);

export const DocumentViewer = ({
  doc_permissions,
  corpus_permissions,
  read_only,
  view_document_only: boolean,
  data_loading,
  loading_message,
  selected_corpus,
  selected_document,
  analyses,
  extracts,
  datacells,
  columns,
  selected_analysis,
  selected_extract,
  editMode,
  allowInput,
  approveAnnotation,
  rejectAnnotation,
  setAllowInput,
  setEditMode,
  onSelectAnalysis,
  onSelectExtract,
  createAnnotation,
  updateAnnotation,
  createRelation,
  deleteAnnotation,
  containerRef,
  containerRefCallback,
  pdfAnnotations,
  scroll_to_annotation_on_open,
  setJumpedToAnnotationOnLoad,
  show_selected_annotation_only,
  show_annotation_bounding_boxes,
  show_annotation_labels,
  show_structural_annotations,
  page_token_text_maps,
  doc_text,
  doc,
  pages,
  zoom_level,
  setZoomLevel,
  humanSpanLabelChoices,
  spanLabels,
  relationLabels,
  docTypeLabels,
  shiftDown,
  setViewState,
}: {
  doc_permissions: PermissionTypes[];
  corpus_permissions: PermissionTypes[];
  read_only: boolean;
  view_document_only: boolean;
  data_loading?: boolean;
  loading_message?: string;
  selected_corpus?: CorpusType | null;
  selected_document: DocumentType | null;
  editMode: "ANNOTATE" | "ANALYZE";
  allowInput: boolean;
  zoom_level: number;
  setZoomLevel: (zl: number) => void;
  setEditMode: (m: "ANNOTATE" | "ANALYZE") => void | undefined | null;
  setAllowInput: (v: boolean) => void | undefined | null;
  analyses: AnalysisType[];
  extracts: ExtractType[];
  datacells: DatacellType[];
  columns: ColumnType[];
  selected_analysis: AnalysisType | null | undefined;
  selected_extract: ExtractType | null | undefined;
  onSelectAnalysis: (analysis: AnalysisType | null) => undefined | null | void;
  onSelectExtract: (extract: ExtractType | null) => undefined | null | void;
  createAnnotation: (added_annotation_obj: ServerTokenAnnotation) => void;
  updateAnnotation: (updated_annotation: ServerTokenAnnotation) => void;
  approveAnnotation: (annot_id: string, comment?: string) => void;
  rejectAnnotation: (annot_id: string, comment?: string) => void;
  deleteAnnotation: (annotation_id: string) => void;
  createRelation: (relation: RelationGroup) => void;
  containerRefCallback: (containerDivElement: HTMLDivElement | null) => void;
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  pdfAnnotations: PdfAnnotations;
  scroll_to_annotation_on_open: ServerTokenAnnotation | null | undefined;
  setJumpedToAnnotationOnLoad: (annot_id: string) => null | void;
  show_selected_annotation_only: boolean;
  show_annotation_bounding_boxes: boolean;
  show_structural_annotations: boolean;
  show_annotation_labels: LabelDisplayBehavior;
  page_token_text_maps: Record<number, TokenId>;
  doc_text: string;
  doc: PDFDocumentProxy | undefined;
  pages: PDFPageInfo[];
  humanSpanLabelChoices: AnnotationLabelType[];
  spanLabels: AnnotationLabelType[];
  relationLabels: AnnotationLabelType[];
  docTypeLabels: AnnotationLabelType[];
  shiftDown: boolean;
  setViewState: (v: ViewState) => void;
}) => {
  const { width } = useWindowDimensions();
  const use_mobile_layout = width <= MOBILE_VIEW_BREAKPOINT;

  const [hideSidebar, setHideSidebar] = useState<boolean>(false);
  const [scrollContainerRef, setScrollContainerRef] =
    useState<React.RefObject<HTMLDivElement>>();
  const [textSearchMatches, setTextSearchMatches] =
    useState<(TextSearchTokenResult | TextSearchSpanResult)[]>();
  const [searchText, setSearchText] = useState<string>();
  const [selectedTextSearchMatchIndex, setSelectedTextSearchMatchIndex] =
    useState<number>(0);

  const handleZoomIn = () => setZoomLevel(Math.min(zoom_level + 0.1, 4));
  const handleZoomOut = () => setZoomLevel(Math.max(zoom_level - 0.1, 0.5));

  const [selectedAnnotations, setSelectedAnnotations] = useState<string[]>(
    scroll_to_annotation_on_open ? [scroll_to_annotation_on_open.id] : []
  );
  const [pageSelection, setSelection] = useState<{
    pageNumber: number;
    bounds: BoundingBox;
  }>();
  const [pageSelectionQueue, setMultiSelections] = useState<
    Record<number, BoundingBox[]>
  >({});
  const [pdfPageInfoObjs, setPdfPageInfoObjs] = useState<
    Record<number, PDFPageInfo>
  >([]);

  const [activeSpanLabel, setActiveSpanLabel] = useState<
    AnnotationLabelType | undefined
  >(humanSpanLabelChoices.length > 0 ? humanSpanLabelChoices[0] : undefined);
  const [spanLabelsToView, setSpanLabelsToView] = useState<
    AnnotationLabelType[] | null
  >(null);
  const [activeRelationLabel, setActiveRelationLabel] =
    useState<AnnotationLabelType>(relationLabels[0]);
  const [relationModalVisible, setRelationModalVisible] =
    useState<boolean>(false);

  // We optionally hidesidebar where width < 1000 px OR we have annotation state hideSidebar flipped to false (which can happen in a number of places, including in sidebar)
  const banish_sidebar = hideSidebar || width <= 1000;
  const responsive_sidebar_width = hideSidebar ? "0px" : "400px";

  // TODO - These are dummy placeholders
  let actionBarItems = [
    {
      key: "action1",
      text: "Analyze",
      value: () => showSelectCorpusAnalyzerOrFieldsetModal(true),
    },
  ];

  if (use_mobile_layout) {
    actionBarItems = [
      ...actionBarItems,
      {
        key: "action2",
        text: "Show Analytics Topbar",
        value: () => setTopbarVisible(true),
      },
    ];
  }

  const addSpanLabelsToViewSelection = (ls: AnnotationLabelType[]) => {
    if (spanLabelsToView) {
      setSpanLabelsToView([...spanLabelsToView, ...ls]);
    } else {
      setSpanLabelsToView(ls);
    }
  };

  const clearSpanLabelsToView = () => {
    setSpanLabelsToView([]);
  };

  const removeSpanLabelsToViewSelection = (
    labelsToRemove: AnnotationLabelType[]
  ) => {
    setSpanLabelsToView((prevData) => {
      if (prevData) {
        return [...prevData].filter((viewingLabel) =>
          labelsToRemove.map((l) => l.id).includes(viewingLabel.id)
        );
      }
      return null;
    });
  };

  // Search for text when search text changes.
  useEffect(() => {
    let search_hits = [];

    // If there is searchText, search document for matches
    if (selected_document && searchText) {
      // Use RegEx search without word boundaries and case insensitive
      let exactMatch = new RegExp(searchText, "gi");
      const matches = [...doc_text.matchAll(exactMatch)];

      if (selected_document.fileType === "application/txt") {
        for (let i = 0; i < matches.length; i++) {
          // Make sure match has index and we have a map of doc char
          // index to page and token indices
          if (matches && matches[i].index !== undefined) {
            console.log(matches);
            let start_index = matches[i].index as number;
            let end_index = start_index + searchText.length;
            search_hits.push({
              id: i,
              text: doc_text.substring(start_index, end_index),
              start_index: start_index,
              end_index: end_index,
            } as TextSearchSpanResult);
          }
        }
      } else if (selected_document.fileType === "application/pdf") {
        // Cycle over matches to convert to tokens and page indices
        for (let i = 0; i < matches.length; i++) {
          // Make sure match has index and we have a map of doc char
          // index to page and token indices
          if (matches && matches[i].index && page_token_text_maps) {
            let start_index = matches[i].index;
            if (start_index) {
              let end_index = start_index + searchText.length;
              if (end_index) {
                let target_tokens = [];
                let lead_in_tokens = [];
                let lead_out_tokens = [];
                let end_page = 0;
                let start_page = 0;

                // How many chars before and after results do we want to show
                // as context
                let context_length = 128;

                if (start_index > 0) {
                  // How many tokens BEFORE the search result must we traverse to cover the context_length's
                  // worth of characters?
                  let end_text_index =
                    start_index >= context_length
                      ? start_index - context_length
                      : start_index;
                  let previous_token: TokenId | undefined = undefined;

                  // Get the tokens BEFORE the results for up to 128 chars
                  for (let a = start_index; a >= end_text_index; a--) {
                    if (previous_token === undefined) {
                      // console.log("Last_token was undefined and a is", a);
                      // console.log("Token is", page_token_text_maps[a]);
                      if (page_token_text_maps[a]) {
                        previous_token = page_token_text_maps[a];
                        start_page = previous_token.pageIndex;
                      }
                    } else if (
                      page_token_text_maps[a] &&
                      (page_token_text_maps[a].pageIndex !==
                        previous_token.pageIndex ||
                        page_token_text_maps[a].tokenIndex !==
                          previous_token.tokenIndex)
                    ) {
                      let chap = page_token_text_maps[a];
                      previous_token = chap;
                      lead_in_tokens.push(
                        pages[chap.pageIndex].tokens[chap.tokenIndex]
                      );
                      start_page = chap.pageIndex;
                    }
                  }
                }
                let lead_in_text = lead_in_tokens
                  .reverse()
                  .reduce((prev, curr) => prev + " " + curr.text, "");

                // Get actual result tokens based on the start and end token inde
                for (let j = start_index; j < end_index; j++) {
                  target_tokens.push(page_token_text_maps[j]);
                }
                var grouped_tokens = _.groupBy(target_tokens, "pageIndex");

                // Now get the text after the search match... and check context length doesn't overshoot the entire document...
                // if it does, just go to end of document.
                let end_text_index =
                  doc_text.length - end_index >= context_length
                    ? end_index + context_length
                    : end_index;
                let previous_token: TokenId | undefined = undefined;

                // Get the tokens BEFORE the results for up to 128 chars
                for (let b = end_index; b < end_text_index; b++) {
                  if (previous_token === undefined) {
                    if (page_token_text_maps[b]) {
                      previous_token = page_token_text_maps[b];
                    }
                  } else if (
                    page_token_text_maps[b] &&
                    (page_token_text_maps[b].pageIndex !==
                      previous_token.pageIndex ||
                      page_token_text_maps[b].tokenIndex !==
                        previous_token.tokenIndex)
                  ) {
                    let chap = page_token_text_maps[b];
                    previous_token = chap;
                    lead_out_tokens.push(
                      pages[chap.pageIndex].tokens[chap.tokenIndex]
                    );
                    end_page = chap.pageIndex;
                  }
                }
                let lead_out_text = lead_out_tokens.reduce(
                  (prev, curr) => prev + " " + curr.text,
                  ""
                );

                // Determine bounds for the results
                let bounds: Record<number, BoundingBox> = {};
                for (const [key, value] of Object.entries(grouped_tokens)) {
                  if (pages[parseInt(key)] !== undefined) {
                    var page_bounds =
                      pages[parseInt(key)].getBoundsForTokens(value);
                    if (page_bounds) {
                      bounds[parseInt(key)] = page_bounds;
                    }
                  }
                }

                // Now add the results detailas to the resulting matches.
                let fullContext = (
                  <span>
                    <i>{lead_in_text}</i> <b>{searchText}</b>
                    <i>{lead_out_text}</i>
                  </span>
                );
                search_hits.push({
                  id: i,
                  tokens: grouped_tokens,
                  bounds,
                  fullContext,
                  end_page,
                  start_page,
                });
              }
            }
          }
        }
      }
    }
    setTextSearchMatches(search_hits);
    setSelectedTextSearchMatchIndex(0);
  }, [searchText]);

  // React's Error Boundaries don't work for us because a lot of work is done by pdfjs in
  // a background task (a web worker). We instead setup a top level error handler that's
  // passed around as needed so we can display a nice error to the user when something
  // goes wrong.
  //
  // We have to use the `useCallback` hook here so that equality checks in child components
  // don't trigger unintentional rerenders.
  const onError = useCallback(
    (err: Error) => {
      console.error("Unexpected Error rendering PDF", err);
      setViewState(ViewState.ERROR);
    },
    [setViewState]
  );

  // Set scroll container ref on load
  useEffect(() => {
    if (containerRef) {
      setScrollContainerRef(containerRef);
    }
    return () => setScrollContainerRef(undefined);
  }, [containerRef]);

  // Listen for change in shift key and clear selections or triggered annotation creation as needed
  useEffect(() => {
    // If user released the shift key...
    if (!shiftDown) {
      // If there is a page selection in progress or a queue... then fire off DB request to store annotation
      if (
        pageSelection !== undefined ||
        Object.keys(pageSelectionQueue).length !== 0
      ) {
        // console.log("SHIFT RELEASED");
        createMultiPageAnnotation();
      }
    }
  }, [shiftDown]);

  // Go to next search match (not being used anymore due to new GUI)
  const advanceTextSearchMatch = () => {
    if (textSearchMatches) {
      if (selectedTextSearchMatchIndex < textSearchMatches.length - 1) {
        setSelectedTextSearchMatchIndex(selectedTextSearchMatchIndex + 1);
        return;
      }
    }
    setSelectedTextSearchMatchIndex(0);
  };

  // Go to last search match (not being used anymore due to new GUI)
  const reverseTextSearchMatch = () => {
    if (textSearchMatches) {
      if (selectedTextSearchMatchIndex > 0) {
        setSelectedTextSearchMatchIndex(selectedTextSearchMatchIndex - 1);
        return;
      }
    }
    setSelectedTextSearchMatchIndex(0);
  };

  const safeSetSelectedTextSearchMatchIndex = (index: number) => {
    if (textSearchMatches && textSearchMatches[index]) {
      setSelectedTextSearchMatchIndex(index);
    }
  };

  // TODO - need to figure out why this should be retained
  const onUpdatePdfAnnotations = (new_store: PdfAnnotations) => {
    console.log("onUpdatePdfAnnotations triggered...");
  };

  const onRelationModalOk = (group: RelationGroup) => {
    // TODO - hook into this to sync local relationship changes to server
    createRelation(group);
    setRelationModalVisible(false);
    setSelectedAnnotations([]);
  };

  const onRelationModalCancel = () => {
    // TODO - hook into this to sync local relationship changes to server
    setRelationModalVisible(false);
    setSelectedAnnotations([]);
  };

  const createMultiPageAnnotation = () => {
    // This will action look in our selection queue and build a json obj that
    // can be submitted to the database for storage and retrieval.

    // Only proceed if there's an active span label... otherwise, do nothing
    if (activeSpanLabel) {
      //console.log("XOXO - createMultiPageAnnotation called")
      //console.log("Queued annotations are", pageSelectionQueue);
      //console.log("Current selection is", pageSelection);
      //console.log("Page info", pdfPageInfoObjs);

      // Need to merge the queue and current selection area
      let updatedPageSelectionQueue: Record<number, BoundingBox[]> =
        pageSelectionQueue;

      // If page number is already in queue... append to queue at page number key
      if (pageSelection && pageSelection.hasOwnProperty("pageNumber")) {
        if (pageSelection.pageNumber in updatedPageSelectionQueue) {
          updatedPageSelectionQueue = {
            ...updatedPageSelectionQueue,
            [pageSelection.pageNumber]: [
              ...updatedPageSelectionQueue[pageSelection.pageNumber],
              pageSelection.bounds,
            ],
          };
        } else {
          // Otherwise, add page number as key and then add bounds to it.
          updatedPageSelectionQueue = {
            ...updatedPageSelectionQueue,
            [pageSelection?.pageNumber]: [pageSelection.bounds],
          };
        }
      }

      let annotations: Record<number, SinglePageAnnotationJson> = {};
      let combinedRawText = "";
      let firstPage = -1;

      //console.log("updatedPageSelectionQueue", updatedPageSelectionQueue);

      for (var pageNumber in updatedPageSelectionQueue) {
        //console.log("Update annotation queue for pageNumber", pageNumber);
        if (firstPage === -1) firstPage = parseInt(pageNumber);
        let page_annotation = pdfPageInfoObjs[
          parseInt(pageNumber)
        ].getPageAnnotationJson(updatedPageSelectionQueue[pageNumber]);
        if (page_annotation) {
          annotations[pageNumber] = page_annotation;
          combinedRawText += " " + page_annotation.rawText;
        }
      }

      //console.log("New Annotation json is: ", annotations);
      // Once the selection is converted to an annotation, set the the
      // selection queue to undefined to empty it and also
      // clear out our multi-selection array which is used to hold multiple selections
      // when user hits SHIFT + click to select text.
      setSelection(undefined);
      setMultiSelections([]);
      createAnnotation(
        new ServerTokenAnnotation(
          firstPage,
          activeSpanLabel,
          combinedRawText,
          false,
          annotations,
          [
            PermissionTypes.CAN_CREATE,
            PermissionTypes.CAN_REMOVE,
            PermissionTypes.CAN_UPDATE,
          ],
          false,
          false,
          true
        )
      );
    }
  };

  const getSpan = (span: { start: number; end: number; text: string }) => {
    const selectedLabel = spanLabels.find(
      (label) => label.id === activeSpanLabel?.id
    );
    if (!selectedLabel) throw new Error("Selected label not found");

    return new ServerSpanAnnotation(
      0, // Page number (assuming single page)
      selectedLabel,
      span.text,
      false, // structural
      { start: span.start, end: span.end }, // json
      [], // myPermissions
      false, // approved
      false // rejected
    );
  };

  let view_components = <></>;
  if (
    !selected_document ||
    (selected_document.fileType === "application/pdf" && !doc)
  ) {
    view_components = <></>;
  }

  if (selected_document) {
    switch (selected_document.fileType) {
      case "application/pdf":
        view_components = (
          <PDF
            read_only={read_only}
            corpus_permissions={corpus_permissions}
            doc_permissions={doc_permissions}
            shiftDown={shiftDown}
            show_selected_annotation_only={show_selected_annotation_only}
            show_annotation_bounding_boxes={show_annotation_bounding_boxes}
            show_annotation_labels={show_annotation_labels}
            setJumpedToAnnotationOnLoad={setJumpedToAnnotationOnLoad}
          />
        );
        break;
      case "application/txt":
        console.log("Application txt detected!");
        view_components = (
          <TxtAnnotator
            text={doc_text}
            annotations={
              pdfAnnotations.annotations.filter(
                (annot) => annot instanceof ServerSpanAnnotation
              ) as ServerSpanAnnotation[]
            }
            searchResults={
              textSearchMatches?.filter(
                (match): match is TextSearchSpanResult => "start_index" in match
              ) ?? []
            }
            getSpan={getSpan}
            visibleLabels={spanLabelsToView}
            availableLabels={spanLabels}
            selectedLabelTypeId={activeSpanLabel?.id ?? null}
            read_only={read_only}
            allowInput={allowInput}
            zoom_level={zoom_level}
            createAnnotation={createAnnotation}
            updateAnnotation={updateAnnotation}
            approveAnnotation={approveAnnotation}
            rejectAnnotation={rejectAnnotation}
            deleteAnnotation={deleteAnnotation}
            maxHeight="100%"
            maxWidth="100%"
            selectedAnnotations={selectedAnnotations}
            setSelectedAnnotations={setSelectedAnnotations}
            showStructuralAnnotations={show_structural_annotations}
          />
        );
        break;
      default:
        view_components = (
          <div>
            <p>Unsupported filetype: {selected_document.fileType}</p>
          </div>
        );
        break;
    }

    return (
      <div>
        <listeners.UndoAnnotation />
        <listeners.HandleAnnotationSelection
          setModalVisible={setRelationModalVisible}
        />
        <listeners.HideAnnotationLabels />
        <div
          className="PDFViewContainer"
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "row",
            justifyContent: "flex-start",
          }}
        >
          {!read_only &&
          allowInput &&
          !selected_analysis &&
          corpus_permissions.includes(PermissionTypes.CAN_UPDATE) ? (
            <LabelSelector
              sidebarWidth={responsive_sidebar_width}
              humanSpanLabelChoices={humanSpanLabelChoices}
              activeSpanLabel={activeSpanLabel ? activeSpanLabel : null}
              setActiveLabel={setActiveSpanLabel}
            />
          ) : (
            <></>
          )}
          {(!selected_extract ||
            pdfAnnotations.annotations.filter(
              (annot) =>
                annot.annotationLabel.labelType === LabelType.DocTypeLabel
            ).length > 0) && (
            <DocTypeLabelDisplay
              read_only={
                Boolean(selected_analysis) ||
                Boolean(selected_extract) ||
                read_only ||
                !corpus_permissions.includes(PermissionTypes.CAN_UPDATE)
              }
            />
          )}

          <Dimmer active={data_loading !== undefined ? data_loading : false}>
            <Loader content={loading_message ? loading_message : ""} />
          </Dimmer>
          <SidebarContainer
            width={responsive_sidebar_width}
            {...(banish_sidebar ? { display: "none" } : {})}
          >
            <AnnotatorSidebar
              read_only={read_only}
              selected_analysis={selected_analysis}
              selected_extract={selected_extract}
              selected_corpus={selected_corpus}
              columns={columns}
              datacells={datacells}
              editMode={editMode}
              setEditMode={setEditMode}
              allowInput={allowInput}
              setAllowInput={setAllowInput}
            />
          </SidebarContainer>
          <div className="PDFViewTopBarWrapper">
            <AnnotatorTopbar
              opened_corpus={selected_corpus}
              opened_document={selected_document}
              extracts={extracts}
              analyses={analyses}
              selected_analysis={selected_analysis}
              selected_extract={selected_extract}
              onSelectAnalysis={onSelectAnalysis}
              onSelectExtract={onSelectExtract}
            >
              <PDFActionBar
                zoom={zoom_level}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                actionItems={actionBarItems}
              />
              <PDFContainer
                className="PDFContainer"
                ref={containerRefCallback}
                width={banish_sidebar ? 1200 : undefined}
              >
                {activeRelationLabel &&
                !read_only &&
                corpus_permissions.includes(PermissionTypes.CAN_UPDATE) ? (
                  <RelationModal
                    visible={relationModalVisible}
                    source={selectedAnnotations}
                    label={activeRelationLabel}
                  />
                ) : null}
                {view_components}
              </PDFContainer>
            </AnnotatorTopbar>
          </div>
        </div>
      </div>
    );
  }

  // Add an explicit return for when selected_document is falsy
  return null; // or return a loading/empty state component
};
