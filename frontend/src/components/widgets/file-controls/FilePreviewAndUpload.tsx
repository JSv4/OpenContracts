import React, { useState, useRef } from "react";
import { Segment, Image, Label } from "semantic-ui-react";

import default_image from "../../../assets/images/defaults/default_image.png";
import default_file from "../../../assets/images/defaults/default_file.png";

interface FilePreviewAndUploadProps {
  isImage: boolean;
  acceptedTypes: string;
  style?: Record<string, any>;
  file: string | ArrayBuffer;
  readOnly: boolean;
  disabled: boolean;
  onChange: ({
    data,
    filename,
  }: {
    data: string | ArrayBuffer;
    filename: string;
  }) => void;
}

export const FilePreviewAndUpload = ({
  isImage,
  acceptedTypes,
  style,
  file,
  readOnly,
  disabled,
  onChange,
}: FilePreviewAndUploadProps) => {
  const [new_file, setNewFile] = useState<string | ArrayBuffer>();
  const [new_filename, setNewFilename] = useState<string>();
  const fileRef = useRef() as React.MutableRefObject<HTMLInputElement>;

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      let reader = new FileReader();
      reader.onload = (e) => {
        if (e?.target?.result) {
          setNewFile(e.target.result);
          onChange({
            data: e.target.result,
            filename:
              event?.target?.files !== null && event.target.files[0].name
                ? event.target.files[0].name
                : "",
          });
        }
      };
      setNewFilename(event.target.files[0].name);
      reader.readAsDataURL(event.target.files[0]);
    }
  };

  const onFileClick = () => {
    if (!readOnly && fileRef?.current) {
      fileRef.current.click();
    }
  };

  // If user has loaded a new file... then display that, otherwise try to load image image property.
  // If the image property isn't set and nothing has been selected by user, use the defauly image
  return (
    <Segment
      tertiary
      disabled={readOnly || disabled ? true : undefined}
      raised
      style={{ width: "100%", ...style }}
    >
      {!readOnly && !disabled ? (
        <Label corner="right" icon="edit outline" onClick={onFileClick} />
      ) : (
        <></>
      )}
      {isImage ? (
        <Image
          style={{ width: "100%" }}
          src={new_file ? new_file : file ? file : default_image}
        />
      ) : (
        <Image style={{ width: "100%" }} src={default_file} />
      )}
      <input
        ref={fileRef}
        readOnly={readOnly}
        id="selectImage"
        accept={acceptedTypes}
        hidden
        type="file"
        onChange={onFileChange}
      />
      {!isImage ? (
        <Label attached="bottom" style={{ wordBreak: "break-all" }}>
          {new_filename ? new_filename : typeof file === "string" ? file : ""}
        </Label>
      ) : (
        <></>
      )}
    </Segment>
  );
};
