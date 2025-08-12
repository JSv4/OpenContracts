import { useMemo } from "react";
import { getRuntimeEnv, type EnvConfig } from "../../utils/env";

export function useEnv(): EnvConfig {
  return useMemo(() => getRuntimeEnv(), []);
}
