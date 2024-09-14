import React, { useState, useRef, useEffect } from "react";
import styled, { keyframes } from "styled-components";
import { Button, Icon, SemanticICONS, ButtonProps } from "semantic-ui-react";

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

const PulsingDot = styled.div`
  width: 12px;
  height: 12px;
  background-color: #00ff00;
  border-radius: 50%;
  animation: ${pulse} 2s infinite;
  cursor: pointer;
  position: relative;
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

interface CloudButtonProps extends ButtonProps {
  delay: number;
  angle: number;
  distance: number;
}

const moveOut = (props: CloudButtonProps) => keyframes`
  from {
    opacity: 0;
    transform: translate(0, 0);
  }
  to {
    opacity: 1;
    transform: translate(
      ${Math.cos(props.angle) * props.distance}px,
      ${Math.sin(props.angle) * props.distance}px
    );
  }
`;

const CloudButton = styled(Button)<CloudButtonProps>`
  position: absolute;
  opacity: 0;
  animation: ${moveOut} 0.5s forwards;
  animation-delay: ${(props) => props.delay}s;
`;

interface CloudButtonItem {
  name: SemanticICONS;
  color: string;
  tooltip: string;
  onClick: () => void;
}

const RadialButtonCloud: React.FC = () => {
  const [cloudVisible, setCloudVisible] = useState(false);
  const cloudRef = useRef<HTMLDivElement | null>(null);

  const buttonList: CloudButtonItem[] = [
    {
      name: "pencil",
      color: "blue",
      tooltip: "Edit Annotation",
      onClick: () => {
        console.log("Edit clicked");
      },
    },
    {
      name: "trash alternate outline",
      color: "red",
      tooltip: "Delete Annotation",
      onClick: () => {
        console.log("Delete clicked");
      },
    },
    // Add more buttons as needed
  ];

  const handleClickOutside = (event: MouseEvent) => {
    if (
      cloudRef.current &&
      !cloudRef.current.contains(event.target as Node) &&
      !(event.target as Element).closest(".pulsing-dot")
    ) {
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

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <PulsingDot
        className="pulsing-dot"
        onMouseEnter={() => setCloudVisible(true)}
      />
      {cloudVisible && (
        <CloudContainer ref={cloudRef}>
          {buttonList.map((btn, index) => {
            const angle = (index / buttonList.length) * 2 * Math.PI;
            return (
              <CloudButton
                key={index}
                color={btn.color as any}
                icon
                circular
                size="mini"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation();
                  btn.onClick();
                  setCloudVisible(false);
                }}
                title={btn.tooltip}
                delay={index * 0.1}
                angle={angle}
                distance={50}
              >
                <Icon name={btn.name} />
              </CloudButton>
            );
          })}
        </CloudContainer>
      )}
    </div>
  );
};

export default RadialButtonCloud;
