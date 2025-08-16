import React, { useRef, useState, useEffect, FC, MouseEvent } from "react";
import ReactDOM from "react-dom";
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
import { useNavigate } from "react-router-dom";
import { navigateToDocument } from "../../utils/navigationUtils";

import {
  editingDocument,
  selectedDocumentIds,
  showAddDocsToCorpusModal,
  showDeleteDocumentsModal,
  viewingDocument,
  openedCorpus,
} from "../../graphql/cache";
import { AnnotationLabelType, DocumentType } from "../../types/graphql-api";
import { downloadFile } from "../../utils/files";
import fallback_doc_icon from "../../assets/images/defaults/default_doc_icon.jpg";
import { getPermissions } from "../../utils/transform";
import { PermissionTypes } from "../types";
import { MyPermissionsIndicator } from "../widgets/permissions/MyPermissionsIndicator";

interface ContextMenuItem {
  key: string;
  icon: string;
  content: string;
  onClick: () => void;
}

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

/**
 * Props for the enlarged portal component
 */
interface ImageEnlargePortalProps {
  /** The thumbnail image URL. */
  src: string;
  /** Whether to show the enlarged image or not. */
  isVisible: boolean;
  /** Where on the screen (in viewport coords) to anchor the enlarged image. */
  position: { top: number; left: number } | null;
  /** Title for the alt attribute. */
  altText?: string;
}

/**
 * A portal component that renders an enlarged version
 * of the thumbnail, on top of everything else, anchored
 * near the thumbnail center rather than screen center.
 */
const ImageEnlargePortal: FC<ImageEnlargePortalProps> = ({
  src,
  isVisible,
  position,
  altText,
}) => {
  // If not visible or no position, don't render the portal at all
  if (!isVisible || !position) return null;

  const { top, left } = position;

  return ReactDOM.createPortal(
    <div
      style={{
        position: "fixed",
        top,
        left,
        transform: "translate(-50%, -50%) scale(1.5)",
        transition: "opacity 0.3s ease",
        opacity: isVisible ? 1 : 0,
        pointerEvents: "none",
        zIndex: 9999,
        boxShadow: "0 20px 40px rgba(0,0,0,0.3), 0 15px 15px rgba(0,0,0,0.22)",
        borderRadius: 8,
        background: "#fff",
      }}
    >
      <img
        src={src}
        alt={altText}
        style={{
          maxWidth: 600,
          maxHeight: 600,
          borderRadius: 8,
        }}
      />
    </div>,
    document.body
  );
};

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
  const contextRef = useRef<HTMLDivElement>(null);
  const [contextMenuState, setContextMenuState] = useState<{
    open: boolean;
    x: number;
    y: number;
    id: string | number;
  }>({ open: false, x: 0, y: 0, id: "" });

  const [showEnlarge, setShowEnlarge] = useState(false);
  /**
   * We'll store the exact center of the thumbnail in viewport coordinates,
   * so we can anchor the enlarged copy right above the thumbnail.
   */
  const [previewPosition, setPreviewPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const hoverTimer = useRef<NodeJS.Timeout | null>(null);

  // React Router navigation helper
  const navigate = useNavigate();

  /**
   * Adds a mild delay so the user must hover
   * over the thumbnail for 1 second to enlarge.
   */
  const handleMouseEnterThumbnail = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // We'll anchor the enlarged image to the center of the thumbnail
    const top = rect.top + rect.height / 2;
    const left = rect.left + rect.width / 2;
    setPreviewPosition({ top, left });

    hoverTimer.current = setTimeout(() => {
      setShowEnlarge(true);
    }, 1000);
  };

  const handleMouseLeaveThumbnail = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
    }
    setShowEnlarge(false);
  };

  useEffect(() => {
    return () => {
      if (hoverTimer.current) {
        clearTimeout(hoverTimer.current);
      }
    };
  }, []);

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
    // Don't trigger if clicking within context menu
    if ((event.target as HTMLElement).closest(".Corpus_Context_Menu")) {
      return;
    }

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
      // Add knowledge base option
      context_menus = [
        {
          key: "knowledge_base",
          content: "Open Knowledge Base",
          icon: "book",
          onClick: () => {
            const currentCorpus = openedCorpus();
            // Use smart navigation to prefer slugs and prevent redirects
            navigateToDocument(
              item as any,
              currentCorpus as any,
              navigate,
              window.location.pathname
            );
            if (onClick) onClick(item);
          },
        },
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
        .filter((lbl): lbl is AnnotationLabelType => !!lbl)
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

  const onContextMenuHandler = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    const x = e.clientX;
    const y = e.clientY;
    if (contextMenuState.open && contextMenuState.id === id) {
      setContextMenuState({ open: false, x: 0, y: 0, id: "" });
    } else {
      setContextMenuState({ open: true, x, y, id });
    }
  };

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
        onContextMenu={onContextMenuHandler}
        onClick={backendLock ? undefined : cardClickHandler}
      >
        {backendLock ? (
          <Dimmer active inverted>
            <Loader inverted>Processing...</Loader>
          </Dimmer>
        ) : null}

        <div
          onMouseEnter={handleMouseEnterThumbnail}
          onMouseLeave={handleMouseLeaveThumbnail}
          style={{ cursor: "pointer" }}
        >
          <Image src={icon || fallback_doc_icon} wrapped ui={false} />
        </div>

        {/* Portal for enlarged thumbnail anchored near thumbnail center */}
        <ImageEnlargePortal
          src={icon || fallback_doc_icon}
          altText={title || "Document preview"}
          position={previewPosition}
          isVisible={showEnlarge}
        />

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
      </StyledCard>

      {contextMenuState.open && contextMenuState.id === id && (
        <>
          <div
            ref={contextRef}
            style={{
              position: "absolute",
              top: contextMenuState.y,
              left: contextMenuState.x,
              height: "1px",
              width: "1px",
              zIndex: 1000,
            }}
          />
          <Popup
            basic
            context={contextRef}
            onClose={() =>
              setContextMenuState({ ...contextMenuState, open: false })
            }
            open={true}
            hideOnScroll
          >
            <Menu
              className="Corpus_Context_Menu"
              secondary
              vertical
              onClick={(e: { stopPropagation: () => any }) =>
                e.stopPropagation()
              } // Stop click propagation here
            >
              {context_menus.map((menuItem) => (
                <Menu.Item
                  key={menuItem.key}
                  icon={menuItem.icon}
                  content={menuItem.content}
                  onClick={() => {
                    menuItem.onClick();
                    setContextMenuState({ ...contextMenuState, open: false });
                  }}
                />
              ))}
            </Menu>
          </Popup>
        </>
      )}
    </>
  );
};
