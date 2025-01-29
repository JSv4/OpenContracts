import { motion } from "framer-motion";
import { Button, Card, Input, Modal, Segment } from "semantic-ui-react";
import styled, { keyframes } from "styled-components";

export const HeaderContainer = styled(Segment)`
  &&& {
    margin: 0 !important;
    border-radius: 0 !important;
    padding: 1.5rem 2rem !important;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(231, 234, 237, 0.7);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
    z-index: 100;
    position: relative;

    /* Mobile-friendly header */
    @media (max-width: 768px) {
      padding: 1rem !important;

      h2 {
        font-size: 1.25rem;
      }
    }
  }
`;

export const MetadataRow = styled.div`
  display: flex;
  gap: 2rem;
  color: #6c757d;
  margin-top: 0.5rem;
  font-size: 0.9rem;

  span {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: color 0.2s ease;
    &:hover {
      color: #2185d0;
    }

    svg {
      opacity: 0.7;
    }
  }

  /* Stack metadata on small screens */
  @media (max-width: 480px) {
    flex-wrap: wrap;
    gap: 0.75rem;

    span {
      font-size: 0.8rem;
    }
  }
`;

export const ContentArea = styled.div`
  display: grid;
  grid-template-columns: auto 1fr;
  height: calc(100vh - 90px);
  background: white;
  position: relative;

  /* Stack layout on mobile */
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
`;

export const TabsColumn = styled(Segment)<{ collapsed: boolean }>`
  &&& {
    margin: 0 !important;
    padding: 0.75rem 0 !important;
    border: none !important;
    border-right: 1px solid rgba(231, 234, 237, 0.7) !important;
    border-radius: 0 !important;
    background: rgba(248, 249, 250, 0.8);
    backdrop-filter: blur(10px);
    width: ${(props) => (props.collapsed ? "64px" : "220px")};
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
    z-index: 90;

    /* Mobile optimization */
    @media (max-width: 768px) {
      width: 100%;
      height: 56px;
      display: flex;
      overflow-x: auto;
      overflow-y: hidden;
      -webkit-overflow-scrolling: touch;
      white-space: nowrap;
      padding: 0.5rem !important;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid rgba(231, 234, 237, 0.7) !important;

      /* Hide scrollbar but keep functionality */
      scrollbar-width: none;
      &::-webkit-scrollbar {
        display: none;
      }

      /* Center icons when in mobile mode */
      display: flex;
      justify-content: space-around;
      align-items: center;
    }
  }
`;

export const TabButton = styled(Button)<{ collapsed: boolean }>`
  &&& {
    width: 100%;
    text-align: ${(props) => (props.collapsed ? "center" : "left")} !important;
    border-radius: 0 !important;
    margin: 0.25rem 0 !important;
    padding: ${(props) =>
      props.collapsed ? "1rem" : "0.8rem 1.5rem"} !important;
    background: transparent;
    border: none !important;
    color: #495057;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;

    &:hover {
      background: rgba(231, 234, 237, 0.4) !important;
      color: #2185d0;
    }

    &.active {
      background: white !important;
      color: #2185d0;
      font-weight: 500;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);

      &:before {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 3px;
        background: #2185d0;
        border-radius: 0 2px 2px 0;
      }

      svg {
        color: #2185d0;
      }
    }

    svg {
      margin-right: ${(props) =>
        props.collapsed ? "0" : "0.75rem"} !important;
      transition: all 0.2s ease;
      color: ${(props) => {
        // Custom colors for each icon type
        if (props.children[0].type.name === "FileText") return "#4CAF50";
        if (props.children[0].type.name === "MessageSquare") return "#9C27B0";
        if (props.children[0].type.name === "Notebook") return "#FF9800";
        if (props.children[0].type.name === "Database") return "#E91E63";
        if (props.children[0].type.name === "ChartNetwork") return "#2196F3";
        return "#495057"; // default color
      }};
      opacity: 0.75;
    }

    &:hover svg {
      transform: scale(1.1);
      opacity: 1;
    }

    span {
      opacity: ${(props) => (props.collapsed ? 0 : 1)};
      transition: opacity 0.2s ease;
      ${(props) => props.collapsed && "display: none;"}
    }

    /* Mobile-friendly tabs - icons only */
    @media (max-width: 768px) {
      width: 40px !important;
      height: 40px !important;
      padding: 0 !important;
      margin: 0 0.25rem !important;
      border-radius: 12px !important;
      display: flex !important;
      align-items: center;
      justify-content: center;
      background: transparent;

      span {
        display: none !important; /* Hide text labels on mobile */
      }

      svg {
        margin: 0 !important;
        width: 20px;
        height: 20px;
      }

      &.active {
        background: ${(props) =>
          props.theme.colors?.primary || "#2185d0"} !important;
        color: white !important;

        &:before {
          display: none; /* Remove side indicator on mobile */
        }

        svg {
          color: white;
        }
      }

      /* Add subtle hover effect */
      &:hover:not(.active) {
        background: rgba(0, 0, 0, 0.03) !important;
        transform: translateY(-1px);
      }
    }
  }
`;

// Add a tooltip for mobile tabs
export const TabTooltip = styled.div`
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease;

  /* Only show on mobile */
  @media (min-width: 769px) {
    display: none;
  }
`;

export const MainContentArea = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
  position: relative;
`;

export const SummaryContent = styled.div`
  max-width: 800px;
  margin: 0 auto;
  padding: 1rem;
  transition: all 0.3s ease;

  &.dimmed {
    opacity: 0.4;
    transform: scale(0.98);
    filter: blur(1px);
  }
`;

/**
 * SlidingPanel
 *
 * The right sidebar uses a combination of clamp for width on mid-sized screens
 * and goes full-width on small screens. Child elements remain scrollable.
 */
export const SlidingPanel = styled(motion.div)`
  position: absolute;
  top: 0;
  right: 0;
  /* For larger screens: at least 320px, up to 65% of total width, max 520px */
  width: clamp(320px, 65%, 520px);
  height: 100%;
  background: white;
  box-shadow: -4px 0 25px rgba(0, 0, 0, 0.05);
  z-index: 80;
  display: flex;
  flex-direction: column;

  /* On screens <= 768px, take the entire width below the tab bar */
  @media (max-width: 768px) {
    width: 100%;
    height: calc(100% - 56px);
    top: 56px;
  }
`;

export const ControlButtonGroup = styled.div`
  position: absolute;
  top: 1.5rem;
  right: 2rem;
  display: flex;
  gap: 0.75rem;
`;

export const ControlButton = styled(Button)`
  &&& {
    width: 2.5rem !important;
    height: 2.5rem !important;
    padding: 0 !important;
    border-radius: 50% !important;
    display: flex !important;
    align-items: center;
    justify-content: center;
    background: white !important;
    border: 1px solid rgba(231, 234, 237, 0.7) !important;
    color: #495057 !important;
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.05);
      border-color: #2185d0 !important;
      color: #2185d0 !important;
    }

    &:active {
      transform: translateY(1px);
    }

    svg {
      width: 16px;
      height: 16px;
    }
  }
`;

export const RelationshipPanel = styled.div`
  padding: 1.5rem;
  height: 100%;
  overflow-y: auto;

  h3 {
    font-size: 1.25rem;
    font-weight: 500;
    color: #212529;
    margin-bottom: 1.5rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
`;

export const RelationshipCard = styled(Card)`
  &&& {
    width: 100%;
    margin-bottom: 1rem !important;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02) !important;
    border: 1px solid rgba(231, 234, 237, 0.7) !important;
    transition: all 0.2s ease;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.05) !important;
      border-color: #2185d0 !important;
    }

    .content {
      padding: 1.25rem !important;
    }
  }
`;

export const RelationshipType = styled.div`
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 500;
  color: #2185d0;
  background: rgba(33, 133, 208, 0.1);
  padding: 0.25rem 0.75rem;
  border-radius: 1rem;
  margin-bottom: 0.75rem;
`;

// Add these styled components for our shimmer effect
export const shimmerAnimation = keyframes`
  0% {
    background-position: -1000px 0;
  }
  100% {
    background-position: 1000px 0;
  }
`;

export const PlaceholderBase = styled.div`
  background: linear-gradient(90deg, #f0f0f0 0%, #f7f7f7 50%, #f0f0f0 100%);
  background-size: 1000px 100%;
  animation: ${shimmerAnimation} 2s infinite linear;
  border-radius: 8px;
`;

export const SummaryPlaceholder = styled.div`
  padding: 3rem;
  max-width: 800px;
  margin: 0 auto;

  ${PlaceholderBase} {
    height: 28px;
    margin-bottom: 1.5rem;

    &:nth-child(1) {
      width: 70%;
    }
    &:nth-child(2) {
      width: 90%;
    }
    &:nth-child(3) {
      width: 85%;
    }
    &:nth-child(4) {
      width: 95%;
    }

    &:last-child {
      margin-bottom: 0;
    }
  }
`;

export const NotePlaceholder = styled(motion.div)`
  padding: 2rem;
  background: white;
  border-radius: 16px;
  margin-bottom: 1.5rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(231, 234, 237, 0.7);
  max-width: 700px;
  margin-left: auto;
  margin-right: auto;

  ${PlaceholderBase} {
    &.header {
      height: 24px;
      width: 40%;
      margin-bottom: 1.5rem;
    }

    &.content {
      height: 20px;
      margin-bottom: 1rem;

      &:last-child {
        margin-bottom: 0;
      }
      &:nth-child(2) {
        width: 95%;
      }
      &:nth-child(3) {
        width: 85%;
      }
    }
  }
`;

export const RelationshipPlaceholder = styled(motion.div)`
  padding: 2rem;
  background: white;
  border-radius: 16px;
  margin-bottom: 1.5rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(231, 234, 237, 0.7);
  max-width: 700px;
  margin-left: auto;
  margin-right: auto;

  ${PlaceholderBase} {
    &.type {
      height: 22px;
      width: 120px;
      margin-bottom: 1.5rem;
    }

    &.title {
      height: 24px;
      width: 80%;
      margin-bottom: 1rem;
    }

    &.meta {
      height: 18px;
      width: 50%;
    }
  }
`;

export const LoadingPlaceholders: React.FC<{
  type: "summary" | "notes" | "relationships";
}> = ({ type }) => {
  const placeholderCount = 3;

  if (type === "summary") {
    return (
      <SummaryPlaceholder>
        {[...Array(4)].map((_, i) => (
          <PlaceholderBase key={i} />
        ))}
      </SummaryPlaceholder>
    );
  }

  return (
    <>
      {[...Array(placeholderCount)].map((_, i) => {
        const Placeholder =
          type === "notes" ? NotePlaceholder : RelationshipPlaceholder;
        return (
          <Placeholder
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.1 }}
          >
            <PlaceholderBase className={type === "notes" ? "header" : "type"} />
            {type === "notes" ? (
              <>
                <PlaceholderBase className="content" />
                <PlaceholderBase className="content" />
              </>
            ) : (
              <>
                <PlaceholderBase className="title" />
                <PlaceholderBase className="meta" />
              </>
            )}
          </Placeholder>
        );
      })}
    </>
  );
};

export const EmptyStateContainer = styled(motion.div)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 2rem;
  text-align: center;
  color: #6c757d;

  svg {
    color: #adb5bd;
    margin-bottom: 1.5rem;
    stroke-width: 1.5;
  }

  h3 {
    color: #495057;
    font-size: 1.25rem;
    font-weight: 500;
    margin-bottom: 0.5rem;
  }

  p {
    color: #868e96;
    font-size: 0.875rem;
    max-width: 280px;
    line-height: 1.5;
  }
`;

export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
}> = ({ icon, title, description }) => (
  <EmptyStateContainer
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
  >
    {icon}
    <h3>{title}</h3>
    <p>{description}</p>
  </EmptyStateContainer>
);
