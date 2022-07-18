import { Header, Breadcrumb } from "semantic-ui-react";

import styled from "styled-components";

import { useReactiveVar } from "@apollo/client";

import { VerticallyCenteredDiv } from "../layout/Wrappers";

import { openedCorpus, openedDocument } from "../../graphql/cache";

const handleNavHome = () => {
  openedCorpus(null);
  openedDocument();
};

export const CorpusBreadcrumbs = () => {
  const opened_corpus = useReactiveVar(openedCorpus);
  const opened_document = useReactiveVar(openedDocument);

  return (
    <VerticallyCenteredDiv>
      <BreadCrumbContainer>
        <div style={{ marginRight: ".5rem" }}>
          <Header as="h4">Selected Corpus:</Header>
        </div>
        <Breadcrumb>
          {opened_corpus ? (
            <Breadcrumb.Section
              onClick={() => handleNavHome()}
              link
              active={!opened_document && !opened_corpus}
            >
              Corpuses
            </Breadcrumb.Section>
          ) : (
            "None"
          )}
          {opened_corpus ? (
            <>
              <Breadcrumb.Divider />
              <Breadcrumb.Section
                onClick={() => openedDocument(null)}
                link
                active={opened_corpus && !opened_document}
              >
                {opened_corpus.title}
              </Breadcrumb.Section>
            </>
          ) : (
            <></>
          )}
          {opened_document ? (
            <>
              <Breadcrumb.Divider />
              <Breadcrumb.Section active>
                {opened_document.description}
              </Breadcrumb.Section>
            </>
          ) : (
            <></>
          )}
        </Breadcrumb>
      </BreadCrumbContainer>
    </VerticallyCenteredDiv>
  );
};

const BreadCrumbContainer = styled.div`
  display: flex;
  width: 100%;
  flex-direction: row;
  justify-content: flex-start;
`;
