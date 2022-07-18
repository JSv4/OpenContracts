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
} from "../../../graphql/cache";
import { LabelDisplayBehavior } from "../../../graphql/types";
import { SearchSidebarWidget } from "../search_widget/SearchSidebarWidget";

const label_display_options = [
  { key: 1, text: "Always Show", value: LabelDisplayBehavior.ALWAYS },
  { key: 2, text: "Always Hide", value: LabelDisplayBehavior.HIDE },
  { key: 3, text: "Show on Hover", value: LabelDisplayBehavior.ON_HOVER },
];

export const AnnotatorSidebar = ({ read_only }: { read_only: boolean }) => {
  const annotationStore = useContext(AnnotationStore);
  const label_display_behavior = useReactiveVar(showAnnotationLabels);

  const show_selected_annotation_only = useReactiveVar(
    showSelectedAnnotationOnly
  );
  const show_annotation_bounding_boxes = useReactiveVar(
    showAnnotationBoundingBoxes
  );

  const annotations = annotationStore.pdfAnnotations.annotations;
  const relations = annotationStore.pdfAnnotations.relations;
  const selectedRelations = annotationStore.selectedRelations;

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
          key={index}
          className={annotation.id}
          annotation={annotation}
          read_only={false}
          relations={relations}
          onDelete={onDeleteAnnotation}
          onSelect={toggleSelectedAnnotation}
        />
      );
    });
  }

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
        key={relation.id}
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
          key={1}
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
                  style={{ width: "400px" }}
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
                      />
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
          key={2}
          style={{
            overflowY: "scroll",
            margin: "0px",
            width: "100%",
            flex: 1,
          }}
        >
          <Card.Group key={2}>{relation_elements}</Card.Group>
        </Tab.Pane>
      ),
    },
    {
      menuItem: "Search",
      render: () => (
        <Tab.Pane
          key={3}
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
        display: "flex",
        margin: "0px",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        userSelect: "none",
        "-msUserSelect": "none",
        MozUserSelect: "none",
      }}
    >
      <div style={{ width: "100%", textAlign: "center" }}>
        <div style={{ width: "100%", marginTop: "1rem" }}>
          <h2 style={{ marginBottom: "1rem" }}>Text Annotations</h2>
        </div>
        <div style={{ width: "100%" }}>
          {!read_only ? (
            <p>
              <small>
                To create a highlight, drag to select the desired text. The
                label selected in the "Selected Label:" box below will be
                applied. SHIFT + click to select multiple, separate regions.
              </small>
            </p>
          ) : (
            <></>
          )}
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
