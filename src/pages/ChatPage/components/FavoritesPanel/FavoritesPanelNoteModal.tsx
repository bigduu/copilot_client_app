import React from "react";
import { Input, Modal, theme } from "antd";

const { TextArea } = Input;
const { useToken } = theme;

interface FavoritesPanelNoteModalProps {
  visible: boolean;
  noteText: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

const FavoritesPanelNoteModal: React.FC<FavoritesPanelNoteModalProps> = ({
  visible,
  noteText,
  onChange,
  onSave,
  onCancel,
}) => {
  const { token } = useToken();

  return (
    <Modal
      title="Add Note"
      open={visible}
      onOk={onSave}
      onCancel={onCancel}
      okText="Save"
      destroyOnClose
    >
      <TextArea
        value={noteText}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Add a note to this favorite..."
        autoSize={{ minRows: 3, maxRows: 6 }}
        style={{ marginTop: token.marginSM }}
      />
    </Modal>
  );
};

export default FavoritesPanelNoteModal;
