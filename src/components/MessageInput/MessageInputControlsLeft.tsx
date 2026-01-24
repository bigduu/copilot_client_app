import React from "react";
import { Button, Flex } from "antd";
import { FileTextOutlined, PictureOutlined } from "@ant-design/icons";

interface MessageInputControlsLeftProps {
  allowImages: boolean;
  disabled: boolean;
  isStreaming: boolean;
  token: any;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onFileReferenceButtonClick?: () => void;
}

const MessageInputControlsLeft: React.FC<MessageInputControlsLeftProps> = ({
  allowImages,
  disabled,
  isStreaming,
  token,
  fileInputRef,
  onFileInputChange,
  onFileReferenceButtonClick,
}) => {
  return (
    <Flex
      align="center"
      style={{
        alignSelf: "center",
        gap: token.marginXS,
      }}
    >
      {allowImages && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={onFileInputChange}
          />
          <Button
            type="text"
            icon={<PictureOutlined />}
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isStreaming}
            size="small"
            style={{
              minWidth: "auto",
              padding: "4px",
              height: 32,
              width: 32,
              color: token.colorTextSecondary,
            }}
            title="Add images"
          />
        </>
      )}

      {onFileReferenceButtonClick && (
        <Button
          type="text"
          icon={<FileTextOutlined />}
          onClick={onFileReferenceButtonClick}
          disabled={disabled || isStreaming}
          size="small"
          style={{
            minWidth: "auto",
            padding: "4px",
            height: 32,
            width: 32,
            color: token.colorTextSecondary,
          }}
          title="Reference workspace files (@)"
        />
      )}
    </Flex>
  );
};

export default MessageInputControlsLeft;
