import React from "react";
import styled from "styled-components";
import { FileQuestion } from "lucide-react";

interface PlaceholderCardProps {
  title?: string;
  description?: string;
  style?: React.CSSProperties;
  image?: React.ReactNode;
  compact?: boolean;
}

const CardContainer = styled.div<{ $compact?: boolean }>`
  background: white;
  border-radius: 12px;
  padding: ${(props) => (props.$compact ? "1.5rem" : "2rem")};
  text-align: center;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.15),
    0 2px 4px -2px rgba(0, 0, 0, 0.1);
  margin: 1rem;
  transition: all 0.2s ease;
  border: 1px solid #d1d5db;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: ${(props) => (props.$compact ? "200px" : "300px")};
  max-height: ${(props) => (props.$compact ? "300px" : "400px")};

  &:hover {
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2),
      0 4px 6px -4px rgba(0, 0, 0, 0.15);
    transform: translateY(-1px);
  }
`;

const IconWrapper = styled.div`
  width: 48px;
  height: 48px;
  margin: 0 auto 1.25rem;
  background: #e5e7eb;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #374151;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.12);

  svg {
    width: 24px;
    height: 24px;
    stroke-width: 2px;
  }
`;

const ImageWrapper = styled.div<{ $compact?: boolean }>`
  margin: 0 auto 1.5rem;
  opacity: 1;
  transition: opacity 0.2s ease;
  width: ${(props) => (props.$compact ? "60%" : "75%")};
  max-width: 300px;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    opacity: 0.85;
  }

  img {
    max-width: 100%;
    height: auto;
    max-height: 180px;
    object-fit: contain;
  }
`;

const Title = styled.h3<{ $compact?: boolean }>`
  color: #000000;
  font-size: ${(props) => (props.$compact ? "1.1rem" : "1.25rem")};
  font-weight: 700;
  margin: 0 0 0.75rem;
  position: relative;
  z-index: 1;
`;

const Description = styled.p<{ $compact?: boolean }>`
  color: #374151;
  font-size: ${(props) => (props.$compact ? "0.9rem" : "0.975rem")};
  line-height: 1.5;
  margin: 0;
  max-width: ${(props) => (props.$compact ? "20rem" : "24rem")};
  margin: 0 auto;
  position: relative;
  z-index: 1;
  font-weight: 500;
`;

const Wave = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 100px;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(243, 244, 246, 0.95) 100%
  );
  border-radius: 0 0 12px 12px;
  z-index: 0;
`;

export const PlaceholderCard: React.FC<PlaceholderCardProps> = ({
  title = "No Results Found",
  description = "We couldn't find any items matching your current filters or search criteria.",
  style,
  image,
  compact = false,
}) => (
  <CardContainer style={style} $compact={compact}>
    {image ? (
      <ImageWrapper $compact={compact}>{image}</ImageWrapper>
    ) : (
      <IconWrapper>
        <FileQuestion />
      </IconWrapper>
    )}
    <Title $compact={compact}>{title}</Title>
    {description && <Description $compact={compact}>{description}</Description>}
    <Wave />
  </CardContainer>
);
