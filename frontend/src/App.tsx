import { useEffect, useCallback } from "react";

import { useAuth0 } from "@auth0/auth0-react";

import { Routes, Route } from "react-router-dom";

import _ from "lodash";

import { Container } from "semantic-ui-react";

import { toast, ToastContainer } from "react-toastify";

import { useQuery, useReactiveVar } from "@apollo/client";

import {
  authToken,
  showAnnotationLabels,
  showExportModal,
  userObj,
  showCookieAcceptModal,
  openedDocument,
  openedCorpus,
  openedExtract,
  showSelectCorpusAnalyzerOrFieldsetModal,
  showUploadNewDocumentsModal,
  uploadModalPreloadedFiles,
  showKnowledgeBaseModal,
  backendUserObj,
} from "./graphql/cache";
import { GET_ME, GetMeOutputs } from "./graphql/queries";

import { NavMenu } from "./components/layout/NavMenu";
import { Footer } from "./components/layout/Footer";
import { ExportModal } from "./components/widgets/modals/ExportModal";
import { DocumentKnowledgeBase } from "./components/knowledge_base";

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
import { LabelDisplayBehavior } from "./types/graphql-api";
import { CookieConsentDialog } from "./components/cookies/CookieConsent";
import { Extracts } from "./views/Extracts";
import { useEnv } from "./components/hooks/UseEnv";
import { EditExtractModal } from "./components/widgets/modals/EditExtractModal";
import { SelectAnalyzerOrFieldsetModal } from "./components/widgets/modals/SelectCorpusAnalyzerOrFieldsetAnalyzer";
import { DocumentUploadModal } from "./components/widgets/modals/DocumentUploadModal";
import { FileUploadPackageProps } from "./components/widgets/modals/DocumentUploadModal";
import { DocumentViewer } from "./components/documents/Viewer";

export const App = () => {
  const { REACT_APP_USE_AUTH0 } = useEnv();
  const auth_token = useReactiveVar(authToken);
  const show_export_modal = useReactiveVar(showExportModal);
  const show_cookie_modal = useReactiveVar(showCookieAcceptModal);
  const knowledge_base_modal = useReactiveVar(showKnowledgeBaseModal);
  const opened_corpus = useReactiveVar(openedCorpus);
  const opened_extract = useReactiveVar(openedExtract);
  const opened_document = useReactiveVar(openedDocument);
  const show_corpus_analyzer_fieldset_modal = useReactiveVar(
    showSelectCorpusAnalyzerOrFieldsetModal
  );
  const show_upload_new_documents_modal = useReactiveVar(
    showUploadNewDocumentsModal
  );

  const { getAccessTokenSilently, user } = useAuth0();

  const handleKnowledgeBaseModalClose = useCallback(() => {
    showKnowledgeBaseModal({
      isOpen: false,
      documentId: null,
      corpusId: null,
    });
  }, []);

  // For now, our responsive layout is a bit hacky, but it's working well enough to
  // provide a passable UI on mobile. Your results not guaranteed X-)
  const { width } = useWindowDimensions();
  const show_mobile_menu = width <= 1000;

  const {
    data: meData,
    loading: meLoading,
    error: meError,
  } = useQuery<GetMeOutputs>(GET_ME, {
    skip: !auth_token,
    fetchPolicy: "network-only",
  });

  useEffect(() => {
    if (meData?.me) {
      console.log("Setting backend user from GET_ME:", meData.me);
      backendUserObj(meData.me);
    } else if (!meLoading && auth_token && meError) {
      console.error("Error fetching backend user:", meError);
      toast.error("Could not get user details from server");
    } else if (!auth_token) {
      backendUserObj(null);
    }
  }, [meData, meLoading, meError, auth_token]);

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
              console.log("Auth0 token obtained");
              authToken(token);
              userObj(user);
            } else {
              authToken("");
              userObj(null);
              backendUserObj(null);
              toast.error("Unable to login");
            }
          });
        } catch (e: any) {
          console.log(e.message);
          authToken("");
          userObj(null);
          backendUserObj(null);
        }
      } else if (user === undefined) {
        // Auth0 still loading, do nothing
      } else {
        // Auth0 user not found/logged out
        authToken("");
        userObj(null);
        backendUserObj(null);
      }
    }
  }, [getAccessTokenSilently, REACT_APP_USE_AUTH0, user?.sub]);

  console.log("Cookie Accepted: ", show_cookie_modal);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const filePackages: FileUploadPackageProps[] = acceptedFiles.map(
      (file) => ({
        file,
        formData: {
          title: file.name,
          description: `Content summary for ${file.name}`,
        },
      })
    );
    showUploadNewDocumentsModal(true);
    uploadModalPreloadedFiles(filePackages);
  }, []);

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
      {knowledge_base_modal.isOpen &&
        knowledge_base_modal.documentId &&
        knowledge_base_modal.corpusId && (
          <DocumentKnowledgeBase
            documentId={knowledge_base_modal.documentId}
            corpusId={knowledge_base_modal.corpusId}
            onClose={handleKnowledgeBaseModalClose}
          />
        )}
      {knowledge_base_modal.isOpen &&
        knowledge_base_modal.documentId &&
        !knowledge_base_modal.corpusId && (
          <DocumentViewer
            documentId={knowledge_base_modal.documentId}
            onClose={handleKnowledgeBaseModalClose}
          />
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
            {opened_corpus && (
              <SelectAnalyzerOrFieldsetModal
                open={show_corpus_analyzer_fieldset_modal}
                corpus={opened_corpus}
                document={opened_document ? opened_document : undefined}
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
            <DocumentUploadModal
              refetch={() => {
                showUploadNewDocumentsModal(false);
                uploadModalPreloadedFiles([]);
              }}
              open={Boolean(show_upload_new_documents_modal)}
              onClose={() => {
                showUploadNewDocumentsModal(false);
                uploadModalPreloadedFiles([]);
              }}
              corpusId={opened_corpus?.id || null}
            />
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
