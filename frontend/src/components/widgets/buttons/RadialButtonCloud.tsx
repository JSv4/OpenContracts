import React, { useState, useRef, useEffect } from "react";
import styled, { keyframes, css } from "styled-components";
import { Button, Icon, SemanticICONS, ButtonProps } from "semantic-ui-react";
import { getLuminance, getContrast } from "polished";
import useWindowDimensions from "../../hooks/WindowDimensionHook";
import { MOBILE_VIEW_BREAKPOINT } from "../../../assets/configurations/constants";

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

    // Calculate the next t value based on the desired arc length
    // The arc length of a spiral from 0 to t is approximately (a/2) * (t^2)
    // So, we solve for the next t that gives us an additional arc length of 'spacingAlong'
    const currentArcLength = (a / 2) * (t * t);
    const nextArcLength = currentArcLength + spacingAlong;
    t = Math.sqrt((2 * nextArcLength) / a);
  }

  // Return only the positions after skipping the specified number
  return positions.slice(skipCount);
}

interface CloudButtonProps extends ButtonProps {
  delay: number;
  position: ButtonPosition;
}

const moveOut = (props: CloudButtonProps) => keyframes`
    from {
      opacity: 0;
      transform: translate(0, 0);
    }
    to {
      opacity: 1;
      transform: translate(
        ${props.position.x}px,
        ${props.position.y}px
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

interface RadialButtonCloudProps {
  parentBackgroundColor: string;
}

const RadialButtonCloud: React.FC<RadialButtonCloudProps> = ({
  parentBackgroundColor,
}) => {
  const [cloudVisible, setCloudVisible] = useState(false);
  const { height, width } = useWindowDimensions();
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

  const numButtons = buttonList.length;
  const a = 6; // Controls the growth rate of the spiral
  const spacingAlongPercent = width <= MOBILE_VIEW_BREAKPOINT ? 8 : 3; // 5% of the container height
  const spacingAlong = (height * spacingAlongPercent) / 100;
  const skipCount = 2; // Number of inner positions to skip

  // Calculate button positions
  const buttonPositions = calculateButtonPositions(
    numButtons,
    a,
    spacingAlong,
    skipCount
  );

  // Calculate dot color with good contrast
  const getContrastColor = (bgColor: string) => {
    const luminance = getLuminance(bgColor);
    return luminance > 0.5 ? "#00aa00" : "#00ff00";
  };

  const dotColor = getContrastColor(parentBackgroundColor);

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <PulsingDot
        className="pulsing-dot"
        onMouseEnter={() => setCloudVisible(true)}
        backgroundColor={dotColor}
      />
      {cloudVisible && (
        <CloudContainer ref={cloudRef}>
          {buttonList.map((btn, index) => (
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
              position={buttonPositions[index]}
            >
              <Icon name={btn.name} />
            </CloudButton>
          ))}
        </CloudContainer>
      )}
    </div>
  );
};

export default RadialButtonCloud;
