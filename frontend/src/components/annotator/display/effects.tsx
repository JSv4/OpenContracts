import { keyframes } from "styled-components";

export const pulseGreen = keyframes`
  0% {
    box-shadow: 0 -2px 4px rgba(0, 128, 0, 0.4);
  }
  70% {
    box-shadow: 0 -2px 10px rgba(0, 128, 0, 0);
  }
  100% {
    box-shadow: 0 -2px 4px rgba(0, 128, 0, 0);
  }
`;

export const pulseMaroon = keyframes`
  0% {
    box-shadow: 0 -2px 4px rgba(128, 0, 0, 0.4);
  }
  70% {
    box-shadow: 0 -2px 10px rgba(128, 0, 0, 0);
  }
  100% {
    box-shadow: 0 -2px 4px rgba(128, 0, 0, 0);
  }
`;
