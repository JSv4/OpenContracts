import React from "react";
import {
  Card,
  Popup,
  Image,
  Dimmer,
  Loader,
  Statistic,
  Menu,
  Icon,
  Label,
  Header,
  MenuItemProps,
} from "semantic-ui-react";
import _ from "lodash";
import styled from "styled-components";

import { CorpusType } from "../../types/graphql-api";
import default_corpus_icon from "../../assets/images/defaults/default_corpus.png";
import { getPermissions } from "../../utils/transform";
import { PermissionTypes } from "../types";
import { MyPermissionsIndicator } from "../widgets/permissions/MyPermissionsIndicator";

const StyledCard = styled(Card)`
  &.ui.card {
    border-radius: 12px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.08);
    transition: all 0.3s ease;
    overflow: hidden;

    &:hover {
      box-shadow: 0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05);
      transform: translateY(-2px);
    }

    .content {
      padding: 1.2em;
    }

    .header {
      font-size: 1.2em;
      font-weight: 600;
      margin-bottom: 0.5em;
    }

    .meta {
      font-size: 0.9em;
      color: rgba(0, 0, 0, 0.6);
    }

    .description {
      margin-top: 1em;
      font-size: 0.95em;
      line-height: 1.4;
    }

    .extra {
      border-top: 1px solid rgba(0, 0, 0, 0.05);
      background-color: #f8f9fa;
      padding: 0.8em 1.2em;
    }
  }
`;

const StyledLabel = styled(Label)`
  &.ui.label {
    margin: 0.2em;
    padding: 0.5em 0.8em;
    border-radius: 20px;
  }
`;

interface CorpusItemProps {
  item: CorpusType;
  contextMenuOpen: string | null;
  onOpen: (args?: any) => any | void;
  onSelect: (args?: any) => any | void;
  onDelete: (args?: any) => any | void;
  onEdit: (args?: any) => any | void;
  onView: (args?: any) => any | void;
  onExport: (args?: any) => any | void;
  onFork: (args?: any) => any | void;
  onAnalyze: (args?: any) => any | void;
  setContextMenuOpen: (args?: any) => any | void;
}

export const CorpusItem: React.FC<CorpusItemProps> = ({
  item,
  contextMenuOpen,
  onOpen,
  onSelect,
  onDelete,
  onEdit,
  onView,
  onExport,
  onFork,
  onAnalyze,
  setContextMenuOpen,
}) => {
  const analyzers_available = process.env.REACT_APP_USE_ANALYZERS;
  const contextRef = React.useRef<HTMLElement | null>(null);

  const {
    id,
    title,
    is_selected,
    is_opened,
    description,
    icon,
    labelSet,
    documents,
    backendLock,
    isPublic,
    myPermissions,
  } = item;

  const createContextFromEvent = (
    e: React.MouseEvent<HTMLElement>
  ): HTMLElement => {
    const left = e.clientX;
    const top = e.clientY;
    const right = left + 1;
    const bottom = top + 1;

    return {
      getBoundingClientRect: () => ({
        left,
        top,
        right,
        bottom,
        height: 0,
        width: 0,
      }),
    } as HTMLElement;
  };

  const cardClickHandler = (
    event: React.MouseEvent<HTMLAnchorElement, MouseEvent>,
    value: any
  ) => {
    event.stopPropagation();
    if (event.shiftKey) {
      if (onSelect && _.isFunction(onSelect)) {
        onSelect(id);
      }
    } else {
      if (onOpen && _.isFunction(onOpen)) {
        onOpen(id);
      }
    }
  };

  const my_permissions = getPermissions(
    item.myPermissions ? item.myPermissions : []
  );

  let context_menus: MenuItemProps[] = [];

  if (analyzers_available) {
    context_menus.push({
      key: "analyze",
      content: "Analyze Corpus",
      icon: "chart area",
      onClick: () => onAnalyze(),
    });
  }

  if (my_permissions.includes(PermissionTypes.CAN_REMOVE)) {
    context_menus.push({
      key: "copy",
      content: "Delete Item",
      icon: "trash",
      onClick: () => onDelete(),
    });
  }

  if (!backendLock) {
    if (my_permissions.includes(PermissionTypes.CAN_UPDATE)) {
      context_menus.push({
        key: "code",
        content: "Edit Details",
        icon: "edit outline",
        onClick: () => onEdit(),
      });
    }
    context_menus = [
      ...context_menus,
      {
        key: "view",
        content: "View Details",
        icon: "eye",
        onClick: () => onView(),
      },
      {
        key: "export",
        content: "Export Corpus",
        icon: "cloud download",
        onClick: () => onExport(),
      },
      {
        key: "fork",
        content: "Fork Corpus",
        icon: "fork",
        onClick: () => onFork(),
      },
    ];
  }

  return (
    <>
      <StyledCard
        id={id}
        key={id}
        style={is_selected ? { backgroundColor: "#e2ffdb" } : {}}
        onClick={backendLock ? () => {} : cardClickHandler}
        onContextMenu={(e: React.MouseEvent<HTMLElement>) => {
          e.preventDefault();
          contextRef.current = createContextFromEvent(e);
          if (contextMenuOpen === id) {
            setContextMenuOpen(-1);
          } else {
            setContextMenuOpen(id);
          }
        }}
        onMouseEnter={() => {
          if (contextMenuOpen !== id) {
            setContextMenuOpen(-1);
          }
        }}
      >
        {backendLock ? (
          <Dimmer active>
            <Loader>Preparing...</Loader>
          </Dimmer>
        ) : null}
        <Image src={icon ? icon : default_corpus_icon} wrapped ui={false} />
        <Card.Content style={{ wordWrap: "break-word" }}>
          <Popup
            trigger={
              <StyledLabel
                style={{ cursor: "pointer" }}
                color={labelSet ? "green" : "red"}
                corner="right"
                icon={labelSet ? "tags" : "cancel"}
              />
            }
            flowing
            hoverable
          >
            {labelSet ? (
              <div>
                <Header
                  as="h3"
                  image={labelSet?.icon}
                  content={labelSet?.title}
                  subheader={labelSet?.description}
                />
              </div>
            ) : (
              <Header
                as="h3"
                content="No labelset selected for this corpus."
                subheader="Please right click this corpus and select edit (if you have edit rights) to select a labelset."
              />
            )}
          </Popup>
          <Card.Header>{title}</Card.Header>
          <Card.Meta>{`Created by: `}</Card.Meta>
          <Card.Description>
            <span>
              <b>Description:</b> {description}
            </span>
          </Card.Description>
        </Card.Content>
        <Card.Content extra>
          <Statistic.Group size="mini" widths={3}>
            <Statistic>
              <Statistic.Value>
                {documents?.edges?.length ? documents.edges.length : 0}
              </Statistic.Value>
              <Statistic.Label>Docs</Statistic.Label>
            </Statistic>
            <MyPermissionsIndicator
              myPermissions={myPermissions}
              isPublic={isPublic}
            />
            {item.parent ? (
              <Popup
                trigger={
                  <Statistic color="green">
                    <Statistic.Value>
                      <Icon name="code branch" />
                    </Statistic.Value>
                    <Statistic.Label>FORK</Statistic.Label>
                  </Statistic>
                }
              >
                <Popup.Header>
                  <u>Forked From</u>: {item.parent.title}
                </Popup.Header>
                <Popup.Content>
                  <p>
                    <Image src={item.parent.icon} size="mini" spaced="right" />
                    {item.parent.description}
                  </p>
                </Popup.Content>
              </Popup>
            ) : null}
          </Statistic.Group>
        </Card.Content>
      </StyledCard>
      <Popup
        basic
        context={contextRef}
        onClose={() => setContextMenuOpen(-1)}
        open={contextMenuOpen === id}
        hideOnScroll
      >
        <Menu secondary vertical>
          {context_menus.map((item) => (
            <Menu.Item
              key={item.key}
              icon={item.icon}
              content={item.content}
              onItemClick={() => setContextMenuOpen(-1)}
            />
          ))}
        </Menu>
      </Popup>
    </>
  );
};
