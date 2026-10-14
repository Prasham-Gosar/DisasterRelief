import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { Button, Card, ErrorBanner, FormField, Input, Skeleton, Textarea, useToast } from '../../../components/ui';
import { LocationPicker } from '../../../components/map/LocationPicker';
import { ApiError } from '../../../lib/api';
import { errorMessage, useEditReport, useTrack } from '../api';
import { normalizePhone } from '../schemas';

/** Citizen edit of address, description and map pin. Allowed only while the report is "reported". */
export function TrackEditPage() {
  const { ref = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const carried = (useLocation().state as { phone?: string } | null)?.phone ?? '';

  const [phoneInput, setPhoneInput] = useState(carried);
  const [phone, setPhone] = useState(normalizePhone(carried) ?? '');
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const track = useTrack(ref.toUpperCase(), phone, phone !== '');
  const edit = useEditReport(ref.toUpperCase(), phone);

  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [errors, setErrors] = useState<{ location?: string; description?: string }>({});
  const [loaded, setLoaded] = useState(false);

  // fill the form once, when the report first arrives (not on every 15 s refresh)
  useEffect(() => {
    if (track.data && !loaded) {
      setLocation(track.data.location);
      setDescription(track.data.description);
      setLoaded(true);
    }
  }, [track.data, loaded]);

  const back = (
    <Link to="/track" state={phone ? { ref, phone } : undefined} className="inline-flex items-center gap-1 rounded text-sm font-medium text-brand-700 hover:underline focus-ring">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to tracking
    </Link>
  );

  // No phone yet (opened from a bookmark): ask for it, the same check as the track page
  if (!phone) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        {back}
        <Card>
          <form
            className="space-y-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const clean = normalizePhone(phoneInput);
              if (!clean) return setPhoneError('Enter the 10-digit mobile number you used when reporting.');
              setPhoneError(null);
              setPhone(clean);
            }}
          >
            <h1 className="text-xl font-bold text-gray-900">Edit {ref}</h1>
            <FormField label="Phone number" required error={phoneError ?? undefined}>
              {(p) => <Input {...p} type="tel" inputMode="tel" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} />}
            </FormField>
            <Button type="submit">Continue</Button>
          </form>
        </Card>
      </div>
    );
  }

  if (track.isPending) return <div className="mx-auto max-w-xl space-y-4">{back}<Card><Skeleton lines={5} /></Card></div>;

  if (track.isError || !track.data) {
    const notFound = track.error instanceof ApiError && track.error.status === 404;
    return (
      <div className="mx-auto max-w-xl space-y-4">
        {back}
        <ErrorBanner
          dismissible={false}
          message={notFound ? 'We could not find a report with that tracking number and phone number.' : errorMessage(track.error)}
        />
      </div>
    );
  }

  // Already reviewed: say so plainly instead of showing a form that cannot be saved
  if (!track.data.editable) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        {back}
        <ErrorBanner
          dismissible={false}
          message="This report has already been reviewed, so it can no longer be edited. If something urgent changed, call 112."
        />
      </div>
    );
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (location.trim().length < 3) next.location = 'Tell us where this is (at least 3 characters)';
    if (description.trim().length < 5) next.description = 'Please describe what is happening (at least 5 characters)';
    setErrors(next);
    if (next.location || next.description) return;
    edit.mutate(
      { location: location.trim(), description: description.trim(), ...(pin ? { latitude: pin.lat, longitude: pin.lng } : {}) },
      {
        onSuccess: () => {
          toast('success', 'Your report was updated.');
          navigate('/track', { state: { ref, phone } });
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {back}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Edit report</h1>
        <p className="text-sm text-gray-600">{track.data.tracking_ref}. Only the address, description and pin can be changed.</p>
      </div>
      <Card>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {edit.isError && <ErrorBanner dismissible={false} message={errorMessage(edit.error)} />}
          <FormField label="Address or landmark" required error={errors.location}>
            {(p) => <Input {...p} value={location} onChange={(e) => setLocation(e.target.value)} hasError={!!errors.location} />}
          </FormField>
          <FormField label="What is happening" required error={errors.description}>
            {(p) => <Textarea {...p} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} hasError={!!errors.description} />}
          </FormField>
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Move the map pin (optional)</p>
            <LocationPicker value={pin} onChange={setPin} />
          </div>
          <Button type="submit" loading={edit.isPending} className="w-full sm:w-auto">
            <Save className="h-4 w-4" aria-hidden="true" /> Save changes
          </Button>
        </form>
      </Card>
    </div>
  );
}
