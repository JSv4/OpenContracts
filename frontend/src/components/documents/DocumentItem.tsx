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

import {
  editingDocument,
  selectedDocumentIds,
  showAddDocsToCorpusModal,
  showDeleteDocumentsModal,
  viewingDocument,
} from "../../graphql/cache";
import { AnnotationLabelType, DocumentType } from "../../graphql/types";
import { downloadFile } from "../../utils/files";
import fallback_doc_icon from "../../assets/images/defaults/default_doc_icon.jpg";
import { getPermissions } from "../../utils/transform";
import { PermissionTypes } from "../types";
import { MyPermissionsIndicator } from "../widgets/permissions/MyPermissionsIndicator";

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

export const DocumentItem = ({
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
}: DocumentItemProps) => {
  const contextRef = React.useRef<HTMLElement | null>(null);

  const createContextFromEvent = (
    e: React.MouseEvent<HTMLElement>
  ): HTMLElement => {
    const left = e.clientX;
    const top = e.clientY;
    const right = left + 1;
    const bottom = top + 1;

    // This "as HTMLElement" is insanely hacky, but I know this is all semantic UI uses from the HTMLElement API based o
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

  const onDownload = (file_url: string | void | null) => {
    if (file_url) {
      downloadFile(file_url);
    }
    return null;
  };

  const {
    id,
    icon,
    is_open, // Apollo Local property
    is_selected, // Apollo Local property
    title,
    description,
    pdfFile,
    backendLock,
    isPublic,
    doc_label_annotations,
    myPermissions,
  } = item;

  const cardClickHandler = (
    event: React.MouseEvent<HTMLAnchorElement, MouseEvent>,
    value: any
  ) => {
    event.stopPropagation();
    if (event.shiftKey) {
      // console.log("Shift Click - Check onSelect");
      if (onShiftClick && _.isFunction(onShiftClick)) {
        // console.log("onSelect");
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

  ///////////////////////////////// VARY USER ACTIONS BASED ON PERMISSIONS ////////////////////////////////////////
  const my_permissions = getPermissions(
    item.myPermissions ? item.myPermissions : []
  );

  let context_menus: React.ReactNode[] = [];
  if (my_permissions.includes(PermissionTypes.CAN_REMOVE)) {
    context_menus.push({
      key: "delete",
      content: delete_caption,
      icon: "trash",
      onClick: () => handleOnDelete(item),
    });
  }

  // Only if backend is NOT still processing document, we can't open and don't want to let user do anything but delete in (in the event
  // that there's a document which refuses to process, want people to be able to delete them on frontend)
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
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  let doc_label_objs = item?.doc_label_annotations
    ? item.doc_label_annotations.edges
        .map((edge) =>
          edge?.node?.annotationLabel ? edge.node.annotationLabel : undefined
        )
        .filter((item): item is AnnotationLabelType => !!item)
    : [];

  let doc_labels = doc_label_objs.map((label, index) => (
    <Label key={`doc_${id}_label${index}`}>
      <Icon
        style={{ color: label.color }}
        name={label.icon ? label.icon : "tag"}
      />{" "}
      {label?.text}
    </Label>
  ));

  return (
    <>
      <Card
        className="noselect GlowCard"
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
        ) : (
          <></>
        )}
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
            ) : (
              <></>
            )}
          </Card.Header>
          <Card.Meta>{`Document Type: *.pdf`}</Card.Meta>
          <Card.Description>
            <span>
              <b>Description:</b> {description}
            </span>
            <br />
          </Card.Description>
        </Card.Content>
        {doc_labels && doc_labels.length > 0 ? (
          <Card.Content extra>
            <Label.Group size="mini">{doc_labels}</Label.Group>
          </Card.Content>
        ) : (
          <></>
        )}
        <Card.Content extra>
          <Statistic.Group size="mini" widths={3}>
            <MyPermissionsIndicator
              myPermissions={myPermissions}
              isPublic={isPublic}
            />
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
          className="Corpus_Context_Menu"
          items={context_menus}
          onItemClick={() => setContextMenuOpen(-1)}
          secondary
          vertical
        />
      </Popup>
    </>
  );
};
