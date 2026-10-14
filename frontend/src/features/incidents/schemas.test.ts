import { describe, expect, it } from 'vitest';
import { normalizePhone, photoProblem, reportSchema } from './schemas';

const base = {
  incident_type: 'flood',
  location: 'Near Andheri subway',
  severity: 'high',
  description: 'Water rising fast',
  reporter_phone: '98765 43210',
  water_level: 'Knee-deep',
} as const;

const messages = (input: unknown) => {
  const r = reportSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('normalizePhone', () => {
  it('accepts common Indian formats', () => {
    expect(normalizePhone('98765 43210')).toBe('9876543210');
    expect(normalizePhone('+91 98765-43210')).toBe('9876543210');
    expect(normalizePhone('919876543210')).toBe('9876543210');
    expect(normalizePhone('09876543210')).toBe('9876543210');
  });
  it('rejects anything else', () => {
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('5876543210')).toBeNull(); // must start 6-9
    expect(normalizePhone('abc')).toBeNull();
  });
});

describe('reportSchema', () => {
  it('accepts a complete flood report', () => {
    expect(messages(base)).toEqual([]);
  });
  it('requires the field that belongs to the incident type', () => {
    expect(messages({ ...base, water_level: undefined })).toContain('water_level: Please choose the water level');
    expect(messages({ ...base, incident_type: 'fire', water_level: undefined })).toContain('structure_type: Please choose what is burning');
    expect(messages({ ...base, incident_type: 'medical', water_level: undefined })).toContain('casualty_count: Please enter how many people are hurt');
    expect(messages({ ...base, incident_type: 'medical', water_level: undefined, casualty_count: 0 })).toEqual([]);
  });
  it('rejects short text and a bad phone with human messages', () => {
    const out = messages({ ...base, location: 'ab', description: 'abc', reporter_phone: '123' });
    expect(out).toContain('location: Tell us where this is (at least 3 characters)');
    expect(out).toContain('description: Please describe what is happening (at least 5 characters)');
    expect(out).toContain('reporter_phone: Enter a valid 10-digit Indian mobile number');
  });
  it('requires a phone number', () => {
    expect(messages({ ...base, reporter_phone: '' })).toContain('reporter_phone: Phone number is required so we can update you');
  });
});

describe('photoProblem', () => {
  const file = (name: string, type: string, size: number) => new File([new Uint8Array(size)], name, { type });
  it('accepts a normal jpeg', () => expect(photoProblem(file('a.jpg', 'image/jpeg', 1000))).toBeNull());
  it('rejects a pdf', () => expect(photoProblem(file('a.pdf', 'application/pdf', 1000))).toMatch(/not a JPEG/));
  it('rejects a file over 5 MB', () => expect(photoProblem(file('big.png', 'image/png', 5 * 1024 * 1024 + 1))).toMatch(/larger than 5 MB/));
});
