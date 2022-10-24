import React, { useState } from "react";
import { Modal, Button, Popup, Input } from "semantic-ui-react";
import InfiniteScroll from "react-infinite-scroll-component";
import { icons as allIcons } from "./icons";
import { SemanticICONS } from "semantic-ui-react/dist/commonjs/generic";

const SCROLLABLE_CONTAINER_HEIGHT = 400;
const INITIAL_LIMIT = 64;
const PAGE_SIZE = 32;

interface IconPickerModalProps {
  value: SemanticICONS;
  onChange: (icon: SemanticICONS) => void | any;
}

const IconPickerModal = ({ value, onChange }: IconPickerModalProps) => {
  const [open, setOpen] = useState<boolean>(false);
  const [filteredIcons, setFilteredIcons] = useState<SemanticICONS[]>([]);
  const [limit, setLimit] = useState<number>(INITIAL_LIMIT);

  const onSearch = (e: { target: { value: string } }) => {
    const query = e.target.value as SemanticICONS;
    const matchingIcons = allIcons.filter((icon) => icon.match(query));
    const adjustedLimit = Math.min(
      Math.max(INITIAL_LIMIT, limit),
      matchingIcons.length
    );
    setFilteredIcons(matchingIcons);
    setLimit(adjustedLimit);
  };

  const fetchMore = () => {
    if (limit > filteredIcons.length) {
      return;
    }
    setLimit(Math.min(limit + PAGE_SIZE, filteredIcons.length));
  };

  const onClose = () => {
    setOpen(false);
    setFilteredIcons(allIcons);
    setLimit(INITIAL_LIMIT);
  };

  const renderTrigger = () => {
    return (
      <Button
        icon={value || undefined}
        content={value ? undefined : "Select Icon"}
        onClick={() => setOpen(true)}
      />
    );
  };

  const renderIcons = () => {
    return filteredIcons.slice(0, limit).map((icon) => (
      <div key={icon} className="two wide column">
        <Popup
          content={icon}
          trigger={
            <Button
              icon={icon}
              onClick={() => {
                onChange && onChange(icon);
                onClose();
              }}
            />
          }
        />
      </div>
    ));
  };

  const renderContent = () => {
    return (
      <InfiniteScroll
        className="ui grid"
        style={{ alignContent: "flex-start" }}
        dataLength={limit}
        next={fetchMore}
        hasMore={limit < filteredIcons.length}
        initialScrollY={0}
        height={SCROLLABLE_CONTAINER_HEIGHT}
        loader={undefined}
      >
        {renderIcons()}
      </InfiniteScroll>
    );
  };

  const renderActionBar = () => {
    return (
      <React.Fragment>
        <Input
          autoFocus
          icon="search"
          placeholder="Search..."
          onChange={onSearch}
          style={{ float: "left" }}
        />
        <Button content="Cancel" onClick={onClose} />
      </React.Fragment>
    );
  };

  return (
    <Modal trigger={renderTrigger()} closeIcon open={open} onClose={onClose}>
      <Modal.Header>Select an Icon</Modal.Header>
      <Modal.Content>{renderContent()}</Modal.Content>
      <Modal.Actions>{renderActionBar()}</Modal.Actions>
    </Modal>
  );
};

export default IconPickerModal;
