/**
 * tracks bidirectional dependencies between .astro files and
 * their component imports for HMR propagation.
 *
 * all paths must be pre-resolved (absolute, without extension).
 */
export class DepTracker {
  private readonly astroToDeps = new Map<string, Set<string>>();
  private readonly depToAstros = new Map<string, Set<string>>();

  /**
   * record that an .astro file depends on a resolved component path.
   */
  track(astroFile: string, resolvedComponentPath: string): void {
    let deps = this.astroToDeps.get(astroFile);

    if (!deps) {
      deps = new Set();
      this.astroToDeps.set(astroFile, deps);
    }

    deps.add(resolvedComponentPath);

    let astros = this.depToAstros.get(resolvedComponentPath);

    if (!astros) {
      astros = new Set();
      this.depToAstros.set(resolvedComponentPath, astros);
    }

    astros.add(astroFile);
  }

  /**
   * clear all dependencies for an .astro file (before re-tracking).
   */
  clear(astroFile: string): void {
    const deps = this.astroToDeps.get(astroFile);

    if (!deps) return;

    for (const dep of deps) {
      this.depToAstros.get(dep)?.delete(astroFile);
    }

    this.astroToDeps.delete(astroFile);
  }

  /**
   * get all .astro files that depend on a component path.
   */
  getDependents(resolvedComponentPath: string): Set<string> | undefined {
    return this.depToAstros.get(resolvedComponentPath);
  }
}
