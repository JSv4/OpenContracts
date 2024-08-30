import { useEffect } from "react";

import { useAuth0 } from "@auth0/auth0-react";

import { Routes, Route } from "react-router-dom";

import _ from "lodash";

import { Container, Dimmer, Loader } from "semantic-ui-react";

import { toast, ToastContainer } from "react-toastify";

import { useReactiveVar } from "@apollo/client";

import {
  authToken,
  showAnnotationLabels,
  showExportModal,
  userObj,
  showCookieAcceptModal,
  openedDocument,
  selectedAnalysesIds,
  selectedAnalyses,
  onlyDisplayTheseAnnotations,
  openedCorpus,
  displayAnnotationOnAnnotatorLoad,
  showSelectedAnnotationOnly,
  showAnnotationBoundingBoxes,
  openedExtract,
  showSelectCorpusAnalyzerOrFieldsetModal,
} from "./graphql/cache";

import { NavMenu } from "./components/layout/NavMenu";
import { Footer } from "./components/layout/Footer";
import { ExportModal } from "./components/widgets/modals/ExportModal";

import { PrivacyPolicy } from "./views/PrivacyPolicy";
import { TermsOfService } from "./views/TermsOfService";
import { Corpuses } from "./views/Corpuses";
import { Documents } from "./views/Documents";
import { Labelsets } from "./views/LabelSets";
import { Login } from "./views/Login";
import { Annotations } from "./views/Annotations";

import { ThemeProvider } from "./theme/ThemeProvider";

import "./assets/styles/semantic.css";
import "./App.css";
import "react-toastify/dist/ReactToastify.css";
import useWindowDimensions from "./components/hooks/WindowDimensionHook";
import { MobileNavMenu } from "./components/layout/MobileNavMenu";
import { LabelDisplayBehavior } from "./graphql/types";
import { CookieConsentDialog } from "./components/cookies/CookieConsent";
import { Extracts } from "./views/Extracts";
import { DocumentAnnotator } from "./components/annotator/DocumentAnnotator";
import { useEnv } from "./components/hooks/UseEnv";
import { EditExtractModal } from "./components/widgets/modals/EditExtractModal";
import { SelectCorpusAnalyzerOrFieldsetModal } from "./components/widgets/modals/SelectCorpusAnalyzerOrFieldsetAnalyzer";

export const App = () => {
  const { REACT_APP_USE_AUTH0 } = useEnv();
  const show_export_modal = useReactiveVar(showExportModal);
  const show_cookie_modal = useReactiveVar(showCookieAcceptModal);
  const only_display_these_annotations = useReactiveVar(
    onlyDisplayTheseAnnotations
  );
  const selected_analyes = useReactiveVar(selectedAnalyses);
  const opened_corpus = useReactiveVar(openedCorpus);
  const opened_extract = useReactiveVar(openedExtract);
  const opened_document = useReactiveVar(openedDocument);
  const opened_to_annotation = useReactiveVar(displayAnnotationOnAnnotatorLoad);
  const show_selected_annotation_only = useReactiveVar(
    showSelectedAnnotationOnly
  );
  const show_annotation_bounding_boxes = useReactiveVar(
    showAnnotationBoundingBoxes
  );
  const show_corpus_analyzer_fieldset_modal = useReactiveVar(
    showSelectCorpusAnalyzerOrFieldsetModal
  );
  const show_annotation_labels = useReactiveVar(showAnnotationLabels);

  const { getAccessTokenSilently, user } = useAuth0();

  // For now, our responsive layout is a bit hacky, but it's working well enough to
  // provide a passable UI on mobile. Your results not guaranteed X-)
  const { width } = useWindowDimensions();
  const show_mobile_menu = width <= 1000;
  const banish_sidebar = width <= 1000;

  useEffect(() => {
    if (width <= 800) {
      showAnnotationLabels(LabelDisplayBehavior.ALWAYS);
    }
  }, [width]);

  // Only use this if we're using Auth0 Authentication... otherwise we don't
  // need to access the Auth0 SDK.
  useEffect(() => {
    if (REACT_APP_USE_AUTH0) {
      if (user) {
        try {
          getAccessTokenSilently({
            audience: `https://opensource.legal/contracts`,
            scope: "application:login",
          }).then((token) => {
            // console.log("Token from get access token silently...")
            if (token) {
              // console.log("AuthToken", token);
              authToken(token);
              userObj(user);
            } else {
              authToken("");
              userObj(null);
              toast.error("Unable to login", {
                position: toast.POSITION.TOP_CENTER,
              });
            }
          });
        } catch (e: any) {
          console.log(e.message);
        }
      }
    }
  }, [getAccessTokenSilently, REACT_APP_USE_AUTH0, user?.sub]);

  console.log("Cookie Accepted: ", show_cookie_modal);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        minHeight: "122vh",
      }}
    >
      <ToastContainer />
      {show_export_modal ? (
        <ExportModal
          visible={show_export_modal}
          toggleModal={() => showExportModal(!show_export_modal)}
        />
      ) : (
        <></>
      )}
      {show_cookie_modal ? <CookieConsentDialog /> : <></>}
      <ThemeProvider>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {show_mobile_menu ? <MobileNavMenu /> : <NavMenu />}
          <Container
            id="AppContainer"
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-start",
              minHeight: "75vh",
              width: "100% !important",
              margin: "0px !important",
              padding: "0px !important",
              minWidth: "100vw",
            }}
          >
            <Dimmer active={false}>
              <Loader content="Logging in..." />
            </Dimmer>
            {opened_corpus && (
              <SelectCorpusAnalyzerOrFieldsetModal
                open={show_corpus_analyzer_fieldset_modal}
                corpus={opened_corpus}
                onClose={() => showSelectCorpusAnalyzerOrFieldsetModal(false)}
              />
            )}
            {opened_extract && (
              <EditExtractModal
                ext={opened_extract}
                open={opened_extract !== null}
                toggleModal={() => openedExtract(null)}
              />
            )}
            {opened_document && only_display_these_annotations !== undefined ? (
              <DocumentAnnotator
                open={Boolean(opened_document)}
                onClose={() => {
                  openedDocument(null);
                  selectedAnalysesIds([]);
                  selectedAnalyses([]);
                  onlyDisplayTheseAnnotations(undefined);
                }}
                display_annotations={only_display_these_annotations}
                opened_document={opened_document}
                read_only={selected_analyes.length > 0 || banish_sidebar}
                scroll_to_annotation_on_open={opened_to_annotation}
                show_selected_annotation_only={show_selected_annotation_only}
                show_annotation_bounding_boxes={show_annotation_bounding_boxes}
                show_annotation_labels={show_annotation_labels}
              />
            ) : (
              <></>
            )}

            <Routes>
              <Route path="/" element={<Corpuses />} />
              {!REACT_APP_USE_AUTH0 ? (
                <Route path="/login" element={<Login />} />
              ) : (
                <></>
              )}
              <Route path="/documents" element={<Documents />} />
              <Route path="/label_sets" element={<Labelsets />} />
              <Route path="/annotations" element={<Annotations />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms_of_service" element={<TermsOfService />} />
              <Route path="/extracts" element={<Extracts />} />
            </Routes>
          </Container>
          <Footer />
        </div>
      </ThemeProvider>
    </div>
  );
};
