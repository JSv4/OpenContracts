import { Card, Icon, Popup, Header } from "semantic-ui-react";
import { AnnotationLabelType } from "../../../../graphql/types";
import useWindowDimensions from "../../../hooks/WindowDimensionHook";
import { TruncatedText } from "../../../widgets/data-display/TruncatedText";

import "./DocTypeLabels.css";

interface DocTypeLabelProps {
  label: AnnotationLabelType;
  onRemove: (() => void) | null;
}

export const DocTypeLabel = ({ label, onRemove }: DocTypeLabelProps) => {
  const { width } = useWindowDimensions();

  if (!label) {
    return <></>;
  }

  return (
    <Card className="DocTypeLabelCard" raised>
      {onRemove ? (
        <Icon
          link
          color="red"
          name="trash"
          style={{ position: "absolute", right: ".25vw", top: ".25vw" }}
          onClick={() => onRemove()}
        />
      ) : (
        <></>
      )}
      <Card.Content className="DocTypeLabelContent">
        <Popup
          style={{ textAlign: "left" }}
          content={
            <p>
              <u>
                <b>
                  <em>Description:</em>
                </b>
              </u>
              <br />
              {`${label.description}`}
            </p>
          }
          trigger={
            <Card.Header
              style={{
                textAlign: "left",
                wordBreak: "break-all",
                display: "flex",
                flexDirection: "row",
                justifyContent: "flex-start",
                height: "100%",
                margin: "0px",
              }}
            >
              <div>
                <Header as="h5">
                  <Icon
                    className="DocTypeLabelIcon"
                    name={label.icon}
                    style={{ color: label.color }}
                  />
                  <Header.Content
                    className="DocTypeLabelHeader"
                    style={{ wordBreak: "break-all" }}
                  >
                    <TruncatedText
                      text={label?.text ? label.text : "MISSING"}
                      limit={width <= 400 ? 20 : width <= 768 ? 36 : 64}
                    />
                  </Header.Content>
                </Header>
              </div>
            </Card.Header>
          }
        />
      </Card.Content>
    </Card>
  );
};

export const BlankDocTypeLabel = () => {
  return (
    <Card
      fluid
      raised
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        margin: ".25vw",
      }}
    >
      <Card.Content
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "row",
          justifyContent: "center",
        }}
      >
        <Card.Header style={{ textAlign: "left" }}>
          <Header as="h5">
            <Icon name="dont" />
            <Header.Content>No Label</Header.Content>
          </Header>
        </Card.Header>
      </Card.Content>
    </Card>
  );
};
