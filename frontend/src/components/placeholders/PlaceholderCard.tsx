import React from "react";
import styled from "styled-components";
import { FileQuestion } from "lucide-react";
import { Image } from "semantic-ui-react";

interface PlaceholderCardProps {
  title?: string;
  description?: string;
  style?: React.CSSProperties;
  include_image?: boolean;
  image_style?: React.CSSProperties;
}

const CardContainer = styled.div`
  background: white;
  border-radius: 12px;
  padding: 2rem;
  text-align: center;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -2px rgba(0, 0, 0, 0.05);
  margin: 1rem;
  transition: all 0.2s ease;
  border: 1px solid #e2e8f0;
  position: relative;
  overflow: hidden;

  &:hover {
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1),
      0 4px 6px -4px rgba(0, 0, 0, 0.05);
    transform: translateY(-2px);
  }
`;

const IconWrapper = styled.div`
  width: 64px;
  height: 64px;
  margin: 0 auto 1.5rem;
  background: #f8fafc;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;

  svg {
    width: 32px;
    height: 32px;
    stroke-width: 1.5px;
  }
`;

const ImageWrapper = styled.div`
  margin: 0 auto 2rem;
  opacity: 0.7;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.8;
  }
`;

const Title = styled.h3`
  color: #1e293b;
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0 0 0.75rem;
`;

const Description = styled.p`
  color: #64748b;
  font-size: 0.975rem;
  line-height: 1.5;
  margin: 0;
  max-width: 24rem;
  margin: 0 auto;
`;

const Wave = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 120px;
  background: linear-gradient(
    180deg,
    rgba(241, 245, 249, 0) 0%,
    rgba(241, 245, 249, 0.4) 100%
  );
  border-radius: 0 0 12px 12px;
  z-index: 0;
`;

const defaultImageStyle = {
  height: "30vh",
  width: "auto",
  margin: "0 auto",
};

export const PlaceholderCard: React.FC<PlaceholderCardProps> = ({
  title = "No Results Found",
  description = "We couldn't find any items matching your current filters or search criteria.",
  style,
  include_image = false,
  image_style,
}) => (
  <CardContainer style={style}>
    {include_image ? (
      <ImageWrapper>
        <Image
          src="/static/images/empty_state.svg"
          style={{ ...defaultImageStyle, ...image_style }}
        />
      </ImageWrapper>
    ) : (
      <IconWrapper>
        <FileQuestion />
      </IconWrapper>
    )}
    <Title>{title}</Title>
    {description && <Description>{description}</Description>}
    <Wave />
  </CardContainer>
);
