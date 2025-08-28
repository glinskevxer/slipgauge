import { StorageLocationView } from '@core/models/instrument.model';
import {
  buildTree,
  find,
  flatten,
  subtreeCodes,
  validParentsFor,
} from '@features/admin/location-tree.model';

function location(
  code: string,
  parentCode: string | null,
  site = 'HARLOW',
): StorageLocationView {
  return {
    id: code.length,
    code,
    name: `${code} room`,
    site,
    parentCode,
    path: [code],
  };
}

const HARLOW: readonly StorageLocationView[] = [
  location('HARLOW', null),
  location('HARLOW-LAB', 'HARLOW'),
  location('HARLOW-DIM', 'HARLOW-LAB'),
  location('HARLOW-ELEC', 'HARLOW-LAB'),
  location('HARLOW-STORE', 'HARLOW'),
  location('HARLOW-QUAR', 'HARLOW-STORE'),
  location('CREWE', null, 'CREWE'),
  location('CREWE-TOOL', 'CREWE', 'CREWE'),
];

describe('location tree', () => {
  it('puts the parentless locations at the root', () => {
    expect(buildTree(HARLOW).map((node) => node.location.code)).toEqual(['CREWE', 'HARLOW']);
  });

  it('nests children under their parent in code order', () => {
    const harlow = buildTree(HARLOW)[1];
    expect(harlow.children.map((node) => node.location.code)).toEqual([
      'HARLOW-LAB',
      'HARLOW-STORE',
    ]);
  });

  it('records the depth so the table can indent', () => {
    const rows = flatten(buildTree(HARLOW));
    const byCode = new Map(rows.map((row) => [row.location.code, row.depth]));

    expect(byCode.get('HARLOW')).toBe(0);
    expect(byCode.get('HARLOW-LAB')).toBe(1);
    expect(byCode.get('HARLOW-DIM')).toBe(2);
  });

  it('flattens the tree back out in display order', () => {
    expect(flatten(buildTree(HARLOW)).map((row) => row.location.code)).toEqual([
      'CREWE',
      'CREWE-TOOL',
      'HARLOW',
      'HARLOW-LAB',
      'HARLOW-DIM',
      'HARLOW-ELEC',
      'HARLOW-STORE',
      'HARLOW-QUAR',
    ]);
  });

  it('lifts an orphan to the root rather than dropping it', () => {
    const orphaned = [location('ORPHAN', 'A-SITE-THAT-IS-GONE')];

    expect(buildTree(orphaned).map((node) => node.location.code)).toEqual(['ORPHAN']);
  });

  it('loses nothing when the whole list is flat', () => {
    const flat = [location('A', null), location('B', null), location('C', null)];

    expect(flatten(buildTree(flat))).toHaveLength(3);
  });

  it('finds a node anywhere in the tree', () => {
    expect(find(buildTree(HARLOW), 'HARLOW-QUAR')?.location.code).toBe('HARLOW-QUAR');
    expect(find(buildTree(HARLOW), 'NOT-A-PLACE')).toBeNull();
  });

  it('lists a subtree including the node itself', () => {
    expect(subtreeCodes(buildTree(HARLOW), 'HARLOW-LAB')).toEqual([
      'HARLOW-LAB',
      'HARLOW-DIM',
      'HARLOW-ELEC',
    ]);
  });

  it('reports a leaf as its own subtree', () => {
    expect(subtreeCodes(buildTree(HARLOW), 'HARLOW-DIM')).toEqual(['HARLOW-DIM']);
  });

  it('offers every location except the moving one and everything under it', () => {
    const parents = validParentsFor(buildTree(HARLOW), 'HARLOW-LAB');

    expect(parents).not.toContain('HARLOW-LAB');
    expect(parents).not.toContain('HARLOW-DIM');
    expect(parents).not.toContain('HARLOW-ELEC');
    expect(parents).toContain('HARLOW');
    expect(parents).toContain('CREWE');
  });

  it('offers everything else when a leaf is moved', () => {
    const parents = validParentsFor(buildTree(HARLOW), 'HARLOW-QUAR');

    expect(parents).toHaveLength(HARLOW.length - 1);
  });

  it('handles an empty list without complaining', () => {
    expect(buildTree([])).toEqual([]);
    expect(flatten([])).toEqual([]);
    expect(validParentsFor([], 'ANYTHING')).toEqual([]);
  });
});
