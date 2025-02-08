import { motion } from "framer-motion";
import styled from "styled-components";

// Add this styled component with your other styled components
export const FilterContainer = styled.div`
  position: sticky;
  top: 0;
  z-index: 10;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  justify-content: flex-end;
  width: 100%;
`;

export const IconButton = styled(motion.button)<{ $isActive?: boolean }>`
  width: 36px;
  height: 36px;
  border-radius: 18px;
  border: 1px solid
    ${(props) => (props.$isActive ? "#4299E1" : "rgba(0, 0, 0, 0.08)")};
  background: ${(props) =>
    props.$isActive ? "#EBF8FF" : "rgba(255, 255, 255, 0.8)"};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: ${(props) => (props.$isActive ? "#2B6CB0" : "#4A5568")};
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;

  &:hover {
    background: ${(props) => (props.$isActive ? "#E6F6FF" : "white")};
    border-color: ${(props) =>
      props.$isActive ? "#63B3ED" : "rgba(66, 153, 225, 0.5)"};
    transform: translateY(-1px);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }

  svg {
    width: 16px;
    height: 16px;
    opacity: ${(props) => (props.$isActive ? 1 : 0.7)};
    transition: opacity 0.2s ease;
  }

  &:hover svg {
    opacity: 1;
  }

  /* Active filter indicator */
  ${(props) =>
    props.$isActive &&
    `
    &::after {
      content: '';
      position: absolute;
      width: 8px;
      height: 8px;
      border-radius: 4px;
      background: #4299E1;
      top: -2px;
      right: -2px;
      border: 2px solid white;
    }
  `}
`;

export const ExpandingInput = styled(motion.div)`
  position: relative;

  input {
    width: 0;
    padding: 0;
    border: none;
    height: 36px;
    background: transparent;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

    &.expanded {
      width: 200px;
      padding: 0 1rem;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.8);

      &:focus {
        border-color: rgba(66, 153, 225, 0.5);
        box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.25);
      }
    }
  }
`;

export const DatePickerExpanded = styled(motion.div)`
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.5rem;
  padding: 1rem;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  z-index: 20;

  input[type="date"] {
    height: 36px;
    padding: 0 1rem;
    border-radius: 18px;
    border: 1px solid rgba(0, 0, 0, 0.08);
    font-size: 0.95rem;

    &:focus {
      border-color: rgba(66, 153, 225, 0.5);
      outline: none;
    }
  }
`;
