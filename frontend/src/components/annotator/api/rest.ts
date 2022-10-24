import axios from "axios";
import { PageTokens } from "../../types";

export async function getPawlsLayer(url: string): Promise<PageTokens[]> {
  return axios.get(url).then((r) => r.data);
}
