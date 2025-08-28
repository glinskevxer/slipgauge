import { StorageLocationView } from '@core/models/instrument.model';

export interface LocationNode {
  readonly location: StorageLocationView;
  readonly depth: number;
  readonly children: readonly LocationNode[];
}

/**
 * Turns the flat location list into the tree the admin screen renders.
 *
 * <p>A location whose parent is missing from the list is lifted to the root
 * rather than dropped. Losing a room from the screen because its parent was
 * filtered out is far worse than showing it in the wrong place.
 */
export function buildTree(locations: readonly StorageLocationView[]): readonly LocationNode[] {
  const byCode = new Map(locations.map((location) => [location.code, location]));
  const childrenOf = new Map<string | null, StorageLocationView[]>();

  for (const location of locations) {
    const parent =
      location.parentCode && byCode.has(location.parentCode) ? location.parentCode : null;
    const bucket = childrenOf.get(parent);
    if (bucket) {
      bucket.push(location);
    } else {
      childrenOf.set(parent, [location]);
    }
  }

  function build(parentCode: string | null, depth: number): readonly LocationNode[] {
    const children = childrenOf.get(parentCode) ?? [];
    return [...children]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((location) => ({
        location,
        depth,
        children: build(location.code, depth + 1),
      }));
  }

  return build(null, 0);
}

/** The tree flattened back out in display order, which is what a table wants. */
export function flatten(nodes: readonly LocationNode[]): readonly LocationNode[] {
  const rows: LocationNode[] = [];
  for (const node of nodes) {
    rows.push(node);
    rows.push(...flatten(node.children));
  }
  return rows;
}

/** Every code at or below the given one, so a move cannot point into itself. */
export function subtreeCodes(
  nodes: readonly LocationNode[],
  code: string,
): readonly string[] {
  const found = find(nodes, code);
  if (!found) {
    return [code];
  }
  return [code, ...flatten(found.children).map((node) => node.location.code)];
}

export function find(nodes: readonly LocationNode[], code: string): LocationNode | null {
  for (const node of nodes) {
    if (node.location.code === code) {
      return node;
    }
    const inside = find(node.children, code);
    if (inside) {
      return inside;
    }
  }
  return null;
}

/** Codes a location may legitimately be moved under. */
export function validParentsFor(
  nodes: readonly LocationNode[],
  code: string,
): readonly string[] {
  const forbidden = new Set(subtreeCodes(nodes, code));
  return flatten(nodes)
    .map((node) => node.location.code)
    .filter((candidate) => !forbidden.has(candidate));
}

export function countSites(nodes: readonly LocationNode[]): number {
  return nodes.length;
}
