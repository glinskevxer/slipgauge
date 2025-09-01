import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import {
  ChainNode,
  chainDepth,
  chainFaults,
  chainSize,
  chainTerminates,
} from '@core/models/calibration.model';

interface LaidOutNode {
  readonly node: ChainNode;
  readonly x: number;
  readonly y: number;
  readonly parentX: number | null;
  readonly parentY: number | null;
}

const NODE_WIDTH = 210;
const NODE_HEIGHT = 62;
const COLUMN_GAP = 70;
const ROW_GAP = 18;

/**
 * The traceability chain drawn left to right, one column per hop.
 *
 * <p>Laid out by hand rather than with a graph library. Chains are shallow and
 * narrow, four levels at the very worst, and every layout package that was
 * tried spent more effort avoiding crossings that cannot happen here than it
 * saved.
 */
@Component({
  selector: 'sg-chain-tree',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chain-tree.component.html',
  styleUrl: './chain-tree.component.scss',
})
export class ChainTreeComponent {
  readonly root = input.required<ChainNode>();

  protected readonly depth = computed(() => chainDepth(this.root()));
  protected readonly size = computed(() => chainSize(this.root()));
  protected readonly faults = computed(() => chainFaults(this.root()));
  protected readonly terminates = computed(() => chainTerminates(this.root()));

  protected readonly laidOut = computed<readonly LaidOutNode[]>(() => layout(this.root()));

  protected readonly width = computed(
    () => (this.depth() + 1) * (NODE_WIDTH + COLUMN_GAP) + COLUMN_GAP,
  );

  protected readonly height = computed(() => {
    const lowest = this.laidOut().reduce((max, entry) => Math.max(max, entry.y), 0);
    return lowest + NODE_HEIGHT + ROW_GAP * 2;
  });

  protected readonly nodeWidth = NODE_WIDTH;
  protected readonly nodeHeight = NODE_HEIGHT;

  protected summary(): string {
    if (this.faults().length > 0) {
      const count = this.faults().length;
      return `${count} problem${count === 1 ? '' : 's'} on the chain`;
    }
    if (!this.terminates()) {
      return 'sound so far, but no branch reaches an outside laboratory';
    }
    return `traceable in ${this.depth()} hop${this.depth() === 1 ? '' : 's'}`;
  }

  protected connector(entry: LaidOutNode): string {
    if (entry.parentX === null || entry.parentY === null) {
      return '';
    }
    const startX = entry.parentX + NODE_WIDTH;
    const startY = entry.parentY + NODE_HEIGHT / 2;
    const endX = entry.x;
    const endY = entry.y + NODE_HEIGHT / 2;
    const midX = startX + COLUMN_GAP / 2;
    return `M${startX},${startY} H${midX} V${endY} H${endX}`;
  }

  protected tone(node: ChainNode): 'ok' | 'bad' | 'outside' {
    if (!node.sound) {
      return 'bad';
    }
    return node.kind === 'EXTERNAL_STANDARD' ? 'outside' : 'ok';
  }
}

/**
 * Walks the tree depth first, giving each node the next free row. That keeps a
 * parent visually next to its first child, which is how the eye follows a
 * chain from an instrument down to the national standard behind it.
 */
function layout(root: ChainNode): readonly LaidOutNode[] {
  const placed: LaidOutNode[] = [];
  let row = 0;

  function walk(node: ChainNode, column: number, parent: LaidOutNode | null): void {
    const entry: LaidOutNode = {
      node,
      x: COLUMN_GAP + column * (NODE_WIDTH + COLUMN_GAP),
      y: ROW_GAP + row * (NODE_HEIGHT + ROW_GAP),
      parentX: parent?.x ?? null,
      parentY: parent?.y ?? null,
    };
    placed.push(entry);
    row += 1;

    for (const child of node.children) {
      walk(child, column + 1, entry);
    }
  }

  walk(root, 0, null);
  return placed;
}
