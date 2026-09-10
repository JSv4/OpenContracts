/** Document bytes belong to one page session and authentication generation. */
const pageScope = crypto.randomUUID();
let generation = 0;

export const getDocumentCacheGeneration = () => generation;
export const getDocumentCacheScope = () => `${pageScope}:${generation}`;
export const docxBytesCache = new Map<string, Uint8Array>();

export function invalidateDocumentCacheSession(): void {
  generation++;
  docxBytesCache.clear();
}

export function assertDocumentCacheGeneration(expected: number): void {
  if (generation !== expected) throw new Error("Document session changed");
}
