//########################### NEW DOCUMENT FORM #################################

export const newDocForm_Schema = {
  title: "Document Details",
  type: "object",
  properties: {
    title: {
      type: "string",
      title: "Title:",
    },
    description: {
      type: "string",
      title: "Description:",
    },
  },
  required: ["title", "description"],
};

export const newDocForm_Ui_Schema = {
  description: {
    "ui:widget": "textarea",
    "ui:placeholder": "Add a description...",
  },
};

//########################### EDIT DOCUMENT FORM #################################

export const editDocForm_Schema = {
  title: "Document Details",
  type: "object",
  properties: {
    title: {
      type: "string",
      title: "Title:",
    },
    description: {
      type: "string",
      title: "Description:",
    },
  },
  required: ["title", "description"],
};

export const editDocForm_Ui_Schema = {
  description: {
    "ui:widget": "textarea",
    "ui:placeholder": "Add a description...",
  },
};

//########################### NEW CORPUS FORM ####################################

export const newCorpusForm_Schema = {
  title: "Corpus Details",
  type: "object",
  properties: {
    title: {
      type: "string",
      title: "Title:",
    },
    description: {
      type: "string",
      title: "Description:",
    },
  },
  required: ["title", "description"],
};

export const newCorpusForm_Ui_Schema = {
  description: {
    "ui:widget": "textarea",
    "ui:placeholder": "Add a description...",
  },
};

//########################### EDIT CORPUS FORM ####################################

export const editCorpusForm_Schema = {
  title: "Corpus Details",
  type: "object",
  properties: {
    title: {
      type: "string",
      title: "Title:",
    },
    description: {
      type: "string",
      title: "Description:",
    },
  },
  required: ["title", "description"],
};

export const editCorpusForm_Ui_Schema = {
  description: {
    "ui:widget": "textarea",
    "ui:placeholder": "Add a description...",
  },
};

//########################### NEW LABEL SET FORM ################################

export const newLabelSetForm_Schema = {
  title: "Label Set Details",
  type: "object",
  properties: {
    title: {
      type: "string",
      title: "Title:",
    },
    description: {
      type: "string",
      title: "Description:",
    },
  },
  required: ["title", "description"],
};

export const newLabelSetForm_Ui_Schema = {
  description: {
    "ui:widget": "textarea",
    "ui:placeholder": "Add a description...",
  },
};
