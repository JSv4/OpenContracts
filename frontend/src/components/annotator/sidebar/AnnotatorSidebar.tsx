import { useContext, useEffect, useMemo, useState } from "react";
import {
  Tab,
  Card,
  Segment,
  Popup,
  Header,
  Icon,
  Placeholder,
  SemanticShorthandItem,
  TabPaneProps,
  TabProps,
  SemanticICONS,
} from "semantic-ui-react";

import _, { isNumber } from "lodash";
import { AnnotationStore, RelationGroup } from "../context";
import { HighlightItem } from "./HighlightItem";
import { RelationItem } from "./RelationItem";

import "./AnnotatorSidebar.css";
import { useReactiveVar } from "@apollo/client";
import {
  showSelectedAnnotationOnly,
  showAnnotationBoundingBoxes,
  showAnnotationLabels,
  openedCorpus,
  openedDocument,
  selectedAnalysis,
} from "../../../graphql/cache";
import {
  AnalysisType,
  ColumnType,
  CorpusType,
  DatacellType,
  ExtractType,
} from "../../../graphql/types";
import { SearchSidebarWidget } from "../search_widget/SearchSidebarWidget";
import { FetchMoreOnVisible } from "../../widgets/infinite_scroll/FetchMoreOnVisible";
import useWindowDimensions from "../../hooks/WindowDimensionHook";
import { SingleDocumentExtractResults } from "../../extracts/SingleDocumentExtractResults";
import { label_display_options, PermissionTypes } from "../../types";
import { getPermissions } from "../../../utils/transform";
import { PlaceholderCard } from "../../placeholders/PlaceholderCard";
import { CorpusStats } from "../../widgets/data-display/CorpusStatus";
import styled from "styled-components";

interface TabPanelProps {
  pane?: SemanticShorthandItem<TabPaneProps>;
  menuItem?: any;
  render?: () => React.ReactNode;
}

const getHeaderInfo = (
  edit_mode: "ANNOTATE" | "ANALYZE",
  allow_input: boolean,
  read_only: boolean
) => {
  let header_text = "";
  let subheader_text = "";
  let tooltip_text = "";

  if (edit_mode === "ANALYZE") {
    header_text = "Analyses";
    subheader_text = "Machine-created annotations.";

    if (allow_input && !read_only) {
      header_text += " (Feedback Mode)";
      subheader_text += " You can provide feedback on these annotations.";
      tooltip_text =
        "In feedback mode, you can approve, reject, or suggest changes to machine-generated annotations.";
    } else {
      header_text += " (View Mode)";
      tooltip_text =
        "Check out Gremlin for more information on how to create or install NLP microservices that generate Open Contracts compatible annotations.";
    }
  } else {
    header_text = "Annotations";

    if (edit_mode === "ANNOTATE") {
      if (allow_input && !read_only) {
        header_text += " (Edit Mode)";
        subheader_text = "You can create, edit, and delete annotations.";
        tooltip_text =
          "To create a highlight, drag to select the desired text. The label selected in the 'Selected Label:' box below will be applied. SHIFT + click to select multiple, separate regions.";
      } else {
        header_text += " (View Mode)";
        subheader_text =
          "You are viewing pre-existing annotations. Editing is currently disabled.";
        tooltip_text = "Switch to Edit Mode to make changes to annotations.";
      }
    } else {
      header_text += " (View Mode)";
      subheader_text = "You are viewing human-created annotations.";
      tooltip_text =
        "Switch to Human Annotation Mode and then to Edit Mode to make changes to annotations.";
    }
  }

  if (read_only) {
    subheader_text += " You do not have edit permissions for this corpus.";
    tooltip_text =
      "The annotator is in read-only mode. You can view annotations but can't edit or create new ones. If this is unexpected, check your permissions or whether you've selected machine-created analyses.";
  }

  return { header_text, subheader_text, tooltip_text };
};

const SidebarContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  box-shadow: -2px 0 5px rgba(0, 0, 0, 0.1);
`;

const TopSection = styled.div`
  padding: 1rem;
  padding-left: 3rem;
  border-bottom: 1px solid #e0e0e0;
`;

const HeaderText = styled(Header)`
  margin: 0 !important;
  display: flex;
  align-items: center;
  justify-content: space-between;

  .content {
    font-size: 1.2em;
    color: #2c3e50;
  }

  .sub.header {
    margin-top: 0.25rem;
    font-size: 0.9em;
    color: #7f8c8d;
  }
`;

const StyledTab = styled(Tab)`
  flex: 1;
  display: flex;
  flex-direction: column;

  .ui.secondary.menu {
    justify-content: center;
    padding: 0;
    padding-top: 1rem;
    margin: 0;
    border-bottom: 1px solid #e0e0e0;
  }

  .item {
    flex: 1;
    justify-content: center;
    color: #34495e;
    font-weight: 600;
    border-bottom: 2px solid transparent;

    &.active {
      color: #2185d0;
      border-color: #2185d0;
    }
  }

  .ui.segment {
    flex: 1;
    overflow-y: auto;
    border: none;
    border-radius: 0;
    margin: 0;
    padding: 1rem;
  }
`;

const ContentContainer = styled.div`
  height: 100%;
  overflow-y: auto;
  padding-right: 8px;
  display: flex;
  flex-direction: column;
`;

export const AnnotatorSidebar = ({
  read_only,
  selected_corpus,
  selected_analysis,
  selected_extract,
  allowInput,
  editMode,
  datacells,
  columns,
  setEditMode,
  setAllowInput,
  fetchMore,
}: {
  read_only: boolean;
  selected_corpus?: CorpusType | null | undefined;
  selected_analysis?: AnalysisType | null | undefined;
  selected_extract?: ExtractType | null | undefined;
  editMode: "ANNOTATE" | "ANALYZE";
  allowInput: boolean;
  datacells: DatacellType[];
  columns: ColumnType[];
  setEditMode: (m: "ANNOTATE" | "ANALYZE") => void | undefined | null;
  setAllowInput: (v: boolean) => void | undefined | null;
  fetchMore?: () => void;
}) => {
  const annotationStore = useContext(AnnotationStore);
  const label_display_behavior = useReactiveVar(showAnnotationLabels);
  const opened_corpus = useReactiveVar(openedCorpus);
  const opened_document = useReactiveVar(openedDocument);

  // Slightly kludgy way to handle responsive layout and drop sidebar once it becomes a pain
  // If there's enough interest to warrant a refactor, we can put some more thought into how
  // to handle the layout on a cellphone / small screen.
  const { width } = useWindowDimensions();
  const show_minimal_layout = width <= 1000;

  const { header_text, subheader_text, tooltip_text } = getHeaderInfo(
    selected_analysis || selected_extract ? "ANALYZE" : "ANNOTATE",
    allowInput,
    read_only ||
      (!selected_analysis && !selected_extract && !opened_corpus?.labelSet)
  );

  const show_selected_annotation_only = useReactiveVar(
    showSelectedAnnotationOnly
  );
  const show_annotation_bounding_boxes = useReactiveVar(
    showAnnotationBoundingBoxes
  );

  const [showCorpusStats, setShowCorpusStats] = useState(false);
  const [showSearchPane, setShowSearchPane] = useState(true);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [panes, setPanes] = useState<TabPanelProps[]>([]);

  const handleTabChange = (
    event: React.MouseEvent<HTMLDivElement>,
    data: TabProps
  ) => {
    console.log("Should set active index to ", data.activeIndex);
    if (data?.activeIndex !== undefined) {
      if (isNumber(data.activeIndex)) {
        setActiveIndex(data.activeIndex);
      } else {
        setActiveIndex(parseInt(data.activeIndex));
      }
    }
  };

  const {
    showStructuralLabels,
    toggleShowStructuralLabels,
    textSearchMatches,
    selectedRelations,
    pdfAnnotations,
    setHideSidebar,
    hideSidebar,
  } = annotationStore;
  const annotations = pdfAnnotations.annotations;
  const relations = pdfAnnotations.relations;

  const filteredAnnotations = useMemo(() => {
    if (
      !annotationStore.showOnlySpanLabels ||
      annotationStore.showOnlySpanLabels.length === 0
    ) {
      return annotations;
    }
    return annotations.filter((annotation) =>
      annotationStore.showOnlySpanLabels?.some(
        (label) => label.id === annotation.annotationLabel.id
      )
    );
  }, [annotations, annotationStore.showOnlySpanLabels]);

  useEffect(() => {
    try {
      let corpus_permissions: PermissionTypes[] = [];
      let raw_corp_permissions = selected_corpus
        ? selected_corpus.myPermissions
        : ["READ"];
      if (selected_corpus && raw_corp_permissions !== undefined) {
        corpus_permissions = getPermissions(raw_corp_permissions);
      }

      let panes: TabPanelProps[] = [];

      // Show annotations IF we have annotations to display OR we can create them and have a valid labelSet
      const show_annotation_pane =
        !selected_extract &&
        (annotations.length > 0 ||
          (selected_corpus?.labelSet &&
            corpus_permissions.includes(PermissionTypes.CAN_UPDATE)));

      if (show_annotation_pane) {
        let text_highlight_elements = [<></>];
        if (filteredAnnotations && filteredAnnotations.length > 0) {
          text_highlight_elements = _.orderBy(
            filteredAnnotations,
            (annotation) => annotation.page
          ).map((annotation, index) => {
            return (
              <HighlightItem
                key={`highlight_item_${index}`}
                className={annotation.id}
                annotation={annotation}
                read_only={read_only}
                relations={relations}
                onDelete={onDeleteAnnotation}
                onSelect={toggleSelectedAnnotation}
              />
            );
          });
          text_highlight_elements.push(
            <FetchMoreOnVisible
              fetchNextPage={fetchMore ? () => fetchMore() : () => {}}
              fetchWithoutMotion
            />
          );
        } else {
          text_highlight_elements = [
            <PlaceholderCard
              style={{ flex: 1 }}
              title="No Matching Annotations Found"
              description="No annotations match the selected labels, or no annotations have been created yet."
            />,
          ];
        }

        panes = [
          ...panes,
          {
            menuItem: "Annotated Text",
            render: () => (
              <Tab.Pane
                key="AnnotatorSidebar_Spantab"
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  justifyItems: "flex-start",
                  padding: "1em",
                  flexBasis: "100px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyItems: "flex-start",
                    flex: 1,
                    minHeight: 0,
                    flexBasis: "100px",
                  }}
                >
                  <Segment
                    attached="top"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      justifyItems: "flex-start",
                      flex: 1,
                      flexBasis: "100px",
                      overflow: "hidden",
                      paddingBottom: ".5rem",
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        flexBasis: "100px",
                        overflow: "auto",
                      }}
                    >
                      <ul className="sidebar__annotations">
                        {text_highlight_elements}
                      </ul>
                    </div>
                  </Segment>
                </div>
              </Tab.Pane>
            ),
          },
        ];
      }

      const show_relation_pane =
        !selected_extract &&
        (relations.length > 0 ||
          (selected_corpus?.labelSet &&
            corpus_permissions.includes(PermissionTypes.CAN_UPDATE)));

      if (show_relation_pane) {
        let relation_elements = [<></>];
        if (relations && relations.length > 0) {
          relation_elements = relations?.map((relation, index) => {
            let source_annotations = _.intersectionWith(
              annotations,
              relation.sourceIds,
              ({ id }, annotationId: string) => id === annotationId
            );

            let target_annotations = _.intersectionWith(
              annotations,
              relation.targetIds,
              ({ id }, annotationId: string) => id === annotationId
            );

            return (
              <RelationItem
                key={`relation_item_${relation.id}`}
                relation={relation}
                read_only={read_only}
                selected={selectedRelations.includes(relation)}
                source_annotations={source_annotations}
                target_annotations={target_annotations}
                onSelectAnnotation={toggleSelectedAnnotation}
                onSelectRelation={() =>
                  toggleSelectedRelation(relation, [
                    ...target_annotations.map((a) => a.id),
                    ...source_annotations.map((a) => a.id),
                  ])
                }
                onRemoveAnnotationFromRelation={onRemoveAnnotationFromRelation}
                onDeleteRelation={onDeleteRelation}
              />
            );
          });
          // TODO - add fetch more on visible.
        } else {
          relation_elements = [
            <PlaceholderCard
              style={{ flex: 1 }}
              title="No Relations Found"
              description="Either no matching relations were created or you didn't create them yet."
            />,
          ];
        }

        panes = [
          ...panes,
          {
            menuItem: "Relationships",
            render: () => (
              <Tab.Pane
                key="AnnotatorSidebar_Relationshiptab"
                style={{
                  overflowY: "scroll",
                  margin: "0px",
                  width: "100%",
                  flex: 1,
                }}
              >
                <Card.Group key="relationship_card_group">
                  {relation_elements}
                </Card.Group>
              </Tab.Pane>
            ),
          },
        ];
      }

      const show_search_results_pane = textSearchMatches.length > 0;
      if (show_search_results_pane) {
        panes = [
          ...panes,
          {
            menuItem: "Search",
            render: () => (
              <Tab.Pane
                key="AnnotatorSidebar_Searchtab"
                style={{
                  margin: "0px",
                  width: "100%",
                  height: "100%",
                  padding: "0px",
                  overflow: "hidden",
                }}
              >
                <SearchSidebarWidget />
              </Tab.Pane>
            ),
          },
        ];
        setShowSearchPane(true);
      } else {
        setShowSearchPane(false);
      }

      // Show data pane IF we have a selected_extract;
      const show_data_pane = Boolean(selected_extract);
      if (show_data_pane) {
        panes = [
          ...panes,
          {
            menuItem: "Data",
            render: () => (
              <Tab.Pane style={{ flex: 1 }}>
                {selected_extract ? (
                  // Render extract data here
                  <SingleDocumentExtractResults
                    datacells={datacells}
                    columns={columns}
                  />
                ) : (
                  <Placeholder fluid />
                )}
              </Tab.Pane>
            ),
          },
        ];
      }

      setHideSidebar(
        !show_annotation_pane &&
          !show_relation_pane &&
          !show_search_results_pane &&
          !show_data_pane
      );

      setPanes(panes);
    } catch {}
  }, [
    filteredAnnotations,
    relations,
    textSearchMatches,
    selected_corpus,
    hideSidebar,
    setHideSidebar,
  ]);

  useEffect(() => {
    if (showSearchPane) {
      setActiveIndex(panes.length - 1);
    }
  }, [showSearchPane, panes]);

  // If our activeIndex is out of bounds, reset to 0
  useEffect(() => {
    if (activeIndex > panes.length - 1) {
      setActiveIndex(0);
    }
  }, [panes, activeIndex]);

  // If we have search results pane open... set index to last index

  const onRemoveAnnotationFromRelation = (
    annotationId: string,
    relationId: string
  ) => {
    annotationStore.removeAnnotationFromRelation(annotationId, relationId);
  };

  const onDeleteAnnotation = (annotationId: string) => {
    annotationStore.deleteAnnotation(annotationId);
  };

  const onDeleteRelation = (relationId: string) => {
    annotationStore.deleteRelation(relationId);
  };

  const toggleSelectedAnnotation = (toggledId: string) => {
    if (annotationStore.selectedAnnotations.includes(toggledId)) {
      annotationStore.setSelectedAnnotations(
        annotationStore.selectedAnnotations.filter(
          (annotationId) => annotationId !== toggledId
        )
      );
    }
    // If the toggle is flipping us over to SELECTED
    else {
      let annotation = annotationStore.pdfAnnotations.annotations.filter(
        (annotation_obj) => annotation_obj.id === toggledId
      )[0];
      // Check the proposed id is actually in the annotation store
      if (annotation) {
        // If it is, and we have a reference to it in our annotation reference obj
        if (annotationStore.selectionElementRefs?.current[annotation.id]) {
          // Scroll annotation into view.
          annotationStore.selectionElementRefs?.current[
            annotation.id
          ]?.scrollIntoView();
        }
      }
      annotationStore.setSelectedAnnotations([toggledId]);
    }
  };

  const toggleSelectedRelation = (
    toggled_relation: RelationGroup,
    implicated_annotations: string[]
  ) => {
    if (
      _.find(annotationStore.selectedRelations, { id: toggled_relation.id })
    ) {
      annotationStore.setSelectedRelations(
        annotationStore.selectedRelations.filter(
          (relation) => relation.id !== toggled_relation.id
        )
      );
      annotationStore.setSelectedAnnotations([]);
    } else {
      annotationStore.setSelectedRelations([toggled_relation]);
      annotationStore.setSelectedAnnotations(implicated_annotations);
    }
  };

  return (
    <SidebarContainer
      style={{ display: hideSidebar || show_minimal_layout ? "none" : "flex" }}
    >
      <TopSection>
        <HeaderText as="h3">
          <Header.Content>
            {header_text}
            <Header.Subheader>{subheader_text}</Header.Subheader>
          </Header.Content>
          <Popup
            on="click"
            onClose={() => setShowCorpusStats(false)}
            onOpen={() => setShowCorpusStats(true)}
            open={showCorpusStats}
            position="bottom right"
            trigger={
              <Icon
                name={
                  opened_corpus ? "book" : ("book outline" as SemanticICONS)
                }
                size="large"
              />
            }
            flowing
            hoverable
          >
            {opened_corpus ? (
              <CorpusStats
                corpus={opened_corpus}
                onUnselect={() => openedCorpus(null)}
              />
            ) : (
              <Header as="h4" icon textAlign="center">
                <Icon name="search" circular />
                <Header.Content>No corpus selected</Header.Content>
              </Header>
            )}
          </Popup>
        </HeaderText>
      </TopSection>
      <StyledTab
        menu={{ secondary: true, pointing: true }}
        activeIndex={activeIndex}
        onTabChange={handleTabChange}
        panes={panes.map((pane) => ({
          ...pane,
          render: () => (
            <ContentContainer>
              {pane.render ? pane.render() : null}
            </ContentContainer>
          ),
        }))}
      />
    </SidebarContainer>
  );
};

export default AnnotatorSidebar;
