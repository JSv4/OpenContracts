import { useState } from "react";
import { Button, Form, Header, Image, Segment } from "semantic-ui-react";

import { useNavigate } from "react-router-dom";

import { useMutation } from "@apollo/client";

import { userObj, authToken } from "../graphql/cache";
import {
  LoginInputs,
  LoginOutputs,
  LOGIN_MUTATION,
} from "../graphql/mutations";
import { toast } from "react-toastify";

import logo_text from "../assets/images/os_legal_128_name_left_dark.png";
import useWindowDimensions from "../components/hooks/WindowDimensionHook";

const divStyle = {
  width: "100vw",
  height: "100vh",
  backgroundImage: "url(/adam-rhodes-uBrWOHLgOcg-unsplash.jpg)",
  backgroundSize: "cover",
};

export const Login = () => {
  const { width } = useWindowDimensions();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();

  const [
    tryLogin,
    { loading: login_loading, error: login_error, data: login_data },
  ] = useMutation<LoginOutputs, LoginInputs>(LOGIN_MUTATION, {
    onCompleted: (data) => {
      authToken(data.tokenAuth.token);
      userObj(data.tokenAuth.user);
      navigate("/");
    },
  });
  if (login_error) {
    toast.error("ERROR!\nCould not log you in!");
  }

  // Try login with provider username and password
  const handleLoginClick = (username: string, password: string) => {
    let variables = {
      variables: {
        username,
        password,
      },
    };
    tryLogin(variables);
  };

  return (
    <div style={divStyle}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          alignContent: "center",
          height: "100%",
        }}
      >
        <Segment
          tertiary
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            alignContent: "center",
            paddingBottom: "4vh",
            paddingTop: "4vh",
            paddingLeft: "1.5vw",
            paddingRight: "1.5vw",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              width: "100%",
              marginBottom: "3vh",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                textAlign: "right",
                justifyContent: "center",
                paddingBottom: "1vh",
                width: "100%",
              }}
            >
              <div>
                <Image
                  style={{
                    maxHeight: "100px",
                    height: "10vh",
                    paddingRight: "8px",
                  }}
                  src={logo_text}
                />
              </div>
            </div>
            <div
              style={{
                flex: "column",
                textAlign: "center",
                alignSelf: "center",
                alignItems: "center",
                alignContent: "center",
                justifyContent: "center",
                height: "auto",
                marginRight: "5%",
              }}
            >
              <div>
                <Header style={{ marginTop: "1vh", fontSize: "2em" }}>
                  Open Contracts
                  <Header.Subheader
                    style={{ marginTop: ".25em", fontSize: ".65em" }}
                  >
                    The Open Contract Labeling Platform
                  </Header.Subheader>
                </Header>
              </div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "center",
              width: "100%",
            }}
          >
            <Form
              style={{
                width: "100%",
                display: "flex",
                flexDirection: "row",
                justifyContent: "center",
              }}
              size="large"
            >
              <Segment
                secondary
                style={
                  width <= 1000
                    ? {
                        width: "80%",
                        maxWidth: "300px",
                        minWidth: "200px",
                      }
                    : {
                        width: "25vw",
                        maxWidth: "300px",
                      }
                }
              >
                <Header as="h4" textAlign="left">
                  Please Login:
                </Header>
                <Form.Input
                  fluid
                  icon="user"
                  iconPosition="left"
                  placeholder="Username"
                  value={username}
                  onChange={(data) => {
                    setUsername(`${data.target.value}`);
                  }}
                />
                <Form.Input
                  fluid
                  icon="lock"
                  iconPosition="left"
                  placeholder="Password"
                  type="password"
                  value={password}
                  onChange={(data) => {
                    setPassword(`${data.target.value}`);
                  }}
                />
                <Button
                  color="teal"
                  fluid
                  size="large"
                  onClick={() => handleLoginClick(username, password)}
                >
                  Login
                </Button>
              </Segment>
            </Form>
          </div>
        </Segment>
      </div>
      <div
        style={{
          zIndex: 100,
          position: "absolute",
          bottom: "2vh",
          left: "2vw",
        }}
      >
        <Image style={{ height: "8vh" }} src={logo_text} />
      </div>
    </div>
  );
};
