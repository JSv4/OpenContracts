import { Header, Breadcrumb } from "semantic-ui-react";

import styled from "styled-components";

import { useReactiveVar } from "@apollo/client";

import { VerticallyCenteredDiv } from "../layout/Wrappers";

import { openedCorpus, openedDocument } from "../../graphql/cache";
import { useNavigate } from "react-router-dom";

export const CorpusBreadcrumbs = () => {
  const opened_corpus = useReactiveVar(openedCorpus);
  const opened_document = useReactiveVar(openedDocument);

  const navigate = useNavigate();

  const gotoHome = () => {
    openedCorpus(null);
    openedDocument(null);
    navigate("/corpuses");
  };
  const gotoCorpus = () => navigate(`/corpuses/${opened_corpus?.id}`);

  return (
    <VerticallyCenteredDiv>
      <BreadCrumbContainer>
        <div style={{ marginRight: ".5rem" }}>
          <Header
            as="h4"
            style={{
              fontSize: window.innerWidth <= 768 ? "0.9rem" : undefined,
            }}
          >
            Selected Corpus:
          </Header>
        </div>
        <Breadcrumb>
          {opened_corpus ? (
            <Breadcrumb.Section
              onClick={gotoHome}
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
                onClick={gotoCorpus}
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

  @media (max-width: 768px) {
    flex-direction: column;
    padding: 0.5rem;
  }
`;
