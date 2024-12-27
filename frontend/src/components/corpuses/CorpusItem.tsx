import React from "react";
import {
  Card,
  Image,
  Dimmer,
  Loader,
  Statistic,
  Menu,
  Icon,
  Header,
  Popup,
  Label,
} from "semantic-ui-react";
import {
  Tags,
  FileText,
  HandshakeIcon,
  Database,
  GitForkIcon,
} from "lucide-react";
import _ from "lodash";
import styled from "styled-components";

import default_corpus_icon from "../../assets/images/defaults/default_corpus.png";
import { getPermissions } from "../../utils/transform";
import { PermissionTypes } from "../types";
import { MyPermissionsIndicator } from "../widgets/permissions/MyPermissionsIndicator";
import { CorpusType, LabelType } from "../../types/graphql-api";

const StyledCard = styled(Card)`
  &.ui.card {
    display: flex !important;
    flex-direction: column !important;
    overflow: visible;
    border-radius: 12px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.08);
    transition: all 0.3s ease;
    position: relative;

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
      margin-top: auto !important;
      min-height: 80px !important;
    }
  }
`;

const StyledLabel = styled(Label)`
  &.ui.label {
    margin: 0 !important;
    padding: 0.5em 0.8em;
    border-radius: 20px;
    position: absolute !important;
    top: 0 !important;
    right: 0 !important;
    z-index: 1;
  }
`;

const StyledImage = styled(Image)`
  &.ui.image {
    flex: none !important;
    height: 200px !important;
    width: 100% !important;
    background: linear-gradient(to bottom, #f8f9fa, #f8f9fa 50%, #e9ecef 100%);
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    overflow: hidden !important;

    img {
      max-height: 100% !important;
      width: auto !important;
      height: auto !important;
      object-fit: contain !important;
    }
  }
`;

const StyledCardContent = styled(Card.Content)`
  &.content {
    flex: 1 0 auto !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: visible !important;
    position: relative;
  }
`;

const StyledCardExtra = styled(Card.Content)`
  &.extra {
    flex: 0 0 auto !important;
    min-height: 80px !important;
    padding: 0.8em 1.2em;
  }
`;

const LabelsetCorner = styled.div<{ hasLabelset: boolean }>`
  position: absolute;
  top: 0;
  right: 0;
  width: 100px;
  height: 100px;
  overflow: visible;
  cursor: pointer;
  z-index: 5;

  &:before {
    content: "";
    position: absolute;
    top: 0;
    right: 0;
    width: 0;
    height: 0;
    border-style: solid;
    border-width: 0 100px 100px 0;
    border-color: transparent
      ${(props) => (props.hasLabelset ? "#22c55e" : "#ef4444")} transparent
      transparent;
    transition: all 0.3s ease;
    z-index: 1;
  }

  &:hover:before {
    border-width: 0 120px 120px 0;
  }
`;

const CornerIcon = styled.div`
  position: absolute;
  top: 12px;
  right: 12px;
  color: white;
  z-index: 2;
  transition: all 0.3s ease;
`;

const LabelsetTooltip = styled.div<{ visible: boolean }>`
  position: absolute;
  top: 0;
  right: 45px;
  background: white;
  border-radius: 12px;
  padding: 1.25rem;
  min-width: 260px;
  width: max-content;
  max-width: 340px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  opacity: ${(props) => (props.visible ? 1 : 0)};
  visibility: ${(props) => (props.visible ? "visible" : "hidden")};
  transform: ${(props) =>
    props.visible ? "translateY(0)" : "translateY(-10px)"};
  transition: all 0.2s ease;
  z-index: 1000;
  pointer-events: ${(props) => (props.visible ? "auto" : "none")};

  @media (max-width: 768px) {
    right: 40px;
    max-width: 280px;
  }

  &:after {
    content: "";
    position: absolute;
    right: -8px;
    top: 20px;
    width: 0;
    height: 0;
    border-style: solid;
    border-width: 8px 0 8px 8px;
    border-color: transparent transparent transparent white;
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #f1f5f9;
`;

const StatItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: #64748b;
  font-size: 0.875rem;
  padding: 0.25rem 0;

  svg {
    width: 16px;
    height: 16px;
    stroke-width: 2;
    flex-shrink: 0;
  }

  span {
    white-space: nowrap;
    font-size: 0.8rem;
    .count {
      font-weight: 600;
      color: #0f172a;
      margin-left: 0.25rem;
    }
  }
`;

const HeaderImage = styled.img`
  width: 24px;
  height: 24px;
  margin-right: 8px;
  border-radius: 4px;
  object-fit: contain;
  background: #f8fafc;
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
  const [contextPosition, setContextPosition] = React.useState<{
    x: number;
    y: number;
  } | null>(null);
  const [showTooltip, setShowTooltip] = React.useState(false);
  const cornerRef = React.useRef<HTMLDivElement>(null);

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

  const createContextFromEvent = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    setContextPosition({ x: e.clientX, y: e.clientY });
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

  let context_menus = [];

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

  return (
    <StyledCard
      id={id}
      key={id}
      style={is_selected ? { backgroundColor: "#e2ffdb" } : {}}
      onClick={backendLock ? () => {} : cardClickHandler}
      onContextMenu={(e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        createContextFromEvent(e);
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
      <LabelsetCorner
        ref={cornerRef}
        hasLabelset={Boolean(labelSet)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <CornerIcon>
          <Tags size={24} />
        </CornerIcon>
        <LabelsetTooltip visible={showTooltip}>
          {labelSet ? (
            <>
              <Header as="h3" size="small">
                {labelSet.icon ? (
                  <HeaderImage src={labelSet.icon} alt={labelSet.title} />
                ) : (
                  <Tags
                    size={24}
                    style={{ marginRight: 8, color: "#64748b" }}
                  />
                )}
                <Header.Content>
                  {labelSet.title}
                  <Header.Subheader
                    style={{
                      fontSize: "0.8rem",
                      color: "#64748b",
                      marginTop: 4,
                    }}
                  >
                    {labelSet.description}
                  </Header.Subheader>
                </Header.Content>
              </Header>
              <StatsGrid>
                <StatItem>
                  <FileText />
                  <span>
                    Text Labels:{" "}
                    <span className="count">
                      {labelSet.tokenLabelCount || 0}
                    </span>
                  </span>
                </StatItem>
                <StatItem>
                  <FileText />
                  <span>
                    Doc Types:{" "}
                    <span className="count">{labelSet.docLabelCount || 0}</span>
                  </span>
                </StatItem>
                <StatItem>
                  <HandshakeIcon />
                  <span>
                    Relations:{" "}
                    <span className="count">
                      {labelSet.spanLabelCount || 0}
                    </span>
                  </span>
                </StatItem>
                <StatItem>
                  <Database />
                  <span>
                    Metadata:{" "}
                    <span className="count">
                      {labelSet.metadataLabelCount || 0}
                    </span>
                  </span>
                </StatItem>
              </StatsGrid>
            </>
          ) : (
            <div style={{ textAlign: "center", color: "#64748b" }}>
              <p style={{ fontWeight: 600, color: "#ef4444", marginBottom: 8 }}>
                No Labelset Selected
              </p>
              <small>Right click to edit and select a labelset</small>
            </div>
          )}
        </LabelsetTooltip>
      </LabelsetCorner>
      <StyledImage src={icon ? icon : default_corpus_icon} wrapped ui={false} />
      <StyledCardContent>
        <Card.Header>{title}</Card.Header>
        <Card.Meta>{`Created by: `}</Card.Meta>
        <Card.Description>
          <span>
            <b>Description:</b> {description}
          </span>
        </Card.Description>
      </StyledCardContent>
      <StyledCardExtra>
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
            <Statistic color="green">
              <Statistic.Value>
                <GitForkIcon size={16} />
              </Statistic.Value>
              <Statistic.Label>FORK</Statistic.Label>
              <div
                style={{ fontSize: "0.7rem", color: "#64748b", marginTop: 4 }}
              >
                from {item.parent.title}
              </div>
            </Statistic>
          ) : null}
        </Statistic.Group>
      </StyledCardExtra>
    </StyledCard>
  );
};
