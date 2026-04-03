import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';

import Login from './pages/Login';
import AdminLayout from './pages/admin/AdminLayout';
import Overview from './pages/admin/Overview';
import AttendanceLog from './pages/admin/AttendanceLog';
import ScheduleManager from './pages/admin/ScheduleManager';
import EmployeeManager from './pages/admin/EmployeeManager';
import HolidayManager from './pages/admin/HolidayManager';
import Analytics from './pages/admin/Analytics';
import Settings from './pages/admin/Settings';
import EmployeeLayout from './pages/employee/EmployeeLayout';
import CheckInOut from './pages/employee/CheckInOut';
import MyAttendance from './pages/employee/MyAttendance';

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-950">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children, allowedRole }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user || !profile) return <Navigate to="/login" replace />;
  if (allowedRole && profile.role !== allowedRole) {
    return <Navigate to={profile.role === 'admin' ? '/admin' : '/employee'} replace />;
  }
  return children;
}

function RootRedirect() {
  const { user, profile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user || !profile) return <Navigate to="/login" replace />;
  return <Navigate to={profile.role === 'admin' ? '/admin' : '/employee'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />

          {/* Admin routes */}
          <Route path="/admin" element={
            <ProtectedRoute allowedRole="admin">
              <AdminLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Overview />} />
            <Route path="attendance" element={<AttendanceLog />} />
            <Route path="schedule" element={<ScheduleManager />} />
            <Route path="employees" element={<EmployeeManager />} />
            <Route path="holidays" element={<HolidayManager />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          {/* Employee routes */}
          <Route path="/employee" element={
            <ProtectedRoute allowedRole="employee">
              <EmployeeLayout />
            </ProtectedRoute>
          }>
            <Route index element={<CheckInOut />} />
            <Route path="attendance" element={<MyAttendance />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
