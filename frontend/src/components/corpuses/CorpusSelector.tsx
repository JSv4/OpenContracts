import React, { useCallback, useState } from "react";
import {
  Segment,
  Form,
  Dimmer,
  Loader,
  Card,
  Image,
  Icon,
  Label,
  Input,
} from "semantic-ui-react";

import styled from "styled-components";
import _ from "lodash";
import { CorpusType } from "../../graphql/types";
import { getPermissions } from "../../utils/transform";
import { PermissionTypes } from "../types";
import { GetCorpusesInputs, GetCorpusesOutputs } from "../../graphql/queries";
import { ApolloQueryResult } from "@apollo/client";

const ResponsiveSegmentGroup = styled(Segment.Group)`
  @media (max-width: 768px) {
    margin: 0 !important;
  }
`;

const ResponsiveSegment = styled(Segment)`
  @media (max-width: 768px) {
    padding: 1rem !important;
  }
`;

const SearchWrapper = styled.div`
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
`;

const ScrollableSegment = styled(Segment)`
  height: 50vh;
  overflow-y: auto;
  @media (max-width: 768px) {
    height: 40vh;
  }
`;

const ResponsiveCardGroup = styled(Card.Group)`
  @media (max-width: 768px) {
    margin-top: 1rem !important;
  }
`;

const StyledCard = styled(Card)`
  transition: all 0.3s ease;
  &:hover {
    transform: translateY(-5px);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1) !important;
  }
`;

const CardHeader = styled(Card.Header)`
  font-size: 1.2em !important;
  margin-bottom: 0.5em !important;
`;

const CardMeta = styled(Card.Meta)`
  font-size: 0.9em !important;
  color: rgba(0, 0, 0, 0.6) !important;
`;

const CardDescription = styled(Card.Description)`
  font-size: 0.95em !important;
`;

interface CorpusItemProps {
  corpus: CorpusType;
  selected: boolean;
  onClick: (corpus: CorpusType) => void;
}

function CorpusItem({ corpus, selected, onClick }: CorpusItemProps) {
  return (
    <StyledCard
      fluid
      style={selected ? { backgroundColor: "#e2ffdb" } : {}}
      onClick={() => onClick(corpus)}
    >
      <Card.Content>
        <Image floated="right" size="mini" src={corpus?.icon} />
        <CardHeader>{corpus?.title}</CardHeader>
        <CardMeta>
          <em>Author: </em>
          {corpus?.creator?.email}
        </CardMeta>
        <CardDescription>{corpus?.description}</CardDescription>
      </Card.Content>
      <Card.Content extra>
        <Label size="small">
          <Icon name="file text outline" />
          {corpus?.documents?.totalCount || 0} Documents
        </Label>
        <Label size="small">
          <Icon name="tags" />
          {corpus?.labelSet?.title ? corpus.labelSet.title : "N/A"}
        </Label>
      </Card.Content>
    </StyledCard>
  );
}

interface AddToCorpusModalSelectCorpusProps {
  selected_corpus: CorpusType | null;
  search_term: string;
  corpuses: CorpusType[];
  loading: boolean;
  onClick: (corpus: CorpusType) => void;
  searchCorpus: (
    variables?: Partial<GetCorpusesInputs> | undefined
  ) => Promise<ApolloQueryResult<GetCorpusesOutputs>>;
  setSearchTerm: (term: string) => void;
}

export function CorpusSelector({
  selected_corpus,
  onClick,
  searchCorpus,
  setSearchTerm,
  search_term,
  corpuses,
  loading,
}: AddToCorpusModalSelectCorpusProps) {
  const [localSearchTerm, setLocalSearchTerm] = useState(search_term);

  const debouncedSearch = useCallback(
    _.debounce((term: string) => {
      setSearchTerm(term);
      searchCorpus({ textSearch: term });
    }, 300),
    [setSearchTerm, searchCorpus]
  );

  const handleSearchChange = (value: string) => {
    setLocalSearchTerm(value);
    debouncedSearch(value);
  };

  const options =
    corpuses && corpuses.length > 0
      ? corpuses
          .filter((corpus) =>
            getPermissions(
              corpus?.myPermissions ? corpus.myPermissions : []
            ).includes(PermissionTypes.CAN_UPDATE)
          )
          .map((item) => (
            <CorpusItem
              key={item.id}
              corpus={item}
              selected={selected_corpus?.id === item?.id}
              onClick={onClick}
            />
          ))
      : [];

  return (
    <ResponsiveSegmentGroup>
      <ResponsiveSegment raised>
        <SearchWrapper>
          <Form>
            <Input
              icon="search"
              iconPosition="left"
              placeholder="Search for corpus..."
              onChange={(e, { value }) => handleSearchChange(value)}
              value={localSearchTerm}
              fluid
            />
          </Form>
        </SearchWrapper>
      </ResponsiveSegment>
      <ScrollableSegment raised>
        {loading ? (
          <Dimmer active inverted>
            <Loader inverted>Loading</Loader>
          </Dimmer>
        ) : null}
        <ResponsiveCardGroup itemsPerRow={1}>{options}</ResponsiveCardGroup>
      </ScrollableSegment>
    </ResponsiveSegmentGroup>
  );
}
