import React, { useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import {
  Container,
  Header,
  Icon,
  Input,
  Grid,
  Statistic,
  SemanticICONS,
} from "semantic-ui-react";
import { toast } from "react-toastify";
import { openedQueryObj } from "../../graphql/cache";
import {
  ASK_QUERY_OF_CORPUS,
  AskQueryOfCorpusInputType,
  AskQueryOfCorpusOutputType,
} from "../../graphql/mutations";
import {
  CorpusStats,
  GET_CORPUS_STATS,
  GetCorpusStatsInputType,
  GetCorpusStatsOutputType,
} from "../../graphql/queries";
import CountUp from "react-countup";
import { CorpusType } from "../../types/graphql-api";
import useWindowDimensions from "../hooks/WindowDimensionHook";
import { MOBILE_VIEW_BREAKPOINT } from "../../assets/configurations/constants";

interface NewQuerySearchProps {
  corpus: CorpusType;
}

const StatisticWithAnimation = ({
  value,
  label,
  icon,
}: {
  value: number;
  label: string;
  icon: SemanticICONS;
}) => (
  <Statistic>
    <Statistic.Value>
      <Icon name={icon} size="small" />
      <CountUp end={value} duration={2} />
    </Statistic.Value>
    <Statistic.Label>{label}</Statistic.Label>
  </Statistic>
);

export const CorpusDashboard: React.FC<NewQuerySearchProps> = ({
  corpus,
}: {
  corpus: CorpusType;
}) => {
  const { width } = useWindowDimensions();
  let use_mobile_layout = width <= MOBILE_VIEW_BREAKPOINT;
  const [query, setQuery] = useState("");
  const [stats, setStats] = useState<CorpusStats>({
    totalDocs: 0,
    totalAnalyses: 0,
    totalAnnotations: 0,
    totalExtracts: 0,
    totalComments: 0,
  });

  const { loading, error, data } = useQuery<
    GetCorpusStatsOutputType,
    GetCorpusStatsInputType
  >(GET_CORPUS_STATS, {
    variables: { corpusId: corpus.id },
    onCompleted: (data) => {
      setStats(data.corpusStats);
    },
    fetchPolicy: "network-only",
  });

  const [sendQuery] = useMutation<
    AskQueryOfCorpusOutputType,
    AskQueryOfCorpusInputType
  >(ASK_QUERY_OF_CORPUS, {
    onCompleted: (data) => {
      toast.success("SUCCESS! Question Submitted.");
      openedQueryObj(data.askQuery.obj);
    },
    onError: (err) => {
      toast.error("ERROR! Failed submitting question.");
    },
  });

  const handleSubmit = () => {
    sendQuery({
      variables: {
        corpusId: corpus.id,
        query,
      },
    });
  };

  return (
    <Container style={{ padding: "2em" }}>
      <Header as="h2" textAlign="center">
        Corpus Dashboard
      </Header>

      <Grid stackable centered style={{ marginBottom: "2em" }}>
        <Grid.Row>
          <StatisticWithAnimation
            value={stats.totalDocs}
            label="Documents"
            icon="file text"
          />
          <StatisticWithAnimation
            value={stats.totalAnnotations}
            label="Annotations"
            icon="comment"
          />
          <StatisticWithAnimation
            value={stats.totalAnalyses}
            label="Analyses"
            icon="chart bar"
          />
          <StatisticWithAnimation
            value={stats.totalExtracts}
            label="Extracts"
            icon="table"
          />
          <StatisticWithAnimation
            value={stats.totalComments}
            label="Comments"
            icon="comments"
          />
        </Grid.Row>
      </Grid>

      <Container
        text
        id="CorpusQueryHeaderContainer"
        fluid
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "center",
              paddingBottom: "2vh",
            }}
          >
            <div>
              <Header as="h2" textAlign="center">
                <Icon name="search" />
                <Header.Content>
                  {use_mobile_layout ? "" : "Corpus Query"}
                  <Header.Subheader>
                    Query your document collection
                  </Header.Subheader>
                </Header.Content>
              </Header>
            </div>
          </div>

          <Input
            fluid
            action={
              use_mobile_layout
                ? {
                    color: "teal",
                    icon: "search",
                    onClick: handleSubmit,
                  }
                : {
                    color: "teal",
                    labelPosition: "right",
                    icon: "search",
                    content: "Search",
                    onClick: handleSubmit,
                  }
            }
            style={{ minWidth: "40vw" }}
            placeholder="Enter your query here"
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={(e: React.KeyboardEvent) => {
              if (e.key === "Enter") {
                handleSubmit();
              }
            }}
          />
        </div>
      </Container>
    </Container>
  );
};
