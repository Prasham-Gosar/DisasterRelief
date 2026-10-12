import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Minus, Plus, Send } from 'lucide-react';
import { Button, Card, ErrorBanner, FormField, Input, Select, Textarea } from '../../../components/ui';
import { LocationPicker } from '../../../components/map/LocationPicker';
import { INCIDENT_TYPES, SEVERITIES } from '../../../lib/types';
import type { IncidentType, Severity } from '../../../lib/types';
import { incidentTypeLabel, severityLabel } from '../../../lib/format';
import { errorMessage, useCreateIncident } from '../api';
import { SEVERITY_HELP } from '../labels';
import { normalizePhone, reportSchema, STRUCTURE_TYPES, WATER_LEVELS } from '../schemas';
import type { ReportFormValues } from '../schemas';
import type { ReportPayload, ReportSuccessState } from '../types';
import { FormSteps } from '../components/FormSteps';
import { IncidentTypeIcon } from '../components/IncidentTypeIcon';
import { PhotoUploader } from '../components/PhotoUploader';

const STEP_LABELS = ['Type', 'Location', 'Details'];

const TYPE_HELP: Record<IncidentType, string> = {
  flood: 'Waterlogging, rising water',
  fire: 'Building, vehicle or forest fire',
  medical: 'Injury, collapse, urgent medical help',
};

const SEVERITY_STYLE: Record<Severity, { idle: string; selected: string }> = {
  low: { idle: 'border-gray-200 hover:border-green-400', selected: 'border-green-500 bg-green-50 ring-2 ring-green-500' },
  medium: { idle: 'border-gray-200 hover:border-amber-400', selected: 'border-amber-500 bg-amber-50 ring-2 ring-amber-500' },
  high: { idle: 'border-gray-200 hover:border-orange-400', selected: 'border-orange-500 bg-orange-50 ring-2 ring-orange-500' },
  critical: { idle: 'border-gray-200 hover:border-red-400', selected: 'border-red-500 bg-red-50 ring-2 ring-red-500' },
};

export function ReportPage() {
  const navigate = useNavigate();
  const create = useCreateIncident();
  const sending = useRef(false); // blocks a second click before React re-renders

  const [step, setStep] = useState(1);
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitError, setSubmitError] = useState<{ text: string; n: number } | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<ReportFormValues>({
    resolver: zodResolver(reportSchema),
    defaultValues: { location: '', description: '', reporter_name: '', reporter_phone: '' },
  });

  const type = watch('incident_type');
  const severity = watch('severity');
  const latitude = watch('latitude');
  const longitude = watch('longitude');
  const description = watch('description') ?? '';
  const casualtyCount = watch('casualty_count');

  // ── step navigation ──
  const goNext = async () => {
    const fields: (keyof ReportFormValues)[] = step === 1 ? ['incident_type'] : ['location', 'latitude', 'longitude'];
    if (await trigger(fields)) setStep((s) => s + 1);
  };

  const onPin = ({ lat, lng }: { lat: number; lng: number }) => {
    setValue('latitude', lat, { shouldValidate: true });
    setValue('longitude', lng, { shouldValidate: true });
    // be helpful: if the address box is still empty, fill it with the pin position
    if (!watch('location')?.trim()) {
      setValue('location', `Pinned on map (${lat.toFixed(5)}, ${lng.toFixed(5)})`, { shouldValidate: true });
    }
  };

  const pickType = (t: IncidentType) => {
    setValue('incident_type', t, { shouldValidate: true });
    // a flood must not carry fire fields (the API would answer 422), so clear the others
    if (t !== 'flood') setValue('water_level', undefined);
    if (t !== 'fire') setValue('structure_type', undefined);
    if (t !== 'medical') setValue('casualty_count', undefined);
  };

  // ── submit ──
  const onValid = async (values: ReportFormValues) => {
    if (sending.current) return; // double-submit protection
    sending.current = true;
    setSubmitError(null);

    const phone = normalizePhone(values.reporter_phone) ?? values.reporter_phone;
    const payload: ReportPayload = {
      incident_type: values.incident_type,
      location: values.location.trim(),
      severity: values.severity,
      description: values.description.trim(),
      reporter_phone: phone,
    };
    if (typeof values.latitude === 'number' && typeof values.longitude === 'number') {
      payload.latitude = values.latitude;
      payload.longitude = values.longitude;
    }
    if (values.reporter_name?.trim()) payload.reporter_name = values.reporter_name.trim();
    if (values.incident_type === 'flood') payload.water_level = values.water_level;
    if (values.incident_type === 'fire') payload.structure_type = values.structure_type;
    if (values.incident_type === 'medical') payload.casualty_count = values.casualty_count;

    try {
      const created = await create.mutateAsync({ payload, photos });
      const state: ReportSuccessState = { ...created, phone };
      navigate('/report/success', { state, replace: true });
    } catch (err) {
      setSubmitError({ text: errorMessage(err), n: Date.now() });
      sending.current = false; // let the person try again
    }
  };

  // if validation fails on the last step, jump back to the step that has the problem
  const onInvalid = (errs: typeof errors) => {
    if (errs.incident_type) setStep(1);
    else if (errs.location || errs.latitude || errs.longitude) setStep(2);
  };

  const onFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (step < 3) {
      void goNext(); // pressing Enter on steps 1 or 2 just moves forward
      return;
    }
    void handleSubmit(onValid, onInvalid)(e);
  };

  const busy = create.isPending;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Report an emergency</h1>
        <p className="mt-1 text-sm text-gray-600">No account needed. Only location, severity, description and your phone number are required.</p>
      </div>

      <FormSteps steps={STEP_LABELS} current={step} />

      <form onSubmit={onFormSubmit} noValidate>
        <Card className="space-y-5">
          {submitError && <ErrorBanner key={submitError.n} message={submitError.text} />}

          {/* ───────── Step 1: type ───────── */}
          {step === 1 && (
            <fieldset className="space-y-3">
              <legend className="text-lg font-semibold text-gray-900">What kind of emergency is it?</legend>
              <div role="radiogroup" aria-label="Type of emergency" className="grid gap-3 sm:grid-cols-3">
                {INCIDENT_TYPES.map((t) => {
                  const selected = type === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => pickType(t)}
                      className={`flex min-h-[96px] flex-row items-center gap-4 rounded-ui border-2 p-4 text-left focus-ring sm:flex-col sm:justify-center sm:text-center
                        ${selected ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-600' : 'border-gray-200 bg-white hover:border-brand-300'}`}
                    >
                      <IncidentTypeIcon type={t} className={`h-9 w-9 shrink-0 ${selected ? 'text-brand-600' : 'text-gray-500'}`} />
                      <span>
                        <span className="block text-base font-semibold text-gray-900">{incidentTypeLabel(t)}</span>
                        <span className="block text-xs text-gray-500">{TYPE_HELP[t]}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {errors.incident_type && <p className="text-sm text-danger-600" role="alert">{errors.incident_type.message}</p>}
            </fieldset>
          )}

          {/* ───────── Step 2: location ───────── */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Where is it happening?</h2>
              <LocationPicker
                value={typeof latitude === 'number' && typeof longitude === 'number' ? { lat: latitude, lng: longitude } : null}
                onChange={onPin}
              />
              <FormField label="Address or landmark" required hint="For example: Near Andheri subway, Mumbai" error={errors.location?.message}>
                {(p) => <Input {...p} {...register('location')} hasError={!!errors.location} autoComplete="street-address" />}
              </FormField>
              <p className="text-xs text-gray-500">Dropping a pin is optional but helps rescue teams find you faster.</p>
            </div>
          )}

          {/* ───────── Step 3: details ───────── */}
          {step === 3 && (
            <div className="space-y-5">
              <fieldset className="space-y-2">
                <legend className="text-lg font-semibold text-gray-900">
                  How serious is it? <span className="text-danger-500" aria-hidden="true">*</span>
                </legend>
                <div role="radiogroup" aria-label="Severity" className="grid grid-cols-2 gap-3">
                  {SEVERITIES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={severity === s}
                      onClick={() => setValue('severity', s, { shouldValidate: true })}
                      className={`min-h-[72px] rounded-ui border-2 p-3 text-left focus-ring ${severity === s ? SEVERITY_STYLE[s].selected : `bg-white ${SEVERITY_STYLE[s].idle}`}`}
                    >
                      <span className="block text-base font-semibold text-gray-900">{severityLabel(s)}</span>
                      <span className="block text-xs text-gray-600">{SEVERITY_HELP[s]}</span>
                    </button>
                  ))}
                </div>
                {errors.severity && <p className="text-sm text-danger-600" role="alert">{errors.severity.message}</p>}
              </fieldset>

              <FormField label="What is happening?" required error={errors.description?.message}>
                {(p) => (
                  <div>
                    <Textarea {...p} {...register('description')} hasError={!!errors.description} maxLength={1000} placeholder="Describe the situation in a few words" />
                    <p className="mt-1 text-right text-xs text-gray-500" aria-live="polite">{description.length}/1000</p>
                  </div>
                )}
              </FormField>

              {/* type-specific field */}
              {type === 'flood' && (
                <FormField label="How high is the water?" required error={errors.water_level?.message}>
                  {(p) => (
                    <Select {...p} {...register('water_level')} hasError={!!errors.water_level} defaultValue="">
                      <option value="" disabled>Choose one</option>
                      {WATER_LEVELS.map((w) => <option key={w} value={w}>{w}</option>)}
                    </Select>
                  )}
                </FormField>
              )}
              {type === 'fire' && (
                <FormField label="What is on fire?" required error={errors.structure_type?.message}>
                  {(p) => (
                    <Select {...p} {...register('structure_type')} hasError={!!errors.structure_type} defaultValue="">
                      <option value="" disabled>Choose one</option>
                      {STRUCTURE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  )}
                </FormField>
              )}
              {type === 'medical' && (
                <div className="space-y-1.5">
                  <span id="casualty-label" className="block text-sm font-medium text-gray-700">
                    How many people are hurt? <span className="text-danger-500" aria-hidden="true">*</span>
                  </span>
                  <div className="flex items-center gap-3" role="group" aria-labelledby="casualty-label">
                    <Button type="button" variant="secondary" aria-label="One fewer" onClick={() => setValue('casualty_count', Math.max(0, (casualtyCount ?? 1) - 1), { shouldValidate: true })}>
                      <Minus className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <span className="min-w-[3ch] text-center text-xl font-semibold" aria-live="polite">{casualtyCount ?? '-'}</span>
                    <Button type="button" variant="secondary" aria-label="One more" onClick={() => setValue('casualty_count', Math.min(1000, (casualtyCount ?? -1) + 1), { shouldValidate: true })}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                  {errors.casualty_count && <p className="text-xs text-danger-600" role="alert">{errors.casualty_count.message}</p>}
                </div>
              )}

              <FormField label="Your phone number" required hint="We send updates to this number. Used to track your report." error={errors.reporter_phone?.message}>
                {(p) => <Input {...p} {...register('reporter_phone')} hasError={!!errors.reporter_phone} type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" />}
              </FormField>

              <FormField label="Your name (optional)" error={errors.reporter_name?.message}>
                {(p) => <Input {...p} {...register('reporter_name')} hasError={!!errors.reporter_name} autoComplete="name" />}
              </FormField>

              <PhotoUploader files={photos} onChange={setPhotos} />
            </div>
          )}

          {/* ───────── buttons ───────── */}
          <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
            {step > 1 ? (
              <Button type="button" variant="secondary" onClick={() => setStep((s) => s - 1)} disabled={busy}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
              </Button>
            ) : <span />}

            {step < 3 ? (
              <Button type="button" onClick={() => void goNext()}>
                Next <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : (
              <Button type="submit" size="lg" loading={busy} disabled={busy}>
                {!busy && <Send className="h-4 w-4" aria-hidden="true" />}
                {busy ? 'Sending...' : 'Send report'}
              </Button>
            )}
          </div>
        </Card>
      </form>
    </div>
  );
}
