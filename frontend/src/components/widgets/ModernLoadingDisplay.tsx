import React from "react";
import styled, { keyframes } from "styled-components";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Folder,
  Lock,
  Database,
  BookOpen,
  Archive,
} from "lucide-react";
import { color } from "../../theme/colors";

interface ModernLoadingDisplayProps {
  type?: "document" | "corpus" | "auth" | "default";
  message?: string;
  fullScreen?: boolean;
  size?: "small" | "medium" | "large";
}

const pulse = keyframes`
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
`;

const shimmer = keyframes`
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
`;

const rotate = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

const float = keyframes`
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-10px);
  }
`;

const Container = styled(motion.div)<{ $fullScreen?: boolean; $size?: string }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${(props) => (props.$size === "small" ? "2rem" : "3rem")};
  min-height: ${(props) =>
    props.$size === "small"
      ? "200px"
      : props.$size === "medium"
      ? "300px"
      : "400px"};
  ${(props) =>
    props.$fullScreen &&
    `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, ${color.N2} 0%, ${color.B1} 100%);
    backdrop-filter: blur(12px);
    z-index: 9999;
  `}
`;

const IconContainer = styled(motion.div)<{ $type?: string }>`
  position: relative;
  width: 80px;
  height: 80px;
  margin-bottom: 2rem;

  &::before {
    content: "";
    position: absolute;
    inset: -20px;
    background: ${(props) => {
      switch (props.$type) {
        case "document":
          return `linear-gradient(135deg, ${color.B3} 0%, ${color.B5} 100%)`;
        case "corpus":
          return `linear-gradient(135deg, ${color.T3} 0%, ${color.T6} 100%)`;
        case "auth":
          return `linear-gradient(135deg, ${color.P3} 0%, ${color.P6} 100%)`;
        default:
          return `linear-gradient(135deg, ${color.N4} 0%, ${color.N6} 100%)`;
      }
    }};
    border-radius: 50%;
    opacity: 0.15;
    animation: ${pulse} 2s ease-in-out infinite;
    filter: blur(20px);
  }
`;

const IconWrapper = styled(motion.div)<{ $type?: string }>`
  position: relative;
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${color.white};
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04);
  animation: ${float} 3s ease-in-out infinite;
  border: 1px solid ${color.N3};

  svg {
    width: 36px;
    height: 36px;
    color: ${(props) => {
      switch (props.$type) {
        case "document":
          return color.B5;
        case "corpus":
          return color.T6;
        case "auth":
          return color.P6;
        default:
          return color.N7;
      }
    }};
  }
`;

const LoadingDots = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 1rem;
`;

const Dot = styled(motion.div)<{ $delay: number }>`
  width: 6px;
  height: 6px;
  background: ${color.B5};
  border-radius: 50%;
  animation: ${pulse} 1.4s ease-in-out infinite;
  animation-delay: ${(props) => props.$delay}s;
`;

const Message = styled(motion.h3)`
  font-size: 1.125rem;
  font-weight: 600;
  color: ${color.N10};
  margin: 0;
  margin-top: 0.5rem;
  text-align: center;
  letter-spacing: -0.01em;
`;

const SubMessage = styled(motion.p)`
  font-size: 0.875rem;
  color: ${color.N7};
  margin-top: 0.5rem;
  text-align: center;
  letter-spacing: 0.01em;
`;

const ProgressBar = styled(motion.div)`
  width: 200px;
  height: 3px;
  background: ${color.N3};
  border-radius: 100px;
  overflow: hidden;
  margin-top: 1.5rem;
`;

const ProgressFill = styled(motion.div)`
  height: 100%;
  background: linear-gradient(90deg, transparent, ${color.B5}, transparent);
  background-size: 200% 100%;
  animation: ${shimmer} 1.5s ease-in-out infinite;
`;

const getIcon = (type?: string) => {
  switch (type) {
    case "document":
      return <FileText />;
    case "corpus":
      return <Archive />;
    case "auth":
      return <Lock />;
    default:
      return <Database />;
  }
};

const getMessage = (type?: string, customMessage?: string) => {
  if (customMessage) return customMessage;

  switch (type) {
    case "document":
      return "Opening Document";
    case "corpus":
      return "Loading Corpus";
    case "auth":
      return "Securing Your Session";
    default:
      return "Loading Content";
  }
};

const getSubMessage = (type?: string) => {
  switch (type) {
    case "document":
      return "Retrieving document and annotations";
    case "corpus":
      return "Organizing your document collection";
    case "auth":
      return "Verifying credentials";
    default:
      return "Just a moment";
  }
};

export const ModernLoadingDisplay: React.FC<ModernLoadingDisplayProps> = ({
  type = "default",
  message,
  fullScreen = false,
  size = "medium",
}) => {
  return (
    <AnimatePresence>
      <Container
        $fullScreen={fullScreen}
        $size={size}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        <IconContainer $type={type}>
          <IconWrapper
            $type={type}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 20,
              delay: 0.1,
            }}
          >
            {getIcon(type)}
          </IconWrapper>
        </IconContainer>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Message>{getMessage(type, message)}</Message>
          <SubMessage>{getSubMessage(type)}</SubMessage>
        </motion.div>

        <ProgressBar
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ delay: 0.3 }}
        >
          <ProgressFill />
        </ProgressBar>

        <LoadingDots>
          <Dot $delay={0} />
          <Dot $delay={0.2} />
          <Dot $delay={0.4} />
        </LoadingDots>
      </Container>
    </AnimatePresence>
  );
};

export const SkeletonLoader = styled.div<{ $height?: string; $width?: string }>`
  height: ${(props) => props.$height || "20px"};
  width: ${(props) => props.$width || "100%"};
  background: linear-gradient(
    90deg,
    ${color.N3} 25%,
    ${color.N4} 50%,
    ${color.N3} 75%
  );
  background-size: 200% 100%;
  animation: ${shimmer} 1.5s infinite;
  border-radius: 4px;
  margin: 8px 0;
`;

export const CardSkeleton: React.FC = () => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    style={{
      padding: "1.5rem",
      background: color.white,
      borderRadius: "8px",
      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
      margin: "1rem",
      border: `1px solid ${color.N3}`,
    }}
  >
    <SkeletonLoader $height="24px" $width="60%" />
    <SkeletonLoader $height="16px" $width="100%" />
    <SkeletonLoader $height="16px" $width="90%" />
    <SkeletonLoader $height="16px" $width="95%" />
    <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
      <SkeletonLoader $height="32px" $width="80px" />
      <SkeletonLoader $height="32px" $width="80px" />
    </div>
  </motion.div>
);

export const DocumentCardSkeleton: React.FC = () => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    style={{
      padding: "1.5rem",
      background: color.white,
      borderRadius: "8px",
      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
      margin: "1rem",
      border: `1px solid ${color.N3}`,
      display: "flex",
      gap: "1rem",
    }}
  >
    <div style={{ width: "48px", height: "48px", flexShrink: 0 }}>
      <SkeletonLoader $height="48px" $width="48px" />
    </div>
    <div style={{ flex: 1 }}>
      <SkeletonLoader $height="20px" $width="70%" />
      <SkeletonLoader $height="14px" $width="100%" />
      <SkeletonLoader $height="14px" $width="90%" />
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
        <SkeletonLoader $height="20px" $width="60px" />
        <SkeletonLoader $height="20px" $width="80px" />
        <SkeletonLoader $height="20px" $width="70px" />
      </div>
    </div>
  </motion.div>
);
