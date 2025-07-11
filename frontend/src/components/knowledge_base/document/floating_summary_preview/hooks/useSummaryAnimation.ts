import { useSpring } from "framer-motion";
import { useState, useCallback } from "react";

export interface AnimationState {
  isExpanded: boolean;
  isStackFanned: boolean;
  isHovered: boolean;
  selectedCardIndex: number | null;
}

export interface UseSummaryAnimationResult {
  state: AnimationState;
  setExpanded: (expanded: boolean) => void;
  setStackFanned: (fanned: boolean) => void;
  setHovered: (hovered: boolean) => void;
  selectCard: (index: number | null) => void;
  springConfig: any;
  expandAnimation: any;
  fanAnimation: any;
}

const springConfig = {
  type: "spring",
  stiffness: 400,
  damping: 30,
};

export const useSummaryAnimation = (): UseSummaryAnimationResult => {
  const [state, setState] = useState<AnimationState>({
    isExpanded: false,
    isStackFanned: false,
    isHovered: false,
    selectedCardIndex: null,
  });

  const setExpanded = useCallback((expanded: boolean) => {
    setState((prev) => ({ ...prev, isExpanded: expanded }));
  }, []);

  const setStackFanned = useCallback((fanned: boolean) => {
    setState((prev) => ({ ...prev, isStackFanned: fanned }));
  }, []);

  const setHovered = useCallback((hovered: boolean) => {
    setState((prev) => ({ ...prev, isHovered: hovered }));
  }, []);

  const selectCard = useCallback((index: number | null) => {
    setState((prev) => ({ ...prev, selectedCardIndex: index }));
  }, []);

  // Animation values for smooth transitions
  const expandAnimation = useSpring(state.isExpanded ? 1 : 0, springConfig);
  const fanAnimation = useSpring(state.isStackFanned ? 1 : 0, springConfig);

  return {
    state,
    setExpanded,
    setStackFanned,
    setHovered,
    selectCard,
    springConfig,
    expandAnimation,
    fanAnimation,
  };
};
