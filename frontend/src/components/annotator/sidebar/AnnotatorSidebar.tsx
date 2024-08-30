import { useContext } from "react";
import {
  Tab,
  Card,
  Segment,
  TabProps,
  Label,
  Popup,
  Grid,
  Checkbox,
  Header,
  Dropdown,
  Icon,
  Placeholder,
  Message,
} from "semantic-ui-react";

import _ from "lodash";
import { AnnotationStore, RelationGroup } from "../context";
import { HighlightItem } from "./HighlightItem";
import { RelationItem } from "./RelationItem";

import "./AnnotatorSidebar.css";
import { useReactiveVar } from "@apollo/client";
import {
  showSelectedAnnotationOnly,
  showAnnotationBoundingBoxes,
  showAnnotationLabels,
  selectedAnalyses,
} from "../../../graphql/cache";
import {
  AnalysisType,
  ColumnType,
  CorpusType,
  DatacellType,
  DocumentType,
  ExtractType,
  LabelDisplayBehavior,
} from "../../../graphql/types";
import { SearchSidebarWidget } from "../search_widget/SearchSidebarWidget";
import { FetchMoreOnVisible } from "../../widgets/infinite_scroll/FetchMoreOnVisible";
import useWindowDimensions from "../../hooks/WindowDimensionHook";
import { ViewLabelSelector } from "../view_labels_selector/ViewLabelSelector";
import { SingleDocumentExtractResults } from "../../../extracts/SingleDocumentExtractResults";
import { AnnotatorModeToggle } from "../../widgets/buttons/AnnotatorModeToggle";

const label_display_options = [
  { key: 1, text: "Always Show", value: LabelDisplayBehavior.ALWAYS },
  { key: 2, text: "Always Hide", value: LabelDisplayBehavior.HIDE },
  { key: 3, text: "Show on Hover", value: LabelDisplayBehavior.ON_HOVER },
];

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

    if (edit_mode == "ANNOTATE") {
      if (allow_input && !read_only) {
        header_text += " (Edit Mode)";
        subheader_text = "You can create, edit, and delete annotations.";
        tooltip_text =
          "To create a highlight, drag to select the desired text. The label selected in the 'Selected Label:' box below will be applied. SHIFT + click to select multiple, separate regions.";
      } else {
        header_text += " (View Mode)";
        subheader_text =
          "You are viewing human-created annotations. Editing is currently disabled.";
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

export const AnnotatorSidebar = ({
  read_only,
  selected_corpus,
  selected_analysis,
  selected_extract,
  opened_document,
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
  opened_document: DocumentType;
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

  console.log("Annotator sidebar - selected_corpus", selected_corpus);

  // Slightly kludgy way to handle responsive layout and drop sidebar once it becomes a pain
  // If there's enough interest to warrant a refactor, we can put some more thought into how
  // to handle the layout on a cellphone / small screen.
  const { width } = useWindowDimensions();
  const show_minimal_layout = width <= 1000;

  const { header_text, subheader_text, tooltip_text } = getHeaderInfo(
    editMode,
    allowInput,
    read_only
  );

  const show_selected_annotation_only = useReactiveVar(
    showSelectedAnnotationOnly
  );
  const show_annotation_bounding_boxes = useReactiveVar(
    showAnnotationBoundingBoxes
  );

  const annotations = annotationStore.pdfAnnotations.annotations;
  const relations = annotationStore.pdfAnnotations.relations;
  const selectedRelations = annotationStore.selectedRelations;
  const { showStructuralLabels, toggleShowStructuralLabels } = annotationStore;

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
    // console.log("Toggle annotation, ", toggledId);
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

  const handleTabChange = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
    data: TabProps
  ) => {
    console.log("Sidebar tab changed to ", data.activeIndex);
    // If we change to labels from relationships, make sure to unselect selected annotations
    if (data.activeIndex === 0) {
      annotationStore.setSelectedRelations([]);
      annotationStore.setSelectedAnnotations([]);
    }
    // If we change from labels to relationships, make sure to unselect the selected labels
    if (data.activeIndex === 1) {
      annotationStore.setSelectedAnnotations([]);
    }
  };

  let text_highlight_elements = [<></>];
  if (annotations && annotations?.length > 0) {
    text_highlight_elements = _.orderBy(
      annotations,
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
  }
  text_highlight_elements.push(
    <FetchMoreOnVisible
      fetchNextPage={fetchMore ? () => fetchMore() : () => {}}
      fetchWithoutMotion
    />
  );

  let relation_elements = relations?.map((relation, index) => {
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

  let panes = [
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

  if (editMode == "ANALYZE") {
    if (selected_analysis) {
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
                width: "100%",
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
                  <Popup
                    on="click"
                    trigger={
                      <Label as="a" corner="left" icon="eye" color="violet" />
                    }
                    style={{ padding: "0px" }}
                  >
                    <Grid
                      celled="internally"
                      columns="equal"
                      style={{ width: `400px` }}
                    >
                      <Grid.Row>
                        <Grid.Column textAlign="center" verticalAlign="middle">
                          <Header size="tiny">Show Only Selected</Header>
                          <Checkbox
                            toggle
                            onChange={(e, data) =>
                              showSelectedAnnotationOnly(data.checked)
                            }
                            checked={show_selected_annotation_only}
                          />
                        </Grid.Column>
                        <Grid.Column textAlign="center" verticalAlign="middle">
                          <Header size="tiny">Show Layout Blocks</Header>
                          <Checkbox
                            toggle
                            onChange={(e, data) => toggleShowStructuralLabels()}
                            checked={showStructuralLabels}
                          />
                        </Grid.Column>
                        <Grid.Column textAlign="center" verticalAlign="middle">
                          <Header size="tiny">Show Bounding Boxes</Header>
                          <Checkbox
                            toggle
                            onChange={(e, data) =>
                              showAnnotationBoundingBoxes(data.checked)
                            }
                            checked={show_annotation_bounding_boxes}
                          />
                        </Grid.Column>
                      </Grid.Row>
                      <Grid.Row>
                        <Grid.Column textAlign="center" verticalAlign="middle">
                          <Header size="tiny">Label Display Behavior</Header>
                          <Dropdown
                            onChange={(e, { value }) =>
                              showAnnotationLabels(
                                value as LabelDisplayBehavior
                              )
                            }
                            options={label_display_options}
                            selection
                            value={label_display_behavior}
                            style={{ minWidth: "12em" }}
                          />
                        </Grid.Column>
                        <Grid.Column textAlign="center" verticalAlign="middle">
                          <Header size="tiny">These Labels Only</Header>
                          <ViewLabelSelector />
                        </Grid.Column>
                      </Grid.Row>
                    </Grid>
                  </Popup>
                  <div
                    style={{ flex: 1, flexBasis: "100px", overflow: "scroll" }}
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
    } else if (selected_extract) {
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
    } else {
      panes = [
        ...panes,
        {
          menuItem: "Pick an Analysis",
          render: () => (
            <Tab.Pane
              key="AnnotatorSidebar_Spantab"
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyItems: "flex-start",
                padding: "1em",
                width: "100%",
                flexBasis: "100px",
              }}
            >
              <div>
                <Message warning>
                  <Message.Header>
                    No Selected Extract or Analysis
                  </Message.Header>
                  <p>
                    To view or provide feedback on annotations, you need to
                    select an analysis or extract from the topbar. If none is
                    available, try running one first!.
                  </p>
                </Message>
              </div>
            </Tab.Pane>
          ),
        },
      ];
    }
  } else if (editMode == "ANNOTATE") {
    // if a labelset is not selected... we have nothing to display and nothing to edit
    if (!selected_corpus?.labelSet) {
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
                width: "100%",
                flexBasis: "100px",
              }}
            >
              <div>
                <Message warning>
                  <Message.Header>
                    No Selected Corpus or Labelset
                  </Message.Header>
                  <p>
                    To view or edit human annotations, you need to ensure you're
                    working with a corpus that has a linked Labelset.
                  </p>
                </Message>
              </div>
            </Tab.Pane>
          ),
        },
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
              <div>
                <Message warning>
                  <Message.Header>
                    No Selected Corpus or Labelset
                  </Message.Header>
                  <p>
                    To view or edit human annotations, you need to ensure you're
                    working with a corpus that has a linked Labelset.
                  </p>
                </Message>
              </div>
            </Tab.Pane>
          ),
        },
      ];
    } else {
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
                width: "100%",
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
                  <Popup
                    on="click"
                    trigger={
                      <Label as="a" corner="left" icon="eye" color="violet" />
                    }
                    style={{ padding: "0px" }}
                  >
                    <Grid
                      celled="internally"
                      columns="equal"
                      style={{ width: `400px` }}
                    >
                      <Grid.Row>
                        <Grid.Column textAlign="center" verticalAlign="middle">
                          <Header size="tiny">Show Only Selected</Header>
                          <Checkbox
                            toggle
                            onChange={(e, data) =>
                              showSelectedAnnotationOnly(data.checked)
                            }
                            checked={show_selected_annotation_only}
                          />
                        </Grid.Column>
                        <Grid.Column textAlign="center" verticalAlign="middle">
                          <Header size="tiny">Show Layout Blocks</Header>
                          <Checkbox
                            toggle
                            onChange={(e, data) => toggleShowStructuralLabels()}
                            checked={showStructuralLabels}
                          />
                        </Grid.Column>
                        <Grid.Column textAlign="center" verticalAlign="middle">
                          <Header size="tiny">Show Bounding Boxes</Header>
                          <Checkbox
                            toggle
                            onChange={(e, data) =>
                              showAnnotationBoundingBoxes(data.checked)
                            }
                            checked={show_annotation_bounding_boxes}
                          />
                        </Grid.Column>
                      </Grid.Row>
                      <Grid.Row>
                        <Grid.Column textAlign="center" verticalAlign="middle">
                          <Header size="tiny">Label Display Behavior</Header>
                          <Dropdown
                            onChange={(e, { value }) =>
                              showAnnotationLabels(
                                value as LabelDisplayBehavior
                              )
                            }
                            options={label_display_options}
                            selection
                            value={label_display_behavior}
                            style={{ minWidth: "12em" }}
                          />
                        </Grid.Column>
                        <Grid.Column textAlign="center" verticalAlign="middle">
                          <Header size="tiny">These Labels Only</Header>
                          <ViewLabelSelector />
                        </Grid.Column>
                      </Grid.Row>
                    </Grid>
                  </Popup>
                  <div
                    style={{ flex: 1, flexBasis: "100px", overflow: "scroll" }}
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
  }

  return (
    <Segment
      raised
      style={{
        width: "100%",
        height: "100%",
        padding: "0px",
        display: show_minimal_layout ? "none" : "flex",
        margin: "0px",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        userSelect: "none",
        MsUserSelect: "none",
        MozUserSelect: "none",
      }}
    >
      {!show_minimal_layout ? (
        <Popup
          trigger={
            <Icon
              name="info circle"
              color="blue"
              style={{
                position: "absolute",
                top: ".25vh",
                right: ".25vh",
                fontSize: "2rem",
              }}
            />
          }
          content={tooltip_text}
        />
      ) : (
        <></>
      )}
      <div style={{ width: "100%", textAlign: "center" }}>
        <div
          style={{
            marginTop: "3vh",
            marginLeft: "1vw",
            marginRight: "1vw",
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-around",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <AnnotatorModeToggle
              read_only={read_only}
              allow_input={allowInput}
              mode={editMode}
              setAllowInput={setAllowInput}
              setMode={setEditMode}
            />
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <div style={{ paddingLeft: ".5vw" }}>
              <Header as="h3">
                {header_text}
                <Header.Subheader style={{ padding: ".5rem" }}>
                  {subheader_text}
                </Header.Subheader>
              </Header>
            </div>
          </div>
        </div>
      </div>
      <Tab
        menu={{
          pointing: true,
          secondary: true,
          className: "sidebar_tab_menu_style",
          style: {
            marginBottom: "0px",
          },
        }}
        onTabChange={handleTabChange}
        panes={panes}
        className="sidebar_tab_style"
      />
    </Segment>
  );
};

export default AnnotatorSidebar;
