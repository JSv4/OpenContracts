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
} from "semantic-ui-react";

import { Textfit } from "react-textfit";

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
import { LabelDisplayBehavior } from "../../../graphql/types";
import { SearchSidebarWidget } from "../search_widget/SearchSidebarWidget";
import { FetchMoreOnVisible } from "../../widgets/infinite_scroll/FetchMoreOnVisible";
import useWindowDimensions from "../../hooks/WindowDimensionHook";
import { ViewLabelSelector } from "../view_labels_selector/ViewLabelSelector";

const label_display_options = [
  { key: 1, text: "Always Show", value: LabelDisplayBehavior.ALWAYS },
  { key: 2, text: "Always Hide", value: LabelDisplayBehavior.HIDE },
  { key: 3, text: "Show on Hover", value: LabelDisplayBehavior.ON_HOVER },
];

export const AnnotatorSidebar = ({
  read_only,
  fetchMore,
}: {
  read_only: boolean;
  fetchMore?: () => void;
}) => {
  const annotationStore = useContext(AnnotationStore);
  const label_display_behavior = useReactiveVar(showAnnotationLabels);
  const selected_analyses = useReactiveVar(selectedAnalyses);
  const analysis_view_mode = selected_analyses.length > 0;

  // Slightly kludgy way to handle responsive layout and drop sidebar once it becomes a pain
  // If there's enough interest to warrant a refactor, we can put some more thought into how
  // to handle the layout on a cellphone / small screen.
  const { width } = useWindowDimensions();
  const show_minimal_layout = width <= 1000;

  let subheader_text = "";
  let header_text = "";
  let tooltip_text = "";
  if (analysis_view_mode) {
    if (read_only) {
      subheader_text = `You are viewing machine-created annotations. These were generated 
      by Gremlin Engine NLP microservice.`;
      header_text = "View Analyzer Annotations";
      tooltip_text = `Check out Gremlin for more information on how to
      create or install your NLP microservices which generate Open Contracts compatible annotations
      that can be viewed just like this!`;
    } else {
      subheader_text = `You are viewing machine-created annotations. You have permissions 
      to delete the entire annotation or specific annotations if you'd like.`;
      header_text = "Edit Analyzer Annotations";
      tooltip_text = `Check out Gremlin for more information on how to
      create or install your NLP microservices which generate Open Contracts compatible annotations
      that can be viewed just like this!`;
    }
  } else {
    if (read_only) {
      subheader_text = `You are viewing human-created annotations for this document. You do 
      not have edit permission so you cannot edit or create annotations in this corpus.`;
      header_text = "View Human Annotations";
      tooltip_text = `The annotator is in read only mode. You can view annotations but
      you can't edit or delete existing annotations or create new
      ones. If this is unexpected, some things to check: 1) do you
      have write permissions or 2) have you selected one or more
      machine-created analyses? Editing and creating annotations is
      disabled when an analysis is selected for display`;
    } else {
      subheader_text = `You are viewing human-created annotations. You have edit/create permissions`;
      header_text = "Edit Human Annotations";
      tooltip_text = `To create a highlight, drag to select the desired text. 
      The label selected in the "Selected Label:" box below will be applied. 
      SHIFT + click to select multiple, separate regions.`;
    }
  }

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

  const panes = [
    {
      menuItem: "Labelled Text",
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
                          showAnnotationLabels(value as LabelDisplayBehavior)
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
              <div style={{ flex: 1, flexBasis: "100px", overflow: "scroll" }}>
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
          style={{ marginTop: "3vh", marginLeft: "1vw", marginRight: "1vw" }}
        >
          <Header as="h4" icon style={{ margin: "0.5rem 0" }}>
            <Icon name={analysis_view_mode ? "magic" : "pencil"} />
            {header_text}
            <Header.Subheader style={{ padding: "0.25rem" }}>
              {subheader_text}
            </Header.Subheader>
          </Header>
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
