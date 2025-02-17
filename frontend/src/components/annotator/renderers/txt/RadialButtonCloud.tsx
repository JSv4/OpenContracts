// src/RadialButtonCloud.tsx
import React, { useState, useRef, useEffect } from "react";
import styled, { createGlobalStyle, css, keyframes } from "styled-components";
import { Button, SemanticICONS, Modal } from "semantic-ui-react";
import { getLuminance } from "polished";

// Calculate dot color with good contrast
const getContrastColor = (bgColor: string): string => {
  // If it looks like a hex color without the #, add it
  if (/^[A-Fa-f0-9]{3,6}$/.test(bgColor)) {
    bgColor = "#" + bgColor;
  }

  try {
    const luminance = getLuminance(bgColor);
    return luminance > 0.5 ? "#000" : "#fff";
  } catch (error) {
    console.warn(`Invalid color format: ${bgColor}, using fallback`);
    return "#000"; // fallback to black
  }
};

const pulse = keyframes`
  0% {
    box-shadow: 0 0 0 0 rgba(0, 255, 0, 0.7);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(0, 255, 0, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(0, 255, 0, 0);
  }
`;

interface PulsingDotProps {
  backgroundColor: string;
}

const PulsingDot = styled.div<PulsingDotProps>`
  width: 12px;
  height: 12px;
  background-color: ${(props) => props.backgroundColor};
  border-radius: 50%;
  animation: ${pulse} 2s infinite;
  cursor: pointer;
  position: absolute;
  top: -6px;
  right: -6px;
`;

const CloudContainer = styled.div`
  position: absolute;
  top: -60px;
  left: -60px;
  width: 120px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
`;

interface ButtonPosition {
  x: number;
  y: number;
}

function calculateButtonPositions(
  n: number,
  a: number,
  spacingAlong: number,
  skipCount: number = 2
): ButtonPosition[] {
  const positions: ButtonPosition[] = [];
  let t = 0;

  for (let i = 0; i < n + skipCount; i++) {
    const r = a * t;
    positions.push({
      x: r * Math.cos(t),
      y: r * Math.sin(t),
    });

    const currentArcLength = (a / 2) * (t * t);
    const nextArcLength = currentArcLength + spacingAlong;
    t = Math.sqrt((2 * nextArcLength) / a);
  }

  return positions.slice(skipCount);
}

interface CloudButtonProps {
  delay: number;
  position: ButtonPosition;
  backgroundColor: string;
}

const moveOut = keyframes`
  from {
    opacity: 0;
    transform: translate(0, 0);
  }
  to {
    opacity: 1;
    transform: translate(var(--x), var(--y));
  }
`;

const CloudButton = styled(Button).attrs<CloudButtonProps>((props) => ({
  style: {
    position: "absolute",
    opacity: 0,
    "--x": `${props.position.x}px`,
    "--y": `${props.position.y}px`,
    backgroundColor: props.backgroundColor,
    color: getContrastColor(props.backgroundColor),
  },
}))<CloudButtonProps>`
  ${(props) => css`
    animation: ${moveOut} 0.5s forwards;
    animation-delay: ${props.delay}s;
  `}
`;

const GlobalStyle = createGlobalStyle`
  .confirm-modal-container.ui.page.modals.dimmer.transition.visible.active {
    z-index: 20000 !important;
  }

  #ConfirmModal {
    z-index: 20001 !important;
  }
`;

export interface CloudButtonItem {
  name: SemanticICONS;
  color: string;
  tooltip: string;
  protected_message?: string | null;
  onClick: () => void;
}

interface RadialButtonCloudProps {
  parentBackgroundColor: string;
  actions: CloudButtonItem[];
}

const RadialButtonCloud: React.FC<RadialButtonCloudProps> = ({
  parentBackgroundColor,
  actions: buttonList,
}) => {
  const [cloudVisible, setCloudVisible] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    message: string;
    onConfirm: () => void;
  }>({ open: false, message: "", onConfirm: () => {} });

  const cloudRef = useRef<HTMLDivElement | null>(null);

  const handleClickOutside = (event: MouseEvent) => {
    if (
      cloudRef.current &&
      !cloudRef.current.contains(event.target as Node) &&
      !(event.target as Element).closest(".pulsing-dot")
    ) {
      setCloudVisible(false);
    }
  };

  const handleButtonClick = (btn: CloudButtonItem) => {
    if (btn.protected_message) {
      setConfirmModal({
        open: true,
        message: btn.protected_message,
        onConfirm: () => {
          btn.onClick();
          setCloudVisible(false);
        },
      });
    } else {
      btn.onClick();
      setCloudVisible(false);
    }
  };

  useEffect(() => {
    if (cloudVisible) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [cloudVisible]);

  const numButtons = buttonList.length;
  const a = 6;
  const spacingAlong = 50;
  const skipCount = 2;

  const buttonPositions = calculateButtonPositions(
    numButtons,
    a,
    spacingAlong,
    skipCount
  );

  const dotColor = getContrastColor(parentBackgroundColor);

  const pastelColors = ["#AEC6CF", "#FFB347", "#77DD77", "#CFCFC4", "#F49AC2"];

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <PulsingDot
        className="pulsing-dot"
        onMouseEnter={() => setCloudVisible(true)}
        backgroundColor={dotColor}
      />
      <GlobalStyle />
      {cloudVisible && (
        <CloudContainer ref={cloudRef}>
          {buttonList.map((btn, index) => (
            <CloudButton
              key={index}
              icon={btn.name}
              circular
              size="mini"
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.stopPropagation();
                handleButtonClick(btn);
              }}
              title={btn.tooltip}
              delay={index * 0.1}
              position={buttonPositions[index]}
              backgroundColor={pastelColors[index % pastelColors.length]}
            />
          ))}
        </CloudContainer>
      )}
      <Modal
        id="ConfirmModal"
        size="mini"
        className="confirm-modal-container"
        open={confirmModal.open}
        onClose={() => setConfirmModal({ ...confirmModal, open: false })}
      >
        <Modal.Content>
          <p>{confirmModal.message}</p>
        </Modal.Content>
        <Modal.Actions>
          <Button
            negative
            onClick={() => {
              setConfirmModal({ ...confirmModal, open: false });
              setCloudVisible(false);
            }}
          >
            No
          </Button>
          <Button
            positive
            onClick={() => {
              confirmModal.onConfirm();
              setConfirmModal({ ...confirmModal, open: false });
            }}
          >
            Yes
          </Button>
        </Modal.Actions>
      </Modal>
    </div>
  );
};

export default RadialButtonCloud;
