import { Table } from "semantic-ui-react";

interface EmptyDatacellProps {
  id: string;
}

const missingCellStyle = {
  backgroundColor: "#f0f0f0",
  backgroundImage:
    "linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc)",
  backgroundSize: "10px 10px",
  backgroundPosition: "0 0, 5px 5px",
};

export const EmptyDatacell = ({ id }: EmptyDatacellProps) => {
  return (
    <Table.Cell key={id} style={missingCellStyle}>
      -
    </Table.Cell>
  );
};
