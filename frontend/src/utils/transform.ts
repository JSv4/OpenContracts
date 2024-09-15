import {
  DocTypeAnnotation,
  ServerAnnotation,
} from "../components/annotator/context/AnnotationStore";
import { BoundingBox, PermissionTypes } from "../components/types";
import { AnalyzerManifestType, ServerAnnotationType } from "../graphql/types";
import default_analyzer_icon from "../assets/icons/noun-quill-31093.png";

// https://gist.github.com/JamieMason/0566f8412af9fe6a1d470aa1e089a752
export function groupBy<T extends Record<string, any>, K extends keyof T>(
  array: T[],
  key: K | { (obj: T): string }
): Record<string, T[]> {
  const keyFn = key instanceof Function ? key : (obj: T) => obj[key];
  return array.reduce((objectsByKeyValue, obj) => {
    const value = keyFn(obj);
    objectsByKeyValue[value] = (objectsByKeyValue[value] || []).concat(obj);
    return objectsByKeyValue;
  }, {} as Record<string, T[]>);
}

export function getPermissions(
  permissions: string[] | undefined
): PermissionTypes[] {
  // console.log("Get permissions represented by obj permissions", permissions);
  let base_permissions: PermissionTypes[] = [];
  if (permissions !== undefined) {
    for (var permission of permissions) {
      if (permission === "superuser") {
        base_permissions.push(PermissionTypes.CAN_UPDATE);
        base_permissions.push(PermissionTypes.CAN_CREATE);
        base_permissions.push(PermissionTypes.CAN_PUBLISH);
        base_permissions.push(PermissionTypes.CAN_READ);
        base_permissions.push(PermissionTypes.CAN_REMOVE);
        base_permissions.push(PermissionTypes.CAN_PERMISSION);
        break;
      } else if (
        (permission.includes("update_") || permission.includes("change_")) &&
        !base_permissions.includes(PermissionTypes.CAN_UPDATE)
      ) {
        // console.log("Include update");
        base_permissions.push(PermissionTypes.CAN_UPDATE);
      } else if (
        permission.includes("remove_") &&
        !base_permissions.includes(PermissionTypes.CAN_REMOVE)
      ) {
        base_permissions.push(PermissionTypes.CAN_REMOVE);
      } else if (
        (permission.includes("create_") || permission.includes("add_")) &&
        !base_permissions.includes(PermissionTypes.CAN_CREATE)
      ) {
        base_permissions.push(PermissionTypes.CAN_CREATE);
      } else if (
        permission.includes("publish_") &&
        !base_permissions.includes(PermissionTypes.CAN_PUBLISH)
      ) {
        base_permissions.push(PermissionTypes.CAN_PUBLISH);
      } else if (
        (permission.includes("read_") || permission.includes("view_")) &&
        !base_permissions.includes(PermissionTypes.CAN_READ)
      ) {
        base_permissions.push(PermissionTypes.CAN_READ);
      } else if (
        permission.includes("permission_") &&
        !base_permissions.includes(PermissionTypes.CAN_PERMISSION)
      ) {
        base_permissions.push(PermissionTypes.CAN_PERMISSION);
      }
    }
  }
  // console.log("Resulting permissions", base_permissions);
  return base_permissions;
}

export function convertToDocTypeAnnotation(
  serverAnnotation: ServerAnnotationType
): DocTypeAnnotation {
  // Check if the annotation is of the correct type
  if (serverAnnotation.annotationLabel.labelType !== "DOC_TYPE_LABEL") {
    throw new Error("Invalid annotation type. Expected DOC_TYPE_LABEL.");
  }

  // Create and return a new DocTypeAnnotation instance
  return new DocTypeAnnotation(
    serverAnnotation.annotationLabel,
    serverAnnotation.myPermissions || [],
    serverAnnotation.id
  );
}

export function convertToServerAnnotation(
  annotation: ServerAnnotationType,
  allowComments?: boolean
): ServerAnnotation {
  let approved = false;
  let rejected = false;
  if (annotation.userFeedback?.edges.length === 1) {
    approved =
      Boolean(annotation.userFeedback.edges[0]?.node?.approved) ?? false;
    rejected =
      Boolean(annotation.userFeedback.edges[0]?.node?.rejected) ?? false;
  }

  return new ServerAnnotation(
    annotation.page,
    annotation.annotationLabel,
    annotation.rawText ?? "",
    annotation.structural ?? false,
    annotation.json ?? {},
    annotation.myPermissions ?? [],
    approved,
    rejected,
    allowComments !== undefined ? allowComments : false,
    annotation.id
  );
}

// Helper function to convert an array of ServerAnnotationType to ServerAnnotation
export function convertToServerAnnotations(
  annotations: ServerAnnotationType[],
  allowComments?: boolean
): ServerAnnotation[] {
  return annotations.map((annot) =>
    convertToServerAnnotation(annot, allowComments)
  );
}

export function hexToRgb(hex: string) {
  // For shortsighted reasons, the color stored is missing #. Check first to see if number is missing hex, if so
  // add it and THEN run the
  try {
    let color_str = hex.substring(0, 1) !== "#" ? "#" + hex : hex;

    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color_str);
    if (!result) {
      throw new Error("Unable to parse color.");
    }
    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    };
  } catch {
    return {
      r: 255,
      g: 255,
      b: 0,
    };
  }
}

export function getBorderWidthFromBounds(bounds: BoundingBox): number {
  //
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  if (width < 100 || height < 100) {
    return 1;
  } else {
    return 3;
  }
}

export function extractIconSrcFromAnalyzerManifest(
  manifest: AnalyzerManifestType | null
): string {
  /**
   * Given a Gremlin Analyzer Manifest type, extract an icon src string we can drop into an image component
   * TODO - give the analyzer its own image field so we don't need to look into the labelsets optional image fields.
   */
  if (manifest?.label_set?.icon_data && manifest?.label_set?.icon_name) {
    let icon_extension = manifest.label_set.icon_name.split(",")[1];
    return `data:image/${icon_extension};base64,${manifest.label_set.icon_data}`;
  } else {
    return default_analyzer_icon;
  }
}

export function getPageBoundsFromCanvas(
  canvas: HTMLCanvasElement
): BoundingBox {
  if (canvas.parentElement === null) {
    throw new Error("No canvas parent");
  }
  const parent = canvas.parentElement;
  const parentStyles = getComputedStyle(canvas.parentElement);

  const leftPadding = parseFloat(parentStyles.paddingLeft || "0");
  const left = parent.offsetLeft + leftPadding;

  const topPadding = parseFloat(parentStyles.paddingTop || "0");
  const top = parent.offsetTop + topPadding;

  const parentWidth =
    parent.clientWidth -
    leftPadding -
    parseFloat(parentStyles.paddingRight || "0");
  const parentHeight =
    parent.clientHeight -
    topPadding -
    parseFloat(parentStyles.paddingBottom || "0");
  return {
    left,
    top,
    right: left + parentWidth,
    bottom: top + parentHeight,
  };
}

// Function to determine contrasting text color
export const getContrastColor = (hexColor: string) => {
  // Convert hex to RGB
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);

  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Return black or white depending on luminance
  return luminance > 0.5 ? "#000000" : "#FFFFFF";
};
