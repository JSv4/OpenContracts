import React, { useState, useEffect } from "react";
import { useQuery } from "@apollo/client";
import { Card } from "semantic-ui-react";
import {
  MessageSquare,
  FileText,
  Edit2,
  Download,
  History,
  Notebook,
  Database,
  FileType,
  User,
  Calendar,
  Send,
  Eye,
  Network,
} from "lucide-react";
import {
  GET_DOCUMENTS,
  GET_CONVERSATION,
  GET_DOCUMENT_ANNOTATIONS_AND_RELATIONSHIPS,
} from "../../../graphql/queries";
import { JSX } from "react/jsx-runtime";

interface ChatMessageProps {
  user: string;
  content: string;
  timestamp: string;
  isAssistant: boolean;
  sources?: Array<{
    text: string;
    onClick?: () => void;
  }>;
}

const ChatMessage: React.FC<ChatMessageProps> = ({
  user,
  content,
  timestamp,
  isAssistant,
  sources = [],
}) => (
  <div
    className={`flex gap-3 ${isAssistant ? "flex-row" : "flex-row-reverse"}`}
  >
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center 
      ${
        isAssistant ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-600"
      }`}
    >
      {isAssistant ? "A" : user[0].toUpperCase()}
    </div>
    <div className="flex-1">
      <div
        className={`p-3 rounded-lg ${
          isAssistant ? "bg-blue-50" : "bg-gray-50"
        }`}
      >
        <div className="text-sm">{content}</div>
        {sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {sources.map((source, idx) => (
              <button
                key={idx}
                onClick={() => source.onClick?.()}
                className="px-2 py-1 text-xs rounded-full bg-white text-blue-600 hover:bg-blue-50 border border-blue-200"
              >
                [{idx + 1}] {source.text}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="text-xs text-gray-400 mt-1">{timestamp}</div>
    </div>
  </div>
);

interface DocumentKnowledgeBaseProps {
  documentId: string;
  corpusId: string;
  onClose?: () => void;
}

const DocumentKnowledgeBase: React.FC<DocumentKnowledgeBaseProps> = ({
  documentId,
  corpusId,
  onClose,
}) => {
  const [showGraph, setShowGraph] = useState(false);
  const [activeTab, setActiveTab] = useState("chat");
  const [newMessage, setNewMessage] = useState("");

  // Fetch document metadata
  const { data: documentData } = useQuery(GET_DOCUMENTS, {
    variables: {
      hasLabelWithId: documentId,
      annotateDocLabels: true,
      includeMetadata: true,
    },
  });

  // Fetch conversation
  const { data: conversationData } = useQuery(GET_CONVERSATION, {
    variables: {
      documentId,
      corpusId,
    },
  });

  // Fetch annotations and relationships
  const { data: annotationsData } = useQuery(
    GET_DOCUMENT_ANNOTATIONS_AND_RELATIONSHIPS,
    {
      variables: {
        documentId,
        corpusId,
      },
    }
  );

  // For now, using dummy data for features not yet supported by our GraphQL API
  const dummyNotes = [
    {
      id: 1,
      content:
        "## Key Metrics\nRevenue growth exceeded expectations at 15% YoY. Customer acquisition cost decreased by 22%.",
      author: "Sarah Chen",
      created: "2024-01-15 14:30",
    },
    {
      id: 2,
      content:
        "## Market Analysis\nCompetitor analysis shows opportunity in enterprise segment. Consider shifting focus Q3.",
      author: "Marcus Kim",
      created: "2024-01-16 09:15",
    },
  ];

  const dummyRelatedDocs = [
    {
      id: 1,
      title: "Q4 Financial Report",
      type: "PDF",
      connection: "referenced-by",
    },
    {
      id: 2,
      title: "Market Analysis 2024",
      type: "DOCX",
      connection: "references",
    },
    { id: 3, title: "Strategic Plan", type: "PDF", connection: "related" },
  ];

  const metadata = documentData?.documents?.edges[0]?.node || {
    title: "Loading...",
    fileType: "",
    creator: { email: "" },
    created: new Date().toISOString(),
  };

  const chat =
    conversationData?.conversation?.chatMessages?.edges?.map(
      ({ node }: any) => ({
        user: node.creator.email,
        content: node.content,
        timestamp: new Date(node.createdAt).toLocaleString(),
        isAssistant: node.msgType === "ASSISTANT",
        sources:
          node.sourceAnnotations?.edges?.map(({ node: annotation }: any) => ({
            text: annotation.rawText,
            onClick: () => console.log("Navigate to annotation", annotation.id),
          })) || [],
      })
    ) || [];

  const Tab = ({
    icon: Icon,
    label,
    id,
  }: {
    icon: any;
    label: string;
    id: string;
  }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center space-x-2 w-full p-3 ${
        activeTab === id
          ? "bg-blue-50 text-blue-600 border-r-2 border-blue-600"
          : "text-gray-600 hover:bg-gray-50"
      }`}
    >
      <Icon size={18} />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white w-full h-full max-w-7xl max-h-[90vh] flex flex-col rounded-lg overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold">{metadata.title}</h2>
              <div className="flex items-center space-x-4 mt-1 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <FileType size={16} /> {metadata.fileType}
                </span>
                <span className="flex items-center gap-1">
                  <User size={16} /> {metadata.creator?.email}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar size={16} /> Created:{" "}
                  {new Date(metadata.created).toLocaleDateString()}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowGraph(true)}
                className="p-2 text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-100"
              >
                <Network size={18} />
              </button>
              <button className="p-2 text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-100">
                <Eye size={18} />
              </button>
              <button className="p-2 text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-100">
                <Edit2 size={18} />
              </button>
              <button className="p-2 text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-100">
                <Download size={18} />
              </button>
              <button className="p-2 text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-100">
                <History size={18} />
              </button>
              {onClose && (
                <button
                  onClick={onClose}
                  className="p-2 text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-100"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Tabs */}
          <div className="w-48 border-r bg-gray-50 flex flex-col">
            <Tab icon={MessageSquare} label="Chat" id="chat" />
            <Tab icon={FileText} label="Summary" id="summary" />
            <Tab icon={Notebook} label="Notes" id="notes" />
            <Tab icon={Database} label="Metadata" id="metadata" />
          </div>

          {/* Center Content */}
          <div className="flex-1 overflow-y-auto p-4">
            <Card fluid>
              <Card.Content>
                <div className="prose max-w-none">
                  {annotationsData?.document?.allAnnotations?.map(
                    (annotation: any) => (
                      <div key={annotation.id} className="mb-4">
                        <div className="text-sm text-gray-500">
                          {annotation.annotationLabel.text}
                        </div>
                        <div>{annotation.rawText}</div>
                      </div>
                    )
                  )}
                </div>
              </Card.Content>
            </Card>
          </div>

          {/* Right Panel Content */}
          <div className="w-96 border-l flex flex-col">
            {activeTab === "chat" && (
              <>
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="space-y-6">
                    {chat.map(
                      (
                        msg: JSX.IntrinsicAttributes & ChatMessageProps,
                        idx: React.Key | null | undefined
                      ) => (
                        <ChatMessage key={idx} {...msg} />
                      )
                    )}
                  </div>
                </div>
                <div className="p-4 border-t">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Type a message..."
                    />
                    <button
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                      onClick={() => setNewMessage("")}
                    >
                      <Send size={20} />
                    </button>
                  </div>
                </div>
              </>
            )}

            {activeTab === "summary" && (
              <div className="p-4 prose max-w-none">
                {/* TODO: Implement summary view once we have the API */}
                <h2>Summary</h2>
                <p>Summary functionality coming soon...</p>
              </div>
            )}

            {activeTab === "notes" && (
              <div className="p-4 space-y-4 overflow-y-auto">
                {dummyNotes.map((note) => (
                  <Card key={note.id} fluid>
                    <Card.Content>
                      <div className="flex justify-between items-start mb-3">
                        <div className="text-sm text-gray-500">
                          <span className="font-medium text-gray-700">
                            {note.author}
                          </span>
                          <div>{new Date(note.created).toLocaleString()}</div>
                        </div>
                      </div>
                      <div className="prose max-w-none">{note.content}</div>
                    </Card.Content>
                  </Card>
                ))}
              </div>
            )}

            {activeTab === "metadata" && (
              <div className="p-4 space-y-6">
                <div>
                  <h3 className="font-medium mb-2">Document Details</h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-gray-500">File Type:</span>
                      <p>{metadata.fileType}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Uploader:</span>
                      <p>{metadata.creator?.email}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Created:</span>
                      <p>{new Date(metadata.created).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Graph Overlay */}
      {showGraph && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full m-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Related Documents</h3>
              <button
                onClick={() => setShowGraph(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ×
              </button>
            </div>

            <div className="flex flex-col space-y-3">
              {dummyRelatedDocs.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => console.log(`Navigate to document ${doc.id}`)}
                  className="flex items-center p-3 hover:bg-gray-50 rounded-lg border group"
                >
                  <div className="flex-1">
                    <div className="font-medium group-hover:text-blue-600">
                      {doc.title}
                    </div>
                    <div className="text-sm text-gray-500 flex items-center gap-2">
                      <FileType size={14} /> {doc.type}
                    </div>
                  </div>
                  <div className="text-sm px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                    {doc.connection}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentKnowledgeBase;
