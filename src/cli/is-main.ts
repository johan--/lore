import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Decide whether this module is the program entry point. The naive check
 * (`import.meta.url === pathToFileURL(argv[1]).href`) breaks for global installs:
 * npm links the bin as a symlink, so `argv[1]` is the symlink path while
 * `import.meta.url` is the resolved real file — they never match and the CLI
 * silently does nothing. Resolving both through `realpath` before comparing makes
 * direct invocation and symlinked-bin invocation both register as "main".
 */
export function isMainModule(importMetaUrl: string, entryPath: string | undefined): boolean {
  if (!entryPath) return false;
  try {
    const modulePath = realpathSync(fileURLToPath(importMetaUrl));
    const invokedPath = realpathSync(entryPath);
    return modulePath === invokedPath;
  } catch {
    return false;
  }
}
