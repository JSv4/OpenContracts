import { useEffect } from "react";
import { useInView } from "react-intersection-observer";

interface FetchMoreOnVisibleProps {
  fetchMore: () => void | any;
}

export const FetchMoreOnVisible = ({ fetchMore }: FetchMoreOnVisibleProps) => {
  console.log("FetchMoreOnVisible");
  const { ref, inView, entry } = useInView();

  useEffect(() => {
    if (inView && entry) {
      console.log("Fetch more!");
      fetchMore();
    }
  }, [entry]);

  return (
    <div style={{ height: "1px" }} ref={ref} className="FetchMoreOnVisible" />
  );
};
