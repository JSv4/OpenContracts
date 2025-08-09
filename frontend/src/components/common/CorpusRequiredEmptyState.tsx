import React from "react";
import { Header, Icon, Button } from "semantic-ui-react";
import styled from "styled-components";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  text-align: center;
  min-height: 300px;
  color: #666;
`;

const IconWrapper = styled.div`
  margin-bottom: 1.5rem;
  opacity: 0.4;
`;

const StyledHeader = styled(Header)`
  margin: 1rem 0 !important;
  color: #333;
`;

const Description = styled.p`
  font-size: 1.1rem;
  color: #666;
  margin-bottom: 2rem;
  max-width: 500px;
`;

interface CorpusRequiredEmptyStateProps {
  feature: string;
  onAddToCorpus: () => void;
}

export const CorpusRequiredEmptyState: React.FC<
  CorpusRequiredEmptyStateProps
> = ({ feature, onAddToCorpus }) => {
  return (
    <Container>
      <IconWrapper>
        <Icon name="folder open outline" size="huge" color="grey" />
      </IconWrapper>
      <StyledHeader as="h3">{feature} requires corpus membership</StyledHeader>
      <Description>
        Add this document to one of your corpuses to enable collaborative
        features like annotations, AI chat, and data extraction.
      </Description>
      <Button primary onClick={onAddToCorpus}>
        <Icon name="plus" /> Add to Corpus
      </Button>
    </Container>
  );
};
