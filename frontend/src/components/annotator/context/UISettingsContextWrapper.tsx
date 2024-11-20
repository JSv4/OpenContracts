import React from "react";
import { UISettingsProvider } from "./UISettingsContext";

interface UISettingsContextWrapperProps {
  children: React.ReactNode;
  sidebarVisible?: boolean;
  onSidebarToggle?: () => void;
  initialWidth?: number;
}

/**
 * Wrapper component for UISettingsContext that manages UI settings state
 */
export const UISettingsContextWrapper = ({
  children,
  sidebarVisible,
  onSidebarToggle,
  initialWidth,
}: UISettingsContextWrapperProps) => {
  return (
    <UISettingsProvider
      sidebarVisible={sidebarVisible}
      onSidebarToggle={onSidebarToggle}
      initialWidth={initialWidth}
    >
      {children}
    </UISettingsProvider>
  );
};
