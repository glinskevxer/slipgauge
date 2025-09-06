import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { problemDetailInterceptor } from '@core/interceptors/problem-detail.interceptor';
import { NotificationService } from '@core/notifications/notification.service';
import { Command, Match } from '@shared/palette/command.model';
import { CommandPaletteComponent } from '@shared/palette/command-palette.component';

interface Palette {
  open: () => boolean;
  term: () => string;
  cursor: { (): number; set: (value: number) => void };
  matches: () => readonly Match[];
  tagJump: () => string | null;
  nothingFound: () => boolean;
  toggle: () => void;
  close: () => void;
  onTerm: (value: string) => void;
  move: (delta: number) => void;
  run: () => void;
  go: (command: Command) => void;
  highlighted: (match: Match) => readonly { text: string; hit: boolean }[];
  onKey: (event: KeyboardEvent) => void;
}

describe('CommandPaletteComponent', () => {
  let fixture: ComponentFixture<CommandPaletteComponent>;
  let palette: Palette;
  let http: HttpTestingController;
  let notifications: NotificationService;

  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [CommandPaletteComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([problemDetailInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CommandPaletteComponent);
    palette = fixture.componentInstance as unknown as Palette;
    http = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(NotificationService);
    fixture.detectChanges();
  });

  afterEach(() => {
    notifications.dismissAll();
    http.verify();
  });

  it('starts closed', () => {
    expect(palette.open()).toBe(false);
  });

  it('toggles open and shut', () => {
    palette.toggle();
    expect(palette.open()).toBe(true);
    palette.toggle();
    expect(palette.open()).toBe(false);
  });

  it('empties the box each time it opens', () => {
    palette.toggle();
    palette.onTerm('recall');
    palette.toggle();
    palette.toggle();

    expect(palette.term()).toBe('');
  });

  it('opens on control k and closes on escape', () => {
    palette.onKey(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    expect(palette.open()).toBe(true);

    palette.onKey(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(palette.open()).toBe(false);
  });

  it('ignores the arrow keys while it is shut', () => {
    palette.onKey(new KeyboardEvent('keydown', { key: 'ArrowDown' }));

    expect(palette.cursor()).toBe(0);
    expect(palette.open()).toBe(false);
  });

  it('moves the highlight down and wraps at the end', () => {
    palette.toggle();
    palette.onTerm('r');
    const count = palette.matches().length;
    expect(count).toBeGreaterThan(1);

    palette.move(1);
    expect(palette.cursor()).toBe(1);

    palette.cursor.set(count - 1);
    palette.move(1);
    expect(palette.cursor()).toBe(0);
  });

  it('wraps backwards from the top to the bottom', () => {
    palette.toggle();
    palette.onTerm('r');

    palette.move(-1);

    expect(palette.cursor()).toBe(palette.matches().length - 1);
  });

  it('does not move when nothing matches', () => {
    palette.toggle();
    palette.onTerm('zzzqqq');

    palette.move(1);

    expect(palette.cursor()).toBe(0);
    expect(palette.nothingFound()).toBe(true);
  });

  it('puts the highlight back to the top when the term changes', () => {
    palette.toggle();
    palette.onTerm('r');
    palette.move(1);
    palette.onTerm('re');

    expect(palette.cursor()).toBe(0);
  });

  it('shows a jump offer for something shaped like an asset tag', () => {
    palette.toggle();
    palette.onTerm('sg000101');

    expect(palette.tagJump()).toBe('SG-000101');
    expect(palette.nothingFound()).toBe(false);
  });

  it('looks the tag up and says so when nothing carries it', () => {
    palette.toggle();
    palette.onTerm('SG-999999');
    palette.run();

    http.expectOne((request) => request.url.includes('/instruments/by-tag/SG-999999')).flush(
      {
        code: 'registry/not-found',
        status: 404,
        detail: 'instrument SG-999999 does not exist',
        title: 'x',
        type: 't',
        timestamp: 'now',
      },
      { status: 404, statusText: 'Not Found' },
    );

    expect(notifications.notices()[0].headline).toBe('No instrument is tagged SG-999999');
    expect(palette.open()).toBe(true);
  });

  it('marks the characters that matched so they can be highlighted', () => {
    palette.toggle();
    palette.onTerm('rb');

    const match = palette.matches().find((entry) => entry.command.id === 'recalls');
    const parts = palette.highlighted(match!);

    expect(parts.filter((part) => part.hit).map((part) => part.text)).toEqual(['R', 'b']);
  });

  it('closes when a command is chosen', () => {
    palette.toggle();
    palette.go(palette.matches()[0].command);

    expect(palette.open()).toBe(false);
  });
});
