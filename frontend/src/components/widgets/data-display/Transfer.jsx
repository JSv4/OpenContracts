import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Segment, Grid } from "semantic-ui-react";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import { AnnotationSummary } from "../../annotator/AnnotationSummary";
import styled from "styled-components";

export const useDraggablePortal = () => {
  const portal = useRef({}).current;

  useEffect(() => {
    const div = document.createElement("div");
    div.style.position = "absolute";
    div.style.pointerEvents = "none";
    div.style.top = "0";
    div.style.width = "100%";
    div.style.height = "100%";
    portal.elt = div;
    document.body.appendChild(div);
    return () => {
      document.body.removeChild(div);
    };
  }, [portal]);

  return (render) =>
    (provided, ...args) => {
      const element = render(provided, ...args);
      if (provided.draggableProps.style.position === "fixed") {
        return createPortal(element, portal.elt);
      }
      return element;
    };
};

export const DraggableList = ({ value_list, provided, snapshot, render }) => {
  const renderDraggable = useDraggablePortal();

  const grid = 8;

  const getItemStyle = (isDragging, draggableStyle) => ({
    // some basic styles to make the items look a bit nicer
    userSelect: "none",
    margin: `0 0 ${grid}px 0`,

    // change background colour if dragging
    background: isDragging ? "lightgreen" : "white",

    // styles we need to apply on draggables
    ...draggableStyle,
  });

  const getListStyle = (isDraggingOver) => ({
    background: isDraggingOver ? "lightblue" : "white",
    flex: 1,
    minHeight: "50px",
  });

  return (
    <DropZone
      ref={provided.innerRef}
      style={getListStyle(snapshot.isDraggingOver)}
    >
      {value_list.map((item, index) => {
        if (snapshot.isDragging) {
          provided.draggableProps.style.left = undefined;
          provided.draggableProps.style.top = undefined;
        }

        return (
          <Draggable key={item.key} draggableId={item.key} index={index}>
            {renderDraggable((provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.draggableProps}
                {...provided.dragHandleProps}
                style={getItemStyle(
                  snapshot.isDragging,
                  provided.draggableProps.style
                )}
              >
                {render(item)}
              </div>
            ))}
          </Draggable>
        );
      })}
      {provided.placeholder}
    </DropZone>
  );
};

/**
 * datasource - {key: (annotation id), annotation: annotation}
 * targetKeys - list of IDs
 * onChange - returns list of Ids
 * @param {*} param0
 * @returns
 */

export const Transfer = ({ dataSource, targetKeys, onChange }) => {
  const source_list = dataSource
    ? dataSource.filter((item) => !targetKeys.includes(item.key))
    : [];
  // console.log("Source list", source_list);

  const target_list = dataSource
    ? dataSource.filter((item) => targetKeys.includes(item.key))
    : [];
  // console.log("Target list", target_list);

  const onDragEnd = ({ draggableId, type, source, destination }) => {
    // console.log(draggableId, source, destination);
    try {
      // Dropped into target from source col
      if (
        source.droppableId === "source_annotations" &&
        destination.droppableId === "target_annotations"
      ) {
        // console.log("Dropped from source to target");
        onChange([...targetKeys, draggableId]);
      }
      // Dropped into source column from target col
      else if (
        source.droppableId === "target_annotations" &&
        destination.droppableId === "source_annotations"
      ) {
        // console.log("Dropped from target to source");
        onChange(targetKeys.filter((item) => item !== draggableId));
      }
    } catch {}
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Grid centered divided>
        <Grid.Row columns={2}>
          <Grid.Column
            style={{
              height: "40vh",
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-start",
              paddingRight: "2vw",
              paddingLeft: "10px",
            }}
          >
            <Segment secondary attached="top">
              Source Annotation(s):
            </Segment>
            <Segment attached="bottom" style={{ maxHeight: "40vh", flex: 1 }}>
              <Droppable
                droppableId="source_annotations"
                style={{ minHeight: "50px", overflowY: "auto" }}
              >
                {(provided, snapshot) => (
                  <DraggableList
                    value_list={source_list}
                    provided={provided}
                    snapshot={snapshot}
                    render={(item) => (
                      <AnnotationSummary annotation={item.annotation} />
                    )}
                  />
                )}
              </Droppable>
            </Segment>
          </Grid.Column>
          <Grid.Column
            style={{
              height: "40vh",
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-start",
              paddingLeft: "2vw",
              paddingRight: "10px",
            }}
          >
            <Segment secondary attached="top">
              Target Annotation(s):
            </Segment>
            <Segment attached="bottom" style={{ maxHeight: "40vh", flex: 1 }}>
              <Droppable
                droppableId="target_annotations"
                style={{ minHeight: "50px", overflowY: "auto" }}
              >
                {(provided, snapshot) => (
                  <DraggableList
                    value_list={target_list}
                    provided={provided}
                    snapshot={snapshot}
                    render={(item) => (
                      <AnnotationSummary annotation={item.annotation} />
                    )}
                  />
                )}
              </Droppable>
            </Segment>
          </Grid.Column>
        </Grid.Row>
      </Grid>
    </DragDropContext>
  );
};

const DropZone = styled.div`
  min-height: 60px;
  flex: 1;
`;
