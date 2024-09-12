import { useContext, useEffect, useRef, useState } from "react";

import { Header, Segment, Icon, Message, Form } from "semantic-ui-react";

import _ from "lodash";

import { AnnotationStore } from "../context";

import "./SearchWidgetStyles.css";
import { TextSearchResult } from "../../types";

const PageHeader = ({
  end_page,
  start_page,
}: {
  end_page: number;
  start_page: number;
}) => {
  if (end_page === start_page) {
    return <Header size="small">Page {end_page}</Header>;
  }
  return (
    <Header size="small">
      Page {start_page} to Page {end_page}
    </Header>
  );
};

const PlaceholderSearchResultCard = () => {
  return (
    <Message warning>
      <Message.Header>No Matching Results</Message.Header>
      <p>
        Try changing your query. Also be aware that OCR quality issues may cause
        slight changes to the characters in the PDF text layer.
      </p>
    </Message>
  );
};

const SearchResultCard = ({
  index,
  res,
  totalMatches,
  onResultClick,
}: {
  index: number;
  onResultClick: (index: number) => void;
  res: TextSearchResult;
  totalMatches: number;
}) => {
  return (
    <Message
      key={index}
      style={{ cursor: "pointer" }}
      onClick={() => onResultClick(index)}
    >
      <Message.Header>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <div>
            <PageHeader end_page={res.end_page} start_page={res.start_page} />
          </div>
          <div>
            <Header floated="right" size="tiny">
              {index + 1} of {totalMatches}
            </Header>
          </div>
        </div>
      </Message.Header>
      <hr />
      {res.fullContext}
    </Message>
  );
};

export const SearchSidebarWidget = () => {
  const annotationStore = useContext(AnnotationStore);

  const {
    textSearchMatches,
    searchForText,
    searchText,
    selectedTextSearchMatchIndex,
  } = annotationStore;

  const [docSearchCache, setDocSeachCache] = useState<string | undefined>(
    searchText
  );

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Debounched Search Handler
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  const debouncedExportSearch = useRef(
    _.debounce((searchTerm) => {
      searchForText(searchTerm);
    }, 1000)
  );

  const handleDocSearchChange = (value: string) => {
    setDocSeachCache(value);
    debouncedExportSearch.current(value);
  };

  const clearSearch = () => {
    setDocSeachCache("");
    searchForText("");
  };

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Jump to ref when match result index is changed
  useEffect(() => {
    // console.log("Selected match index change", selectedTextSearchMatchIndex);
    if (
      annotationStore.searchResultElementRefs?.current[
        selectedTextSearchMatchIndex
      ]
    ) {
      // console.log("Ref exists");
      annotationStore.searchResultElementRefs?.current[
        selectedTextSearchMatchIndex
      ]?.scrollIntoView();
    }
  }, [selectedTextSearchMatchIndex]);

  const onResultClick = (index: number) => {
    annotationStore.setSelectedTextSearchMatchIndex(index);
  };

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
      }}
    >
      <Segment secondary attached>
        <Form>
          <Form.Input
            iconPosition="left"
            icon={
              <Icon
                name={searchText ? "cancel" : "search"}
                link
                onClick={searchText ? () => clearSearch() : () => {}}
              />
            }
            placeholder="Search document..."
            onChange={(data) => handleDocSearchChange(data.target.value)}
            value={docSearchCache}
          />
        </Form>
      </Segment>
      <Segment
        secondary
        style={{ height: "100%", overflowY: "auto" }}
        attached="bottom"
      >
        {annotationStore.textSearchMatches.length > 0 ? (
          annotationStore.textSearchMatches.map((res, index) => {
            return (
              <SearchResultCard
                key={`SearchResultCard_${index}`}
                index={index}
                totalMatches={textSearchMatches.length}
                res={res}
                onResultClick={() => onResultClick(index)}
              />
            );
          })
        ) : (
          <PlaceholderSearchResultCard />
        )}
      </Segment>
    </div>
  );
};
