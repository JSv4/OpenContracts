import { motion } from "framer-motion";
import { Button, Card, Input, Modal, Segment } from "semantic-ui-react";
import styled, { keyframes } from "styled-components";
import { ArrowLeft } from "lucide-react";

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
    padding: 1rem 0 !important;
    border: none !important;
    border-right: 1px solid rgba(231, 234, 237, 0.7) !important;
    border-radius: 0 !important;
    background: rgba(250, 251, 252, 0.95) !important;
    backdrop-filter: blur(10px);
    width: ${(props) => (props.collapsed ? "80px" : "280px")};
    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    overflow: hidden;
    z-index: 90;
    box-shadow: 1px 0 2px rgba(0, 0, 0, 0.02);

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
    margin: 0.5rem 0 !important;
    padding: ${(props) =>
      props.collapsed ? "1.25rem" : "1rem 1.75rem"} !important;
    background: transparent;
    border: none !important;
    color: #1a2027;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
    font-size: 1.05rem !important;
    letter-spacing: 0.01em;
    font-weight: 450;

    &:hover {
      background: rgba(231, 234, 237, 0.5) !important;
      color: #2185d0;
      transform: translateX(4px);
    }

    &.active {
      background: white !important;
      color: #2185d0;
      font-weight: 500;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.04);

      &:before {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 4px;
        background: #2185d0;
        border-radius: 0 3px 3px 0;
        box-shadow: 0 0 8px rgba(33, 133, 208, 0.4);
      }

      svg {
        color: #2185d0;
        transform: scale(1.1);
      }
    }

    svg {
      width: ${(props) => (props.collapsed ? "24px" : "22px")} !important;
      height: ${(props) => (props.collapsed ? "24px" : "22px")} !important;
      margin-right: ${(props) => (props.collapsed ? "0" : "1rem")} !important;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      stroke-width: 1.75px;
      color: ${(props) => {
        if (props.children[0].type.name === "FileText") return "#00796B";
        if (props.children[0].type.name === "MessageSquare") return "#7B1FA2";
        if (props.children[0].type.name === "Notebook") return "#E65100";
        if (props.children[0].type.name === "Database") return "#C2185B";
        if (props.children[0].type.name === "ChartNetwork") return "#1565C0";
        return "#455A64";
      }};
      opacity: 0.85;
      filter: saturate(1.2);
    }

    &:hover svg {
      transform: scale(1.15) rotate(-2deg);
      opacity: 1;
      filter: saturate(1.4) drop-shadow(0 2px 3px rgba(0, 0, 0, 0.1));
    }

    span {
      opacity: ${(props) => (props.collapsed ? 0 : 1)};
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      ${(props) => props.collapsed && "display: none;"}
      margin-top: 1px;

      /* Ensure text stays hidden in mobile view regardless of active state */
      @media (max-width: 768px) {
        opacity: 0;
        display: none;
      }
    }

    /* Mobile-friendly tabs - enhanced */
    @media (max-width: 768px) {
      width: 48px !important;
      height: 48px !important;
      padding: 0 !important;
      margin: 0 0.35rem !important;
      border-radius: 14px !important;

      svg {
        width: 24px !important;
        height: 24px !important;
      }

      &.active {
        background: ${(props) =>
          // Only show active state if the panel is actually open
          props.theme.colors?.primary || "#2185d0"} !important;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(33, 133, 208, 0.2);

        /* Reset active styles when panel is closed */
        &[aria-expanded="false"] {
          background: transparent !important;
          transform: none;
          box-shadow: none;

          svg {
            color: inherit;
            filter: none;
          }
        }

        svg {
          color: white;
          filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.2));
        }
      }

      &:hover:not(.active) {
        background: rgba(0, 0, 0, 0.04) !important;
        transform: translateY(-1px);
      }
    }

    /* Prevent shrinking */
    flex: 0 0 auto;
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
 * Below is an updated SlidingPanel that is absolutely positioned on desktop
 * (so it does not take full screen height) and fixed only on mobile.
 * We also include a "ControlButtonGroupLeft" and "ControlButton" for a back button
 * at the top left inside the tray.
 *
 * Example usage:
 *   <SlidingPanel>
 *     <ControlButtonGroupLeft>
 *       <ControlButton onClick={() => closeSideTray()}>
 *         <ArrowLeft />
 *       </ControlButton>
 *     </ControlButtonGroupLeft>
 *     ... Right tray content ...
 *   </SlidingPanel>
 */

/**
 * ControlButtonGroupLeft
 *
 * Positions a set of buttons in the top-left corner of the right tray.
 */
export const ControlButtonGroupLeft = styled.div`
  position: absolute;
  top: 1rem;
  left: 1rem;
  display: flex;
  gap: 0.75rem;
  z-index: 1100; /* ensures button stays on top within the tray */
`;

/**
 * ControlButton
 *
 * A small icon button for our tray, in this example, used to close the tray.
 */
export const ControlButton = styled(Button)`
  &&& {
    width: 2.25rem !important;
    height: 2.25rem !important;
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

/**
 * SlidingPanel
 *
 * By default (desktop), it is position:absolute so it does not cover
 * the entire screen vertically. In mobile, we switch to fixed with full height.
 */
export const SlidingPanel = styled(motion.div)`
  position: absolute;
  right: 1.5rem;
  width: clamp(320px, 65%, 520px);
  top: 0px;
  height: calc(100vh - 80px);
  background: white;
  box-shadow: -4px 0 25px rgba(0, 0, 0, 0.05);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  overflow-y: auto; /* let panel scroll internally instead of the entire page */

  @media (max-width: 768px) {
    position: fixed;
    top: 0;
    right: 0;
    width: 100%;
    height: 100%;
  }
`;

export const ControlButtonGroup = styled.div`
  position: absolute;
  top: 1.5rem;
  right: 2rem;
  display: flex;
  gap: 0.75rem;
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
