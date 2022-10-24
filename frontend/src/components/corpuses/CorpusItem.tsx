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
} from "semantic-ui-react";
import _ from "lodash";

import { LabelSetStatistic } from "../widgets/data-display/LabelSetStatisticWidget";
import { CorpusType } from "../../graphql/types";
import default_corpus_icon from "../../assets/images/defaults/default_corpus.png";
import { getPermissions } from "../../utils/transform";
import { PermissionTypes } from "../types";
import { MyPermissionsIndicator } from "../widgets/permissions/MyPermissionsIndicator";

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

export const CorpusItem = ({
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
}: CorpusItemProps) => {
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

    // This is insanely hacky, but I know this is all semantic UI uses from the HTMLElement API based o
    // on their docs. When I switched from JS to Typescript, however, you get errors because obv an
    // HTMLElement needs a lot more than just getBoundingClientRect. Overriding TypeScript type on return
    // with as HTMLElement makes TypeScript shut up and lets us have a properly positioned context menu.
    // Perhaps at some point worth figuring out what actual types work, but it's burning up my time for
    // very little benefit.
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

  ///////////////////////////////// VARY USER ACTIONS BASED ON PERMISSIONS ////////////////////////////////////////
  const my_permissions = getPermissions(
    item.myPermissions ? item.myPermissions : []
  );
  // console.log("Corpus permissions", my_permissions);

  let context_menus: React.ReactNode[] = [];

  // If Analyzers are turned on in the env... add option to trigger an analysis
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
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  return (
    <>
      <Card
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
        ) : (
          <></>
        )}
        <Image src={icon ? icon : default_corpus_icon} wrapped ui={false} />
        <Card.Content style={{ wordWrap: "break-word" }}>
          <Popup
            trigger={
              <Label
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
              <Header
                as="h3"
                image={labelSet?.icon}
                content={labelSet?.title}
                subheader={labelSet?.description}
              />
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
            ) : (
              <></>
            )}
          </Statistic.Group>
        </Card.Content>
      </Card>
      <Popup
        basic
        context={contextRef}
        onClose={() => setContextMenuOpen(-1)}
        open={contextMenuOpen === id}
        hideOnScroll
      >
        <Menu
          items={context_menus}
          onItemClick={() => setContextMenuOpen(-1)}
          secondary
          vertical
        />
      </Popup>
    </>
  );
};
