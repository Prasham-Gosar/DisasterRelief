import { Link } from 'react-router-dom';
import { Siren, Search, ShieldCheck, Users, Phone } from 'lucide-react';

const HOW_IT_WORKS = [
  { icon: Siren, title: '1. You report', text: 'Tell us what is happening and where. It takes under a minute and needs no account.' },
  { icon: ShieldCheck, title: '2. We verify', text: 'A coordinator checks your report and confirms it is genuine.' },
  { icon: Users, title: '3. Help is sent', text: 'The nearest suitable rescue team is dispatched, and you can follow progress.' },
];

export function HomePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 py-4 text-center sm:py-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">Disaster Relief and Rescue Coordination</h1>
        <p className="text-gray-600">Report a flood, fire or medical emergency and get help moving quickly.</p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <Link
          to="/report"
          className="flex min-h-[64px] w-full items-center justify-center gap-3 rounded-ui bg-danger-600 px-6 text-xl font-bold text-white shadow-md hover:bg-danger-700 active:bg-danger-800 focus-ring sm:w-auto sm:min-w-[360px]"
        >
          <Siren className="h-6 w-6" aria-hidden="true" />
          Report an emergency
        </Link>
        <Link
          to="/track"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-ui px-4 font-medium text-brand-700 hover:bg-brand-50 focus-ring"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          Track my report
        </Link>
      </div>

      <p className="flex items-center justify-center gap-2 rounded-ui bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
        If someone's life is in immediate danger, call 112 first.
      </p>

      <ul className="grid gap-3 text-left sm:grid-cols-3">
        {HOW_IT_WORKS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="rounded-ui border border-gray-200 bg-white p-4 shadow-sm">
            <Icon className="mb-2 h-6 w-6 text-brand-600" aria-hidden="true" />
            <h2 className="font-semibold text-gray-900">{title}</h2>
            <p className="mt-1 text-sm text-gray-600">{text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
