import { z } from 'zod';
import { INCIDENT_TYPES, SEVERITIES } from '../../lib/types';

export const WATER_LEVELS = ['Ankle-deep', 'Knee-deep', 'Waist-deep', 'Chest-deep or higher'] as const;
export const STRUCTURE_TYPES = [
  'Residential building',
  'Commercial building',
  'Factory / industrial',
  'Vehicle',
  'Grass / forest',
  'Other',
] as const;

export const MAX_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Same idea as the backend's normalize_phone(): accepts +91 / 91 / 0 prefixes,
 * spaces and dashes. Returns the clean 10 digits or null if it is not valid.
 */
export function normalizePhone(value: string): string | null {
  let digits = (value ?? '').replace(/[\s\-()]/g, '');
  if (digits.startsWith('+91')) digits = digits.slice(3);
  else if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export const reportSchema = z
  .object({
    incident_type: z.enum(INCIDENT_TYPES, { error: 'Please choose what kind of emergency this is' }),
    location: z
      .string()
      .trim()
      .min(3, 'Tell us where this is (at least 3 characters)')
      .max(255, 'Please keep the address under 255 characters'),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    severity: z.enum(SEVERITIES, { error: 'Please choose how serious it is' }),
    description: z
      .string()
      .trim()
      .min(5, 'Please describe what is happening (at least 5 characters)')
      .max(1000, 'Please keep the description under 1000 characters'),
    reporter_name: z.string().trim().max(120, 'Name is too long').optional(),
    reporter_phone: z
      .string()
      .trim()
      .min(1, 'Phone number is required so we can update you')
      .refine((v) => normalizePhone(v) !== null, 'Enter a valid 10-digit Indian mobile number'),
    water_level: z.string().optional(),
    structure_type: z.string().optional(),
    casualty_count: z.number().int().min(0).max(1000).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.incident_type === 'flood' && !val.water_level) {
      ctx.addIssue({ code: 'custom', path: ['water_level'], message: 'Please choose the water level' });
    }
    if (val.incident_type === 'fire' && !val.structure_type) {
      ctx.addIssue({ code: 'custom', path: ['structure_type'], message: 'Please choose what is burning' });
    }
    if (val.incident_type === 'medical' && val.casualty_count === undefined) {
      ctx.addIssue({ code: 'custom', path: ['casualty_count'], message: 'Please enter how many people are hurt' });
    }
  });

export type ReportFormValues = z.infer<typeof reportSchema>;

/** Check one photo; returns an error message or null if it is fine */
export function photoProblem(file: File): string | null {
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
    return `"${file.name}" is not a JPEG, PNG or WebP image.`;
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return `"${file.name}" is larger than 5 MB.`;
  }
  return null;
}
