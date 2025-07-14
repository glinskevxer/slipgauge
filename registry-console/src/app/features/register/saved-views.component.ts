import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { RegisterView } from './query-url';
import {
  SavedView,
  describe,
  findMatching,
  nameIsUsable,
  ordered,
  read,
  save,
  used,
  withAdded,
  write,
} from './saved-views.model';

/**
 * The strip of saved filter sets above the register.
 *
 * <p>It hides itself until there is at least one, because an empty row of
 * shortcuts is just a row telling you it has nothing for you.
 */
@Component({
  selector: 'sg-saved-views',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './saved-views.component.html',
  styleUrl: './saved-views.component.scss',
})
export class SavedViewsComponent {
  readonly current = input.required<RegisterView>();
  readonly chosen = output<RegisterView>();

  protected readonly views = signal<readonly SavedView[]>(read(localStorage));
  protected readonly naming = signal(false);
  protected readonly name = signal('');

  protected readonly describe = describe;
  protected readonly shown = computed(() => ordered(this.views()));

  protected readonly matching = computed(() => findMatching(this.views(), this.current()));
  protected readonly canSave = computed(
    () => this.matching() === null && nameIsUsable(this.name(), this.views()),
  );

  protected readonly anything = computed(
    () => this.views().length > 0 || this.naming(),
  );

  protected startNaming(): void {
    this.naming.set(true);
    this.name.set('');
  }

  protected cancelNaming(): void {
    this.naming.set(false);
    this.name.set('');
  }

  protected keep(): void {
    if (!this.canSave()) {
      return;
    }
    this.persist(withAdded(this.views(), save(this.name(), this.current())));
    this.cancelNaming();
  }

  protected open(entry: SavedView): void {
    this.persist(
      this.views().map((candidate) =>
        candidate.id === entry.id ? used(candidate) : candidate,
      ),
    );
    this.chosen.emit(entry.view);
  }

  protected forget(entry: SavedView, event: Event): void {
    event.stopPropagation();
    this.persist(this.views().filter((candidate) => candidate.id !== entry.id));
  }

  protected isOpen(entry: SavedView): boolean {
    return this.matching()?.id === entry.id;
  }

  private persist(views: readonly SavedView[]): void {
    this.views.set(views);
    write(localStorage, views);
  }
}
