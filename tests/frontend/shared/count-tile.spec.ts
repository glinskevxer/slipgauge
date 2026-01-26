import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CountTileComponent } from '@shared/components/count-tile.component';

@Component({
  standalone: true,
  imports: [CountTileComponent],
  template: `
    <sg-count-tile [count]="4" label="overdue" tone="bad" link="/recalls" hint="what is late" />
    <sg-count-tile [count]="0" label="due today" />
  `,
})
class HostComponent {}

describe('CountTileComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  function tiles(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.tile'));
  }

  it('shows the count and the label', () => {
    expect(tiles()[0].querySelector('.tile__count')?.textContent?.trim()).toBe('4');
    expect(tiles()[0].querySelector('.tile__label')?.textContent?.trim()).toBe('overdue');
  });

  it('carries the tone as an attribute rather than a class per state', () => {
    expect(tiles()[0].getAttribute('data-tone')).toBe('bad');
    expect(tiles()[1].getAttribute('data-tone')).toBe('neutral');
  });

  it('is a link only when it goes somewhere', () => {
    expect(tiles()[0].tagName).toBe('A');
    expect(tiles()[0].getAttribute('href')).toBe('/recalls');
    expect(tiles()[1].tagName).toBe('DIV');
  });

  it('puts the hint on the title, and nothing when there is none', () => {
    expect(tiles()[0].getAttribute('title')).toBe('what is late');
    expect(tiles()[1].getAttribute('title')).toBeNull();
  });

  it('shows a zero rather than hiding it', () => {
    expect(tiles()[1].querySelector('.tile__count')?.textContent?.trim()).toBe('0');
  });
});
