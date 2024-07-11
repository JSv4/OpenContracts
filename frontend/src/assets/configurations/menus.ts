import { SemanticICONS } from "semantic-ui-react";

interface MenuItem {
  title: string;
  icon: SemanticICONS | null;
  route: string;
  protected: boolean;
  id: string;
}

export const header_menu_items: MenuItem[] = [
  {
    title: "Dashboard",
    icon: "home",
    route: "/",
    protected: false,
    id: "home_button",
  },
  {
    title: "Corpuses",
    icon: null,
    route: "/corpuses/",
    protected: false,
    id: "corpus_menu_button",
  },
  {
    title: "Documents",
    icon: null,
    route: "/documents/",
    protected: false,
    id: "document_menu_button",
  },
  {
    title: "Label Sets",
    icon: null,
    route: "/label_sets/",
    protected: false,
    id: "label_set_menu_button",
  },
  {
    title: "Annotations",
    icon: null,
    route: "/annotations/",
    protected: false,
    id: "annotation_menu_button",
  },
  {
    title: "Extracts",
    icon: null,
    route: "/extracts",
    protected: false,
    id: "extract_menu_button",
  },
];
