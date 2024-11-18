import React from "react";

interface SelectionStoreContextType {
  selectedAnnotations: string[];
  setSelectedAnnotations: React.Dispatch<React.SetStateAction<string[]>>;
}

export const SelectionStoreContext =
  React.createContext<SelectionStoreContextType>({
    selectedAnnotations: [],
    setSelectedAnnotations: () => {},
  });
