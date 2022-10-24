import { Dropdown } from "semantic-ui-react";
import { icons } from "./icons";
import styles from "./styles.module.css";

interface IconDropdownProps {
  value: string;
  style?: Record<string, any>;
  onChange: (value: string) => void;
}

const IconDropdown = ({ value, onChange, style }: IconDropdownProps) => (
  <div className={styles["icon-picker"]}>
    <Dropdown
      style={style ? style : {}}
      placeholder="Select an icon..."
      fluid
      selection
      search
      clearable
      selectOnBlur={false}
      value={value}
      options={icons.map((icon) => ({
        key: icon,
        text: icon,
        value: icon,
        icon: icon,
        className: styles["icon-picker-item"],
      }))}
      onChange={(e, { value }) => onChange && onChange(`${value}`)}
    />
  </div>
);

export default IconDropdown;
