import React, { useState } from "react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@apollo/client";
import { userObj, authToken, authStatusVar } from "../graphql/cache";
import {
  LoginInputs,
  LoginOutputs,
  LOGIN_MUTATION,
} from "../graphql/mutations";
import { toast } from "react-toastify";
import { User, Lock } from "lucide-react";
import logo from "../assets/images/os_legal_128_regular.png";

const PageWrapper = styled.div`
  width: 100vw;
  height: 100vh;
  background-image: url(/adam-rhodes-uBrWOHLgOcg-unsplash.jpg);
  background-size: cover;
  display: flex;
  justify-content: center;
  align-items: center;
`;

const LoginCard = styled.div`
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: 10px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  padding: 2rem;
  width: 100%;
  max-width: 400px;
`;

const Logo = styled.img`
  width: 15vh;
  height: auto;
  margin-bottom: 0px;
`;

const Title = styled.h1`
  font-size: 1.8rem;
  color: #333;
  margin-bottom: 0.5rem;
  margin-top: 0.25rem;
`;

const Subtitle = styled.p`
  font-size: 1rem;
  color: #666;
  margin-bottom: 2rem;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
`;

const InputWrapper = styled.div`
  position: relative;
  margin-bottom: 1rem;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.75rem 1rem 0.75rem 2.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
  &:focus {
    outline: none;
    border-color: #00b5ad;
  }
`;

const IconWrapper = styled.div`
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: #666;
`;

const LoginButton = styled.button`
  background-color: #00b5ad;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 0.75rem;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.3s;
  &:hover {
    background-color: #009c95;
  }
`;

export const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const [tryLogin, { loading: login_loading, error: login_error }] =
    useMutation<LoginOutputs, LoginInputs>(LOGIN_MUTATION, {
      onCompleted: (data) => {
        authToken(data.tokenAuth.token);
        userObj(data.tokenAuth.user);
        authStatusVar("AUTHENTICATED");
        navigate("/");
      },
    });

  if (login_error) {
    toast.error("ERROR!\nCould not log you in!");
  }

  const handleLoginClick = (e: React.FormEvent) => {
    e.preventDefault();
    tryLogin({ variables: { username, password } });
  };

  return (
    <PageWrapper>
      <LoginCard>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <Logo src={logo} alt="Open Contracts Logo" />
          <Title>Open Contracts</Title>
          <Subtitle>The Open Contract Analytics Platform</Subtitle>
        </div>
        <Form onSubmit={handleLoginClick}>
          <InputWrapper>
            <IconWrapper>
              <User size={18} />
            </IconWrapper>
            <Input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setUsername(e.target.value)
              }
            />
          </InputWrapper>
          <InputWrapper>
            <IconWrapper>
              <Lock size={18} />
            </IconWrapper>
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setPassword(e.target.value)
              }
            />
          </InputWrapper>
          <LoginButton type="submit" disabled={login_loading}>
            {login_loading ? "Logging in..." : "Login"}
          </LoginButton>
        </Form>
      </LoginCard>
    </PageWrapper>
  );
};

export default Login;
