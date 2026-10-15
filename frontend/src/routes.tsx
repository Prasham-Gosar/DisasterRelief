import { Routes, Route, Outlet, Navigate } from 'react-router-dom';
import { PublicShell } from './components/layout/PublicShell';
import { AppShell } from './components/layout/AppShell';
import { RequireRole } from './components/layout/RequireRole';

// Public pages
import { HomePage } from './features/incidents/pages/HomePage';
import { LoginPage } from './features/auth/pages/LoginPage';
import { ReportPage } from './features/incidents/pages/ReportPage';
import { ReportSuccessPage } from './features/incidents/pages/ReportSuccessPage';
import { TrackPage } from './features/incidents/pages/TrackPage';
import { TrackEditPage } from './features/incidents/pages/TrackEditPage';
import { NotFoundPage } from './features/auth/pages/NotFoundPage';

// Coordinator pages
import { IncidentListPage } from './features/incidents/pages/IncidentListPage';
import { IncidentDetailPage } from './features/incidents/pages/IncidentDetailPage';
import { DispatchConsolePage } from './features/dispatch/pages/DispatchConsolePage';
import { OperationsBoardPage } from './features/dispatch/pages/OperationsBoardPage';
import { OperationsMapPage } from './features/dispatch/pages/OperationsMapPage';
import { TeamsPage } from './features/dispatch/pages/TeamsPage';
import { TeamDetailPage } from './features/dispatch/pages/TeamDetailPage';

// Rescue Team pages
import { RescueTeamDashboard } from './features/rescue/pages/RescueTeamDashboard';

// Shared pages
import { NotificationsPage } from './features/notifications/NotificationsPage';

// Dev pages
import { DevMapPage } from './features/map/DevMapPage';

export function AppRoutes() {
  return (
    <Routes>
      {/* Public routes (no auth required) */}
      <Route element={<PublicShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/report" element={<ReportPage />} />
        <Route path="/report/success" element={<ReportSuccessPage />} />
        <Route path="/track" element={<TrackPage />} />
        <Route path="/track/:ref/edit" element={<TrackEditPage />} />
      </Route>

      <Route path="/login" element={<LoginPage />} />

      {/* Authenticated App routes */}
      <Route element={<AppShell />}>

        {/* Any logged-in user */}
        <Route
          path="/notifications"
          element={
            <RequireRole allowed={['citizen', 'coordinator', 'rescue_team_member', 'system_administrator', 'volunteer']}>
              <NotificationsPage />
            </RequireRole>
          }
        />

        {/* Coordinator routes */}
        <Route
          path="/coordinator"
          element={
            <RequireRole allowed={['coordinator', 'system_administrator']}>
              <Outlet />
            </RequireRole>
          }
        >
          <Route index element={<Navigate to="incidents" replace />} />
          <Route path="incidents" element={<IncidentListPage />} />
          <Route path="incidents/:id" element={<IncidentDetailPage />} />
          <Route path="dispatch/:incidentId" element={<DispatchConsolePage />} />
          <Route path="operations" element={<OperationsBoardPage />} />
          <Route path="map" element={<OperationsMapPage />} />
          <Route path="teams" element={<TeamsPage />} />
          <Route path="teams/:id" element={<TeamDetailPage />} />
        </Route>

        {/* Rescue Team routes */}
        <Route
          path="/team"
          element={
            <RequireRole allowed={['rescue_team_member']}>
              <Outlet />
            </RequireRole>
          }
        >
          <Route index element={<RescueTeamDashboard />} />
        </Route>

        {/* Dev only routes */}
        {import.meta.env.DEV && <Route path="/dev/map" element={<DevMapPage />} />}

      </Route>

      {/* 404 Catch-all */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}