import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  formatDayFirst,
  formatShortDate,
  isIsoDate,
  makeIsoDate,
  parseDayFirstDate,
  toIsoDate,
  toLocalIsoDate,
} from './dates';

const reference = '2026-11-28';
const parse = (s: string) => parseDayFirstDate(s, { reference });

describe('date arithmetic', () => {
  it('adds days across month, year and leap-day boundaries', () => {
    expect(addDays('2026-11-28', 3)).toBe('2026-12-01');
    expect(addDays('2026-12-30', 2)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('is not affected by DST changes', () => {
    // UK clocks go back on 25 Oct 2026.
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
  });

  it('counts days between dates', () => {
    expect(daysBetween('2026-11-28', '2026-12-01')).toBe(3);
    expect(daysBetween('2026-12-01', '2026-11-28')).toBe(-3);
  });

  it('validates ISO dates', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('28/02/2026')).toBe(false);
    expect(makeIsoDate(2026, 2, 29)).toBeNull();
  });

  it('takes the date part of a timestamp', () => {
    expect(toIsoDate('2026-11-28T21:15:00.000Z')).toBe('2026-11-28');
    expect(() => toIsoDate('yesterday')).toThrow(RangeError);
  });

  it('uses the local calendar date', () => {
    expect(toLocalIsoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('parseDayFirstDate', () => {
  it.each([
    ['12/03/2026', '2026-03-12'],
    ['12.03.26', '2026-03-12'],
    ['1-3-2027', '2027-03-01'],
    ['04 12 2026', '2026-12-04'],
    ['2026-12-04', '2026-12-04'],
  ])('reads full numeric date %s', (input, expected) => {
    expect(parse(input)).toBe(expected);
  });

  it('never reads numeric dates month-first', () => {
    expect(parse('03/12/2026')).toBe('2026-12-03');
    expect(parse('12/31/2026')).toBeNull();
  });

  it.each([
    ['12 DEC', '2026-12-12'],
    ['12 Dec 2027', '2027-12-12'],
    ['12DEC26', '2026-12-12'],
    ['3rd January 2027', '2027-01-03'],
    ['12-Sept-2027', '2027-09-12'],
  ])('reads month-name date %s', (input, expected) => {
    expect(parse(input)).toBe(expected);
  });

  it.each([
    ['BB 03/27', '2027-03-31'],
    ['BBE 02/2028', '2028-02-29'],
    ['Best before end DEC 2027', '2027-12-31'],
    ['Feb-27', '2027-02-28'],
  ])('reads month-only date %s as the end of that month', (input, expected) => {
    expect(parse(input)).toBe(expected);
  });

  it.each([
    ['USE BY 12 DEC', '2026-12-12'],
    ['Use by: 02/12', '2026-12-02'],
    ['Best Before 15.01.27', '2027-01-15'],
    ['EXP 10/12/2026', '2026-12-10'],
    ['Display until 30 Nov', '2026-11-30'],
  ])('strips the printed label from %s', (input, expected) => {
    expect(parse(input)).toBe(expected);
  });

  it('fills a missing year with the nearest matching date', () => {
    expect(parse('02 JAN')).toBe('2027-01-02');
    expect(parse('20 Nov')).toBe('2026-11-20');
    expect(parseDayFirstDate('28 Dec', { reference: '2027-01-03' })).toBe('2026-12-28');
  });

  it.each(['', 'BB', '31/02/2026', '32 Dec', '13/13', 'soon', '12 Foo 2026'])(
    'returns null for %j',
    (input) => {
      expect(parse(input)).toBeNull();
    },
  );
});

describe('formatting', () => {
  it('formats short day-first labels', () => {
    expect(formatShortDate('2026-12-04', { reference })).toBe('4 Dec');
    expect(formatShortDate('2026-12-04', { reference, estimated: true })).toBe('~ 4 Dec');
    expect(formatShortDate('2027-01-09', { reference })).toBe('9 Jan 2027');
  });

  it('formats numeric day-first dates', () => {
    expect(formatDayFirst('2026-12-04')).toBe('04/12/2026');
  });
});
