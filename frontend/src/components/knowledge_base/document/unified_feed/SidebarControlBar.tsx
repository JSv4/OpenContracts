import React, { useState, useRef, useEffect } from "react";
import styled from "styled-components";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  FileText,
  Filter,
  Check,
  ChevronDown,
  Search,
  SortDesc,
  Layers,
  ChartNetwork,
  Notebook,
  X,
  Eye,
  Tags,
} from "lucide-react";
import { Form, Dropdown } from "semantic-ui-react";
import {
  ContentFilters,
  SortOption,
  ContentItemType,
  SidebarViewMode,
} from "./types";
import { LabelDisplayBehavior } from "../../../../types/graphql-api";
import { ViewLabelSelector } from "../../../annotator/labels/view_labels_selector/ViewLabelSelector";
import { useAnnotationDisplay } from "../../../annotator/context/UISettingsAtom";

interface SidebarControlBarProps {
  /** Current view mode */
  viewMode: SidebarViewMode["mode"];
  /** Callback to change view mode */
  onViewModeChange: (mode: SidebarViewMode["mode"]) => void;
  /** Current filters (only used in feed mode) */
  filters: ContentFilters;
  /** Callback to update filters */
  onFiltersChange: (filters: ContentFilters) => void;
  /** Current sort option */
  sortBy: SortOption;
  /** Callback to update sort */
  onSortChange: (sort: SortOption) => void;
  /** Whether there's an active document search */
  hasActiveSearch?: boolean;
}

/* Styled Components */
const ControlBarContainer = styled.div`
  background: white;
  border-bottom: 1px solid #e2e8f0;
  padding: 1.25rem;
  position: relative;
  z-index: 20;
`;

const ViewToggle = styled.div`
  display: flex;
  gap: 0;
  background: #f8fafc;
  padding: 0.375rem;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  margin-bottom: 1.25rem;
`;

const ToggleButton = styled(motion.button)<{ $isActive: boolean }>`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  padding: 0.875rem 1.25rem;
  border: none;
  background: ${(props) => (props.$isActive ? "white" : "transparent")};
  color: ${(props) => (props.$isActive ? "#3b82f6" : "#64748b")};
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.9375rem;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: ${(props) =>
    props.$isActive ? "0 2px 8px rgba(59, 130, 246, 0.15)" : "none"};
  position: relative;

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover:not(:disabled) {
    color: ${(props) => (props.$isActive ? "#3b82f6" : "#475569")};
    background: ${(props) =>
      props.$isActive ? "white" : "rgba(0, 0, 0, 0.02)"};
  }

  &::after {
    content: "";
    position: absolute;
    bottom: -3px;
    left: 50%;
    transform: translateX(-50%) scaleX(${(props) => (props.$isActive ? 1 : 0)});
    width: 40%;
    height: 3px;
    background: #3b82f6;
    border-radius: 3px;
    transition: transform 0.3s ease;
  }
`;

const FilterSection = styled(motion.div)`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const FilterRow = styled.div`
  display: flex;
  gap: 0.75rem;
  align-items: stretch;

  > * {
    flex: 1;
  }
`;

const DropdownContainer = styled.div`
  position: relative;
`;

const MultiSelectDropdown = styled.div<{ $isOpen: boolean }>`
  position: relative;
  background: white;
  border: 1px solid ${(props) => (props.$isOpen ? "#3b82f6" : "#e2e8f0")};
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${(props) => (props.$isOpen ? "#3b82f6" : "#cbd5e1")};
  }
`;

const DropdownHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  gap: 0.75rem;
  min-height: 48px;
`;

const DropdownLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  font-size: 0.9375rem;
  color: #1e293b;
  font-weight: 500;

  svg {
    width: 18px;
    height: 18px;
    color: #64748b;
  }
`;

const SelectedCount = styled.span`
  background: #3b82f6;
  color: white;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  margin-left: 0.5rem;
`;

const ChevronIcon = styled(ChevronDown)<{ $isOpen: boolean }>`
  width: 18px;
  height: 18px;
  color: #64748b;
  transform: rotate(${(props) => (props.$isOpen ? 180 : 0)}deg);
  transition: transform 0.2s ease;
`;

const DropdownMenu = styled(motion.div)`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
  z-index: 50;
  overflow: hidden;
`;

const DropdownMenuItem = styled.div<{ $isSelected?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1rem;
  cursor: pointer;
  transition: all 0.15s ease;
  background: ${(props) => (props.$isSelected ? "#f0f9ff" : "transparent")};
  border-left: 3px solid
    ${(props) => (props.$isSelected ? "#3b82f6" : "transparent")};

  &:hover {
    background: ${(props) => (props.$isSelected ? "#e0f2fe" : "#f8fafc")};
  }

  &:not(:last-child) {
    border-bottom: 1px solid #f1f5f9;
  }
`;

const MenuItemLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.9375rem;
  color: #1e293b;
  font-weight: 500;

  svg {
    width: 18px;
    height: 18px;
  }
`;

const CheckIcon = styled(Check)`
  width: 18px;
  height: 18px;
  color: #3b82f6;
`;

const QuickActions = styled.div`
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid #f1f5f9;
  background: #fafbfc;
`;

const QuickActionButton = styled.button`
  flex: 1;
  background: white;
  border: 1px solid #e2e8f0;
  color: #64748b;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0.5rem 0.875rem;
  border-radius: 6px;
  transition: all 0.2s ease;

  &:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
    color: #475569;
  }

  &:active {
    transform: scale(0.98);
  }
`;

const SearchInputWrapper = styled.div`
  position: relative;
  flex: 1;
`;

const SearchIconWrapper = styled.div`
  position: absolute;
  left: 0.875rem;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  pointer-events: none;

  svg {
    width: 18px;
    height: 18px;
  }
`;

const StyledSearchInput = styled.input`
  width: 100%;
  padding: 0.75rem 1rem 0.75rem 2.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.9375rem;
  color: #1e293b;
  background: white;
  transition: all 0.2s ease;
  min-height: 48px;

  &::placeholder {
    color: #94a3b8;
  }

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

const SortDropdownStyled = styled(Dropdown)`
  &&& {
    font-size: 0.9375rem;
    min-width: 100%;
    min-height: 48px;

    &.ui.dropdown {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 0.75rem 1rem;
      background: white;
      font-weight: 500;
      color: #1e293b;

      &:hover {
        border-color: #cbd5e1;
      }

      &:focus {
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }
    }

    .menu {
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
      margin-top: 4px;
    }

    .item {
      font-size: 0.9375rem;
      padding: 0.875rem 1rem !important;
      font-weight: 500;

      &:hover {
        background: #f8fafc !important;
      }
    }
  }
`;

const contentTypeIcons: Record<ContentItemType, React.ReactNode> = {
  note: <Notebook />,
  annotation: <FileText />,
  relationship: <ChartNetwork />,
  search: <Search />,
};

const contentTypeLabels: Record<ContentItemType, string> = {
  note: "Notes",
  annotation: "Annotations",
  relationship: "Relationships",
  search: "Search Results",
};

const contentTypeColors: Record<ContentItemType, string> = {
  note: "#f59e0b",
  annotation: "#3b82f6",
  relationship: "#8b5cf6",
  search: "#10b981",
};

const AnnotationFilters = styled(motion.div)`
  padding: 1rem;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  margin-top: 0.75rem;
`;

const FilterHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #64748b;

  svg {
    width: 16px;
    height: 16px;
  }
`;

const LabelDisplayDropdown = styled(Dropdown)`
  &&& {
    font-size: 0.875rem;
    min-width: 100%;

    &.ui.dropdown {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 0.625rem 0.875rem;
      background: white;
      font-weight: 500;
      color: #1e293b;

      &:hover {
        border-color: #cbd5e1;
      }
    }

    .menu {
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }

    .item {
      font-size: 0.875rem;
      padding: 0.625rem 0.875rem !important;
    }
  }
`;

const LabelSelectorWrapper = styled.div`
  margin-top: 0.75rem;

  /* Override ViewLabelSelector styles for better integration */
  .ui.multiple.dropdown {
    font-size: 0.875rem !important;
    min-height: 40px !important;

    > .label {
      font-size: 0.75rem !important;
      padding: 0.375rem 0.5rem !important;
    }
  }
`;

/**
 * SidebarControlBar provides controls for switching between chat/feed views
 * and filtering content in the unified feed.
 */
export const SidebarControlBar: React.FC<SidebarControlBarProps> = ({
  viewMode,
  onViewModeChange,
  filters,
  onFiltersChange,
  sortBy,
  onSortChange,
  hasActiveSearch = false,
}) => {
  const [searchQuery, setSearchQuery] = useState(filters.searchQuery || "");
  const [showContentDropdown, setShowContentDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Annotation display settings
  const { showLabels, setShowLabels } = useAnnotationDisplay();
  const [localLabelBehavior, setLocalLabelBehavior] = useState(showLabels);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowContentDropdown(false);
      }
    };

    if (showContentDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showContentDropdown]);

  const handleContentTypeToggle = (type: ContentItemType) => {
    const newTypes = new Set(filters.contentTypes);
    if (newTypes.has(type)) {
      newTypes.delete(type);
    } else {
      newTypes.add(type);
    }
    onFiltersChange({ ...filters, contentTypes: newTypes });
  };

  const handleSelectAll = () => {
    const allTypes: ContentItemType[] = ["note", "annotation", "relationship"];
    if (hasActiveSearch) allTypes.push("search");
    onFiltersChange({ ...filters, contentTypes: new Set(allTypes) });
  };

  const handleClearAll = () => {
    onFiltersChange({ ...filters, contentTypes: new Set() });
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    // Debounced update to filters
    const timeoutId = setTimeout(() => {
      onFiltersChange({ ...filters, searchQuery: value || undefined });
    }, 300);
    return () => clearTimeout(timeoutId);
  };

  const sortOptions = [
    {
      key: "page",
      text: "Page Number",
      value: "page",
      icon: "sort numeric down",
    },
    { key: "type", text: "Content Type", value: "type", icon: "layer group" },
    { key: "date", text: "Date Created", value: "date", icon: "calendar" },
  ];

  const availableContentTypes: ContentItemType[] = [
    "note",
    "annotation",
    "relationship",
  ];
  if (hasActiveSearch) availableContentTypes.push("search");

  const selectedCount = filters.contentTypes.size;

  const handleLabelBehaviorChange = (value: LabelDisplayBehavior) => {
    setLocalLabelBehavior(value);
    setShowLabels(value);
  };

  const labelDisplayOptions = [
    {
      key: LabelDisplayBehavior.ALWAYS,
      text: "Always Show Labels",
      value: LabelDisplayBehavior.ALWAYS,
      icon: "eye",
    },
    {
      key: LabelDisplayBehavior.ON_HOVER,
      text: "Show on Hover",
      value: LabelDisplayBehavior.ON_HOVER,
      icon: "eye slash",
    },
    {
      key: LabelDisplayBehavior.HIDE,
      text: "Hide Labels",
      value: LabelDisplayBehavior.HIDE,
      icon: "eye slash outline",
    },
  ];

  // Check if annotations are selected
  const showAnnotationFilters =
    viewMode === "feed" && filters.contentTypes.has("annotation");

  return (
    <ControlBarContainer>
      {/* View Mode Toggle */}
      <ViewToggle>
        <ToggleButton
          data-testid="view-mode-chat"
          $isActive={viewMode === "chat"}
          onClick={() => onViewModeChange("chat")}
          whileTap={{ scale: 0.98 }}
        >
          <MessageSquare />
          Chat
        </ToggleButton>
        <ToggleButton
          data-testid="view-mode-feed"
          $isActive={viewMode === "feed"}
          onClick={() => onViewModeChange("feed")}
          whileTap={{ scale: 0.98 }}
        >
          <Layers />
          Content Feed
        </ToggleButton>
      </ViewToggle>

      {/* Feed Filters (only shown in feed mode) */}
      <AnimatePresence>
        {viewMode === "feed" && (
          <FilterSection
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Search Input */}
            <SearchInputWrapper>
              <SearchIconWrapper>
                <Search />
              </SearchIconWrapper>
              <StyledSearchInput
                placeholder="Search in content..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </SearchInputWrapper>

            {/* Content Types and Sort Row */}
            <FilterRow>
              {/* Content Type Multi-Select */}
              <DropdownContainer ref={dropdownRef}>
                <MultiSelectDropdown
                  $isOpen={showContentDropdown}
                  onClick={() => setShowContentDropdown(!showContentDropdown)}
                >
                  <DropdownHeader>
                    <DropdownLabel>
                      <Filter />
                      Content Types
                      {selectedCount > 0 && (
                        <SelectedCount>{selectedCount}</SelectedCount>
                      )}
                    </DropdownLabel>
                    <ChevronIcon $isOpen={showContentDropdown} />
                  </DropdownHeader>
                </MultiSelectDropdown>

                <AnimatePresence>
                  {showContentDropdown && (
                    <DropdownMenu
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.15 }}
                    >
                      {availableContentTypes.map((type) => (
                        <DropdownMenuItem
                          key={type}
                          $isSelected={filters.contentTypes.has(type)}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleContentTypeToggle(type);
                          }}
                        >
                          <MenuItemLabel
                            style={{ color: contentTypeColors[type] }}
                          >
                            {contentTypeIcons[type]}
                            {contentTypeLabels[type]}
                          </MenuItemLabel>
                          {filters.contentTypes.has(type) && <CheckIcon />}
                        </DropdownMenuItem>
                      ))}
                      <QuickActions>
                        <QuickActionButton
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectAll();
                          }}
                        >
                          Select All
                        </QuickActionButton>
                        <QuickActionButton
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClearAll();
                          }}
                        >
                          Clear All
                        </QuickActionButton>
                      </QuickActions>
                    </DropdownMenu>
                  )}
                </AnimatePresence>
              </DropdownContainer>

              {/* Sort Dropdown */}
              <SortDropdownStyled
                fluid
                selection
                icon={<SortDesc size={18} style={{ color: "#64748b" }} />}
                options={sortOptions}
                value={sortBy}
                onChange={(_: any, data: any) =>
                  onSortChange(data.value as SortOption)
                }
                placeholder="Sort by..."
              />
            </FilterRow>

            {/* Annotation-specific Filters */}
            <AnimatePresence>
              {showAnnotationFilters && (
                <AnnotationFilters
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: "auto", marginTop: "0.75rem" }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <FilterHeader>
                    <FileText />
                    Annotation Filters
                  </FilterHeader>

                  {/* Label Display Behavior */}
                  <LabelDisplayDropdown
                    fluid
                    selection
                    icon={<Eye size={16} style={{ color: "#64748b" }} />}
                    options={labelDisplayOptions}
                    value={localLabelBehavior}
                    onChange={(_: any, data: any) =>
                      handleLabelBehaviorChange(
                        data.value as LabelDisplayBehavior
                      )
                    }
                    placeholder="Label display..."
                  />

                  {/* Label Filter */}
                  <LabelSelectorWrapper>
                    <FilterHeader
                      style={{ marginBottom: "0.5rem", marginTop: "0.75rem" }}
                    >
                      <Tags />
                      Filter by Labels
                    </FilterHeader>
                    <ViewLabelSelector />
                  </LabelSelectorWrapper>
                </AnnotationFilters>
              )}
            </AnimatePresence>
          </FilterSection>
        )}
      </AnimatePresence>
    </ControlBarContainer>
  );
};
