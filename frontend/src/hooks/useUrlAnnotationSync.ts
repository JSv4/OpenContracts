import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAnnotationSelection } from "../components/annotator/context/UISettingsAtom";

/**
 * Keeps the `selectedAnnotationsAtom` and the browser URL in sync via the
 * query-parameter `ann=id1,id2,…`.
 *
 * – When the URL contains `?ann=…` this hook seeds the atom.
 * – Whenever the selection changes, the hook rewrites the URL (replace) so a
 *   permalink can be copied.
 */
export function useUrlAnnotationSync() {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedAnnotations, setSelectedAnnotations } =
    useAnnotationSelection();

  const prevSearchRef = useRef(location.search);
  const prevAnnListRef = useRef<string[]>(selectedAnnotations);

  /* ------------------------------------------------------ */
  /* URL → Atom                                             */
  useEffect(() => {
    if (prevSearchRef.current === location.search) return;
    prevSearchRef.current = location.search;

    const params = new URLSearchParams(location.search);
    const ann = params.get("ann");
    const ids = ann ? ann.split(",").filter(Boolean) : [];

    // only update if different
    if (ids.sort().join() !== selectedAnnotations.sort().join()) {
      setSelectedAnnotations(ids);
    }
  }, [location.search, selectedAnnotations, setSelectedAnnotations]);

  /* ------------------------------------------------------ */
  /* Atom → URL                                             */
  useEffect(() => {
    const prev = prevAnnListRef.current;
    if (prev.sort().join() === selectedAnnotations.sort().join()) return;
    prevAnnListRef.current = selectedAnnotations;

    const params = new URLSearchParams(location.search);
    if (selectedAnnotations.length === 0) {
      params.delete("ann");
    } else {
      params.set("ann", selectedAnnotations.join(","));
    }

    navigate({ search: params.toString() }, { replace: true });
  }, [selectedAnnotations, location.search, navigate]);
}
