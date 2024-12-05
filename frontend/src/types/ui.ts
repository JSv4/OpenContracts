import { TokenId } from "../components/types";

export interface MenuItemProps {
  key: string;
  content: string;
  icon: string;
  onClick: () => void;
}
// "../../build/webpack/pdf.worker.min.js';";
export interface TextSearchResultsProps {
  start: TokenId;
  end: TokenId;
}
export interface PageTokenMapProps {
  string_index_token_map: Record<number, TokenId>;
  page_text: string;
}

export interface PageTokenMapBuilderProps {
  end_text_index: number;
  token_map: PageTokenMapProps;
}
