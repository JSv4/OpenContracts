import { PermissionTypes } from "../components/types";

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
