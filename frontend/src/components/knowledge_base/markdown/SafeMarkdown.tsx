import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const SafeMarkdown: React.FC<{ children: string }> = ({ children }) => {
  try {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    );
  } catch (error) {
    console.warn(
      "Failed to render with remarkGfm, falling back to basic markdown:",
      error
    );
    return <ReactMarkdown>{children}</ReactMarkdown>;
  }
};
