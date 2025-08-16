import React from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  FileX,
  FolderX,
  Home,
  RefreshCw,
  ArrowLeft,
  Search,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { color } from "../../theme/colors";

interface ModernErrorDisplayProps {
  type?: "document" | "corpus" | "generic";
  error?: Error | string;
  title?: string;
  onRetry?: () => void;
}

const Container = styled(motion.div)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  min-height: 400px;
  background: linear-gradient(135deg, ${color.N1} 0%, ${color.R1} 20%);
  border-radius: 12px;
  margin: 2rem;
  border: 1px solid ${color.R2};
`;

const IconWrapper = styled(motion.div)`
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${color.white};
  border: 2px solid ${color.R3};
  border-radius: 16px;
  margin-bottom: 2rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);

  svg {
    width: 36px;
    height: 36px;
    color: ${color.R6};
  }
`;

const Title = styled(motion.h2)`
  font-size: 1.5rem;
  font-weight: 700;
  color: ${color.N10};
  margin: 0 0 0.5rem;
  text-align: center;
  letter-spacing: -0.02em;
`;

const Message = styled(motion.p)`
  font-size: 1rem;
  color: ${color.N8};
  margin: 0 0 2rem;
  text-align: center;
  max-width: 500px;
  line-height: 1.6;
  letter-spacing: 0.01em;
`;

const ErrorDetails = styled(motion.div)`
  background: ${color.R1};
  border: 1px solid ${color.R2};
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 2rem;
  max-width: 600px;
  width: 100%;
`;

const ErrorCode = styled.code`
  font-family: "SF Mono", "Monaco", "Inconsolata", "Fira Code", monospace;
  font-size: 0.875rem;
  color: ${color.R8};
  word-break: break-word;
`;

const ButtonGroup = styled(motion.div)`
  display: flex;
  gap: 1rem;
  margin-top: 1rem;
`;

const Button = styled(motion.button)<{ $variant?: "primary" | "secondary" }>`
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: none;

  ${(props) =>
    props.$variant === "primary"
      ? `
    background: ${color.B5};
    color: ${color.white};
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    
    &:hover {
      background: ${color.B6};
      transform: translateY(-1px);
      box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
    }
  `
      : `
    background: ${color.white};
    color: ${color.N8};
    border: 1px solid ${color.N4};
    
    &:hover {
      background: ${color.N2};
      border-color: ${color.N5};
    }
  `}

  &:active {
    transform: translateY(0);
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const getIcon = (type?: string) => {
  switch (type) {
    case "document":
      return <FileX />;
    case "corpus":
      return <FolderX />;
    default:
      return <AlertTriangle />;
  }
};

const getTitle = (type?: string, customTitle?: string) => {
  if (customTitle) return customTitle;

  switch (type) {
    case "document":
      return "Document Unavailable";
    case "corpus":
      return "Corpus Not Found";
    default:
      return "Unable to Load Content";
  }
};

const getMessage = (type?: string, error?: Error | string) => {
  if (typeof error === "string") return error;
  if (error?.message) return error.message;

  switch (type) {
    case "document":
      return "We couldn't locate the requested document. It may have been moved, deleted, or you may not have permission to access it.";
    case "corpus":
      return "The document collection you're looking for is not available. Please check the URL or browse available collections.";
    default:
      return "We encountered an issue loading this content. Please try refreshing or return to the homepage.";
  }
};

export const ModernErrorDisplay: React.FC<ModernErrorDisplayProps> = ({
  type = "generic",
  error,
  title,
  onRetry,
}) => {
  const navigate = useNavigate();

  const handleGoHome = () => {
    navigate("/");
  };

  const handleGoBack = () => {
    if (type === "document") {
      navigate("/documents");
    } else if (type === "corpus") {
      navigate("/corpuses");
    } else {
      navigate(-1);
    }
  };

  return (
    <Container
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <IconWrapper
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{
          type: "spring",
          stiffness: 260,
          damping: 20,
          delay: 0.1,
        }}
      >
        {getIcon(type)}
      </IconWrapper>

      <Title
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        {getTitle(type, title)}
      </Title>

      <Message
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        {getMessage(type, error)}
      </Message>

      {error && typeof error === "object" && error.message && (
        <ErrorDetails
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
        >
          <ErrorCode>{error.message}</ErrorCode>
        </ErrorDetails>
      )}

      <ButtonGroup
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        {onRetry && (
          <Button $variant="primary" onClick={onRetry}>
            <RefreshCw />
            Try Again
          </Button>
        )}
        <Button $variant="secondary" onClick={handleGoBack}>
          <ArrowLeft />
          Go Back
        </Button>
        <Button $variant="secondary" onClick={handleGoHome}>
          <Home />
          Home
        </Button>
      </ButtonGroup>
    </Container>
  );
};
