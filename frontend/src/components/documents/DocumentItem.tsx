import React from "react";
import {
  Icon,
  Card,
  Popup,
  Menu,
  Image,
  Label,
  Dimmer,
  Loader,
  Statistic,
} from "semantic-ui-react";
import _ from "lodash";
import styled from "styled-components";

import {
  editingDocument,
  selectedDocumentIds,
  showAddDocsToCorpusModal,
  showDeleteDocumentsModal,
  viewingDocument,
} from "../../graphql/cache";
import { AnnotationLabelType, DocumentType } from "../../types/graphql-api";
import { downloadFile } from "../../utils/files";
import fallback_doc_icon from "../../assets/images/defaults/default_doc_icon.jpg";
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

interface DocumentItemProps {
  item: DocumentType;
  delete_caption?: string;
  download_caption?: string;
  edit_caption?: string;
  add_caption?: string;
  contextMenuOpen: string | null;
  onShiftClick?: (document: DocumentType) => void;
  onClick?: (document: DocumentType) => void;
  removeFromCorpus?: (doc_ids: string[]) => void | any;
  setContextMenuOpen: (args: any) => any | void;
}

export const DocumentItem: React.FC<DocumentItemProps> = ({
  item,
  add_caption = "Add Doc To Corpus",
  edit_caption = "Edit Doc Details",
  delete_caption = "Delete Document",
  download_caption = "Download PDF",
  contextMenuOpen,
  onShiftClick,
  onClick,
  removeFromCorpus,
  setContextMenuOpen,
}) => {
  const contextRef = React.useRef<HTMLElement | null>(null);

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

  const onDownload = (file_url: string | void | null) => {
    if (file_url) {
      downloadFile(file_url);
    }
    return null;
  };

  const {
    id,
    icon,
    is_open,
    is_selected,
    title,
    description,
    pdfFile,
    backendLock,
    isPublic,
    myPermissions,
    fileType,
  } = item;

  const cardClickHandler = (
    event: React.MouseEvent<HTMLAnchorElement, MouseEvent>,
    value: any
  ) => {
    event.stopPropagation();
    if (event.shiftKey) {
      if (onShiftClick && _.isFunction(onShiftClick)) {
        onShiftClick(item);
      }
    } else {
      if (onClick && _.isFunction(onClick)) {
        onClick(item);
      }
    }
  };

  const handleOnAdd = (document: DocumentType | void) => {
    if (document) {
      selectedDocumentIds([document.id]);
      showAddDocsToCorpusModal(true);
    }
    return null;
  };

  const handleOnDelete = (document: DocumentType | void) => {
    if (document) {
      selectedDocumentIds([document.id]);
      showDeleteDocumentsModal(true);
    }
    return null;
  };

  const my_permissions = getPermissions(
    item.myPermissions ? item.myPermissions : []
  );

  let context_menus: ContextMenuItem[] = [];
  if (my_permissions.includes(PermissionTypes.CAN_REMOVE)) {
    context_menus.push({
      key: "delete",
      content: delete_caption,
      icon: "trash",
      onClick: () => handleOnDelete(item),
    });
  }

  if (!backendLock) {
    if (my_permissions.includes(PermissionTypes.CAN_UPDATE)) {
      context_menus.push({
        key: "code",
        content: edit_caption,
        icon: "edit outline",
        onClick: () => editingDocument(item),
      });
    }
    if (pdfFile) {
      context_menus.push({
        key: "download",
        content: download_caption,
        icon: "download",
        onClick: () => onDownload(pdfFile),
      });
      context_menus = [
        {
          key: "view",
          content: "View Details",
          icon: "eye",
          onClick: () => viewingDocument(item),
        },
      ];
    }
    context_menus.push({
      key: "add",
      content: add_caption,
      icon: "plus circle",
      onClick: () => handleOnAdd(item),
    });
  }

  if (removeFromCorpus) {
    context_menus.push({
      key: "remove",
      content: "Remove from Corpus",
      icon: "remove",
      onClick: () => removeFromCorpus([item.id]),
    });
  }

  let doc_label_objs = item?.docLabelAnnotations
    ? item.docLabelAnnotations.edges
        .map((edge) =>
          edge?.node?.annotationLabel ? edge.node.annotationLabel : undefined
        )
        .filter((item): item is AnnotationLabelType => !!item)
    : [];

  let doc_labels = doc_label_objs.map((label, index) => (
    <StyledLabel key={`doc_${id}_label${index}`}>
      <Icon
        style={{ color: label.color }}
        name={label.icon ? label.icon : "tag"}
      />{" "}
      {label?.text}
    </StyledLabel>
  ));

  return (
    <>
      <StyledCard
        className={`noselect GlowCard ${is_open ? "is-open" : ""}`}
        key={id}
        id={id}
        style={{
          ...(is_open ? { backgroundColor: "#e2ffdb" } : {}),
          userSelect: "none",
          MsUserSelect: "none",
          MozUserSelect: "none",
        }}
        onContextMenu={(e: React.MouseEvent<HTMLElement>) => {
          e.preventDefault();
          contextRef.current = createContextFromEvent(e);
          if (contextMenuOpen === id) {
            setContextMenuOpen(-1);
          } else {
            setContextMenuOpen(id);
          }
        }}
        onClick={backendLock ? () => {} : cardClickHandler}
      >
        {backendLock ? (
          <Dimmer active inverted>
            <Loader inverted>Processing...</Loader>
          </Dimmer>
        ) : null}
        <Image src={icon ? icon : fallback_doc_icon} wrapped ui={false} />
        <Card.Content style={{ wordWrap: "break-word" }}>
          <Card.Header>
            <Popup
              content={`Full Title: ${title}`}
              trigger={<span>{title ? title.substring(0, 48) : ""}</span>}
            />
            {is_selected ? (
              <div style={{ float: "right" }}>
                <Icon name="check circle" color="green" />
              </div>
            ) : null}
          </Card.Header>
          <Card.Meta>
            Document Type: <Label size="mini">{fileType}</Label>
          </Card.Meta>
          <Card.Description>
            <span>
              <b>Description:</b> {description}
            </span>
          </Card.Description>
        </Card.Content>
        {doc_labels && doc_labels.length > 0 ? (
          <Card.Content extra>
            <Label.Group size="mini">{doc_labels}</Label.Group>
          </Card.Content>
        ) : null}
        <Card.Content extra>
          <Statistic.Group size="mini" widths={3}>
            <MyPermissionsIndicator
              myPermissions={myPermissions}
              isPublic={isPublic}
            />
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
        <Menu className="Corpus_Context_Menu" secondary vertical>
          {context_menus.map((item) => (
            <Menu.Item
              key={item.key}
              icon={item.icon}
              content={item.content}
              onClick={() => {
                item.onClick();
                setContextMenuOpen(-1);
              }}
            />
          ))}
        </Menu>
      </Popup>
    </>
  );
};

interface ContextMenuItem {
  key: string;
  icon: string;
  content: string;
  onClick: () => void;
}
