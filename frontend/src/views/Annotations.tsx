import { useEffect, useRef, useState } from "react";

import _ from "lodash";

import { useQuery, useReactiveVar } from "@apollo/client";

import {
  authToken,
  annotationContentSearchTerm,
  filterToLabelsetId,
  openedCorpus,
  filterToCorpus,
  filterToLabelId,
} from "../graphql/cache";
import { LooseObject } from "../components/types";
import { CardLayout } from "../components/layout/CardLayout";
import { CreateAndSearchBar } from "../components/layout/CreateAndSearchBar";
import { useLocation } from "react-router-dom";
import {
  GetAnnotationsInputs,
  GetAnnotationsOutputs,
  GetCorpusLabelsetAndLabelsInputs,
  GetCorpusLabelsetAndLabelsOutputs,
  GET_ANNOTATIONS,
  GET_CORPUSES,
} from "../graphql/queries";
import { FilterToLabelsetSelector } from "../components/widgets/model-filters/FilterToLabelsetSelector";
import { FilterToLabelSelector } from "../components/widgets/model-filters/FilterToLabelSelector";
import {
  AnnotationLabelType,
  ServerAnnotationType,
  LabelType,
} from "../graphql/types";
import { AnnotationCards } from "../components/annotations/AnnotationCards";
import { FilterToCorpusSelector } from "../components/widgets/model-filters/FilterToCorpusSelector";

export const Annotations = () => {
  const annotation_search_term = useReactiveVar(annotationContentSearchTerm);
  const filter_to_labelset_id = useReactiveVar(filterToLabelsetId);
  const filtered_to_corpus = useReactiveVar(filterToCorpus);
  const filter_to_label_id = useReactiveVar(filterToLabelId);
  const opened_corpus = useReactiveVar(openedCorpus);
  const auth_token = useReactiveVar(authToken);

  const location = useLocation();

  const [searchCache, setSearchCache] = useState<string>("");

  let annotation_variables: LooseObject = {
    label_Type: "TEXT_LABEL",
  };
  if (annotation_search_term) {
    annotation_variables["rawText_Contains"] = annotation_search_term;
  }
  if (filter_to_labelset_id) {
    annotation_variables["usesLabelFromLabelsetId"] = filter_to_labelset_id;
  }
  if (filtered_to_corpus) {
    annotation_variables["corpusId"] = filtered_to_corpus.id;
  }
  if (filter_to_label_id) {
    annotation_variables["annotationLabelId"] = filter_to_label_id;
  }

  const {
    refetch: refetch_annotations,
    loading: annotation_loading,
    error: annotation_error,
    data: annotation_data,
    fetchMore: fetchMoreAnnotations,
  } = useQuery<GetAnnotationsOutputs, GetAnnotationsInputs>(GET_ANNOTATIONS, {
    variables: annotation_variables,
    notifyOnNetworkStatusChange: true, // required to get loading signal on fetchMore
  });

  const {
    refetch: refetch_corpus,
    loading: corpus_loading,
    data: corpus_data,
    error: corpus_error,
  } = useQuery<
    GetCorpusLabelsetAndLabelsOutputs,
    GetCorpusLabelsetAndLabelsInputs
  >(GET_CORPUSES, {
    variables: annotation_variables,
    notifyOnNetworkStatusChange: true, // required to get loading signal on fetchMore
  });

  useEffect(() => {
    refetch_annotations();
  }, [filter_to_label_id]);
  useEffect(() => {
    refetch_annotations();
  }, [filter_to_labelset_id]);
  useEffect(() => {
    refetch_annotations();
  }, [filtered_to_corpus]);
  useEffect(() => {
    if (opened_corpus) {
      refetch_annotations();
      refetch_corpus();
    }
  }, [opened_corpus]);
  useEffect(() => {
    refetch_annotations();
  }, [annotation_search_term]);
  useEffect(() => {
    refetch_annotations();
  }, [location]);
  useEffect(() => {
    refetch_annotations();
  }, [auth_token]);

  let items: ServerAnnotationType[] = [];
  if (annotation_data?.annotations) {
    items = annotation_data.annotations.edges.map((edge) => edge.node);
  }

  let labels: AnnotationLabelType[] = [];
  if (corpus_data?.corpus?.labelSet?.allAnnotationLabels) {
    labels = corpus_data.corpus.labelSet.allAnnotationLabels.flatMap((f) =>
      !!f ? [f] : []
    ) as AnnotationLabelType[];
  }

  /**
   * Set up the debounced search handling for the Document SearchBar
   */
  const debouncedSearch = useRef(
    _.debounce((searchTerm) => {
      annotationContentSearchTerm(searchTerm);
    }, 1000)
  );

  const handleSearchChange = (value: string) => {
    setSearchCache(value);
    debouncedSearch.current(value);
  };

  /**
   * Load the labelsets
   */

  /**
   * Setup mutaton to create new labelset
   */

  return (
    <CardLayout
      SearchBar={
        <CreateAndSearchBar
          onChange={(value: string) => handleSearchChange(value)}
          actions={[]}
          filters={
            <>
              <FilterToLabelsetSelector
                fixed_labelset_id={
                  filtered_to_corpus?.labelSet?.id
                    ? filtered_to_corpus.labelSet.id
                    : undefined
                }
              />
              <FilterToCorpusSelector
                uses_labelset_id={filter_to_labelset_id}
              />
              {filter_to_labelset_id || filtered_to_corpus?.labelSet?.id ? (
                <FilterToLabelSelector
                  label_type={LabelType.TokenLabel}
                  only_labels_for_labelset_id={
                    filter_to_labelset_id
                      ? filter_to_labelset_id
                      : filtered_to_corpus?.labelSet?.id
                      ? filtered_to_corpus.labelSet.id
                      : undefined
                  }
                />
              ) : (
                <></>
              )}
            </>
          }
          placeholder="Search for annotation..."
          value={searchCache}
        />
      }
    >
      <AnnotationCards
        items={items}
        fetchMore={fetchMoreAnnotations}
        loading={annotation_loading}
        loading_message="Loading Annotations..."
        pageInfo={
          annotation_data?.annotations?.pageInfo
            ? annotation_data.annotations.pageInfo
            : null
        }
      />
    </CardLayout>
  );
};
