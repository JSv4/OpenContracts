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
  border-radius: 8px;
  border: none;
  background: ${(props) => (props.$isActive ? "#EBF8FF" : "#F7FAFC")};
  color: ${(props) => (props.$isActive ? "#3182CE" : "#4A5568")};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${(props) => (props.$isActive ? "#BEE3F8" : "#EDF2F7")};
  }

  svg {
    width: 18px;
    height: 18px;
    stroke-width: 2;
  }
`;

export const ExpandingInput = styled(motion.div)`
  position: relative;
  overflow: hidden;

  input {
    width: 250px;
    padding: 0.5rem 1rem;
    border: 2px solid #e2e8f0;
    border-radius: 8px;
    font-size: 0.875rem;
    background: #f7fafc;
    transition: all 0.2s ease;

    &:focus {
      outline: none;
      border-color: #4299e1;
      background: white;
      box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.15);
    }

    &::placeholder {
      color: #a0aec0;
    }
  }
`;

export const DatePickerExpanded = styled(motion.div)`
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 0.5rem;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05);
  padding: 1rem;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 1rem;

  .date-inputs {
    display: flex;
    gap: 1rem;

    input {
      padding: 0.5rem;
      border: 2px solid #e2e8f0;
      border-radius: 6px;
      font-size: 0.875rem;

      &:focus {
        outline: none;
        border-color: #4299e1;
      }
    }
  }

  .date-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;

    button {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      border: none;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s ease;

      &.cancel {
        background: #edf2f7;
        color: #4a5568;

        &:hover {
          background: #e2e8f0;
        }
      }

      &.apply {
        background: #4299e1;
        color: white;

        &:hover {
          background: #3182ce;
        }
      }
    }
  }
`;
