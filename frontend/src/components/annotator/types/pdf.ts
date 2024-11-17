import { PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import { AnnotationLabelType } from "../../../types/graphql-api";
import { Token, BoundingBox, SinglePageAnnotationJson } from "../../types";
import {
  scaled,
  normalizeBounds,
  doOverlap,
  spanningBound,
  Optional,
  undefined_bounding_box,
} from "../context/PDFStore";
import { convertAnnotationTokensToText } from "../utils";
import { RenderedSpanAnnotation, TokenId } from "./annotations";

export class PDFPageInfo {
  constructor(
    public readonly page: PDFPageProxy,
    public readonly tokens: Token[] = [],
    public scale: number,
    public bounds?: BoundingBox
  ) {}

  getFreeFormAnnotationForBounds(
    selection: BoundingBox,
    label: AnnotationLabelType
  ): RenderedSpanAnnotation {
    if (this.bounds === undefined) {
      throw new Error("Unknown Page Bounds");
    }

    // Here we invert the scale, because the user has drawn this bounding
    // box, so it is *already* scaled with respect to the client's view. For
    // the annotation, we want to remove this, because storing it with respect
    // to the PDF page's original scale means we can render it everywhere.
    const bounds = scaled(selection, 1 / this.scale);

    return new RenderedSpanAnnotation(
      bounds,
      this.page.pageNumber - 1,
      label,
      [],
      ""
    );
  }

  getPageAnnotationJson(selections: BoundingBox[]): SinglePageAnnotationJson {
    if (this.bounds === undefined) {
      throw new Error("Unknown Page Bounds");
    }
    const ids: TokenId[] = [];
    const tokenBounds: BoundingBox[] = [];
    // console.log("Handle page", this.page.pageNumber);
    for (let i = 0; i < this.tokens.length; i++) {
      for (let j = 0; j < selections.length; j++) {
        const normalized_selection_bounds = normalizeBounds(selections[j]);
        const tokenBound = this.getTokenBounds(this.tokens[i]);

        if (
          doOverlap(scaled(tokenBound, this.scale), normalized_selection_bounds)
        ) {
          ids.push({ pageIndex: this.page.pageNumber - 1, tokenIndex: i });
          tokenBounds.push(tokenBound);
          break;
        }
      }
    }
    if (ids.length === 0) {
      return {
        bounds: {
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
        },
        tokensJsons: [],
        rawText: "",
      };
    }
    const bounds = spanningBound(tokenBounds);
    const rawText = convertAnnotationTokensToText([this], 0, ids);

    return {
      bounds,
      tokensJsons: ids,
      rawText,
    };
  }

  getBoundsForTokens(selected_tokens: TokenId[]): Optional<BoundingBox> {
    /**
     * Given a list of token ids and page ids, determine the bounding box
     */
    if (this.bounds === undefined) {
      throw new Error("Unknown Page Bounds");
    }

    const this_page_tokens = selected_tokens.filter(
      (token) => token.pageIndex === this.page.pageNumber - 1
    );

    const tokenBounds: BoundingBox[] = [];
    for (let i = 0; i < this_page_tokens.length; i++) {
      const tokenBound = this.getTokenBounds(
        this.tokens[this_page_tokens[i].tokenIndex]
      );
      tokenBounds.push(tokenBound);
    }
    const bounds = spanningBound(tokenBounds);

    return bounds;
  }

  getAnnotationForBounds(
    selection: BoundingBox,
    label: AnnotationLabelType
  ): Optional<RenderedSpanAnnotation> {
    /* This function is quite complicated. Our objective here is to
      compute overlaps between a bounding box provided by a user and
      grobid token spans associated with a pdf. The complexity here is
      that grobid spans are relative to an absolute scale of the pdf,
      but our user's bounding box is relative to the pdf rendered in their
      client.
 
      The critical key here is that anything we *store* must be relative
      to the underlying pdf. So for example, inside the for loop, we are
      computing:
 
      whether a grobid token (tokenBound), scaled to the current scale of the
      pdf in the client (scaled(tokenBound, this.scale)), is overlapping with
      the bounding box drawn by the user (selection).
 
      But! Once we have computed this, we store the grobid tokens and the bound
      that contains all of them relative to the *original grobid tokens*.
 
      This means that the stored data is not tied to a particular scale, and we
      can re-scale it when we need to (mainly when the user resizes the browser window).
    */
    if (this.bounds === undefined) {
      throw new Error("Unknown Page Bounds");
    }

    console.log("Get annotations for bounds", selection);

    const ids: TokenId[] = [];
    const tokenBounds: BoundingBox[] = [];
    for (let i = 0; i < this.tokens.length; i++) {
      const tokenBound = this.getTokenBounds(this.tokens[i]);

      if (doOverlap(scaled(tokenBound, this.scale), selection)) {
        ids.push({ pageIndex: this.page.pageNumber - 1, tokenIndex: i });
        tokenBounds.push(tokenBound);
      }
    }
    if (ids.length === 0) {
      return undefined;
    }
    const bounds = spanningBound(tokenBounds);
    const rawText = convertAnnotationTokensToText([this], 0, ids);
    return new RenderedSpanAnnotation(
      bounds,
      this.page.pageNumber - 1,
      label,
      ids,
      rawText
    );
  }

  getScaledTokenBounds(t: Token): BoundingBox {
    //console.log("getScaledTokenBounds() for t: ", t );
    if (typeof t === "undefined") {
      return undefined_bounding_box;
    }
    return this.getScaledBounds(this.getTokenBounds(t));
  }

  getTokenBounds(t: Token): BoundingBox {
    if (!t) {
      return {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
      };
    } else {
      return {
        left: t.x,
        top: t.y,
        right: t.x + t.width,
        bottom: t.y + t.height,
      };
    }
  }

  getScaledBounds(b: BoundingBox): BoundingBox {
    return scaled(b, this.scale);
  }
}
