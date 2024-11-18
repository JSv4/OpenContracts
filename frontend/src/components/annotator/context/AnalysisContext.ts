import { createContext, useContext } from "react";
import {
  AnalysisType,
  ExtractType,
  DatacellType,
  ColumnType,
} from "../../../types/graphql-api";

interface AnalysisContextType {
  analyses: AnalysisType[];
  extracts: ExtractType[];
  datacells: DatacellType[];
  columns: ColumnType[];
  selectedAnalysis: AnalysisType | null | undefined;
  selectedExtract: ExtractType | null | undefined;
  onSelectAnalysis: (analysis: AnalysisType | null) => void;
  onSelectExtract: (extract: ExtractType | null) => void;
}

export const AnalysisContext = createContext<AnalysisContextType | null>(null);

export const useAnalysisContext = () => {
  const context = useContext(AnalysisContext);
  if (!context) {
    throw new Error(
      "useAnalysisContext must be used within an AnalysisProvider"
    );
  }
  return context;
};
