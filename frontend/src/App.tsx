import { useEffect } from "react";

import { useAuth0 } from "@auth0/auth0-react";

import { Routes, Route } from "react-router-dom";

import _ from "lodash";

import { Container, Dimmer, Loader } from "semantic-ui-react";

import { toast, ToastContainer } from "react-toastify";

import { useReactiveVar } from "@apollo/client";

import { authToken, showExportModal, userObj } from "./graphql/cache";

import { VerticallyCenteredDiv } from "./components/common";
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

export const App = () => {
  const { USE_AUTH0 } = process.env;
  const show_export_modal = useReactiveVar(showExportModal);
  const { getAccessTokenSilently, user } = useAuth0();

  // Only use this if we're using Auth0 Authentication... otherwise we don't
  // need to access the Auth0 SDK.
  useEffect(() => {
    if (USE_AUTH0) {
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
  }, [getAccessTokenSilently, user?.sub]);

  return (
    <div>
      <ToastContainer />
      {show_export_modal ? (
        <ExportModal
          visible={show_export_modal}
          toggleModal={() => showExportModal(!show_export_modal)}
        />
      ) : (
        <></>
      )}
      <ThemeProvider>
        <VerticallyCenteredDiv>
          <NavMenu />
          <Container style={{ width: "100%" }}>
            <Dimmer active={false}>
              <Loader content="Logging in..." />
            </Dimmer>
            <Routes>
              <Route path="/" element={<Corpuses />} />
              {!USE_AUTH0 ? <Route path="/login" element={<Login />} /> : <></>}
              <Route path="/documents" element={<Documents />} />
              <Route path="/label_sets" element={<Labelsets />} />
              <Route path="/annotations" element={<Annotations />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms_of_service" element={<TermsOfService />} />
            </Routes>
          </Container>
          <Footer />
        </VerticallyCenteredDiv>
      </ThemeProvider>
    </div>
  );
};
