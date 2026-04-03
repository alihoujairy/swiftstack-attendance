import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { todayKey, minutesToReadable, minutesToHHMM, formatTime } from '../../utils/calculations';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

function KPICard({ label, value, sub, color = 'amber', icon }) {
  const colors = {
    amber: 'border-amber-500/20 bg-amber-500/5',
    green: 'border-green-500/20 bg-green-500/5',
    red: 'border-red-500/20 bg-red-500/5',
    blue: 'border-blue-500/20 bg-blue-500/5',
    gray: 'border-gray-500/20 bg-gray-500/5',
  };
  const textColors = {
    amber: 'text-amber-400', green: 'text-green-400', red: 'text-red-400',
    blue: 'text-blue-400', gray: 'text-gray-400',
  };
  return (
    <div className={`card p-5 border ${colors[color]} slide-up`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">{label}</p>
          <p className={`text-3xl font-bold ${textColors[color]}`}>{value}</p>
          {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-xl ${colors[color]} ${textColors[color]}`}>{icon}</div>
      </div>
    </div>
  );
}

export default function Overview() {
  const [employees, setEmployees] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState([]);
  const [todaySchedule, setTodaySchedule] = useState({});
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const today = todayKey();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load employees
      const empSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'employee')));
      const emps = empSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setEmployees(emps);

      // Load today's attendance
      const attSnap = await getDocs(query(collection(db, 'attendance'), where('date', '==', today)));
      const att = attSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTodayAttendance(att);

      // Load today's schedule for all employees
      const schSnap = await getDocs(query(collection(db, 'schedules'), where('date', '==', today)));
      const schMap = {};
      schSnap.docs.forEach(d => { schMap[d.data().userId] = d.data(); });
      setTodaySchedule(schMap);

      // Load recent activity (last 10 attendance records)
      const recentSnap = await getDocs(query(collection(db, 'attendance'), where('date', '==', today)));
      const recent = recentSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      recent.sort((a, b) => {
        const aTime = a.checkIn?.toMillis?.() || 0;
        const bTime = b.checkIn?.toMillis?.() || 0;
        return bTime - aTime;
      });
      setRecentActivity(recent.slice(0, 8));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  // Calculate KPIs
  const totalEmployees = employees.length;
  const employeeIds = new Set(employees.map(emp => emp.id));

  // Keep only attendance rows that belong to current employees, then collapse duplicates
  // so each employee is counted once on the overview cards. When multiple records exist
  // for the same employee on the same day, keep the latest one.
  const attendanceByUser = todayAttendance.reduce((acc, att) => {
    if (!att?.userId || !employeeIds.has(att.userId)) return acc;

    const currentTime = att.checkOut?.toMillis?.() || att.checkIn?.toMillis?.() || 0;
    const existingTime = acc[att.userId]?.checkOut?.toMillis?.() || acc[att.userId]?.checkIn?.toMillis?.() || 0;

    if (!acc[att.userId] || currentTime >= existingTime) {
      acc[att.userId] = att;
    }

    return acc;
  }, {});

  const uniqueTodayAttendance = Object.values(attendanceByUser);
  const presentToday = uniqueTodayAttendance.filter(a => a.checkIn).length;
  const checkedOutToday = uniqueTodayAttendance.filter(a => a.checkIn && a.checkOut).length;
  const onLeaveToday = Object.values(todaySchedule).filter(s => ['annual', 'sick', 'holiday'].includes(s.type)).length;
  const offToday = Object.values(todaySchedule).filter(s => s.type === 'off').length;
  const absentToday = Math.max(0, totalEmployees - presentToday - onLeaveToday - offToday);

  // Late arrivals (checked in more than 15 min after scheduled start)
  let lateCount = 0;
  uniqueTodayAttendance.forEach(att => {
    const sch = todaySchedule[att.userId];
    if (sch?.type === 'work' && sch.startTime && att.checkIn) {
      const checkInD = att.checkIn.toDate ? att.checkIn.toDate() : new Date(att.checkIn);
      const checkInMins = checkInD.getHours() * 60 + checkInD.getMinutes();
      const [sh, sm] = sch.startTime.split(':').map(Number);
      if (checkInMins > sh * 60 + sm + 15) lateCount++;
    }
  });

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekData = weekDays.map(d => ({ day: d, present: Math.floor(Math.random() * totalEmployees), absent: 0 }));

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Loading dashboard...</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <p className="text-gray-500 text-sm mt-1">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Present Today"
          value={presentToday}
          sub={`of ${totalEmployees} employees`}
          color="green"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>}
        />
        <KPICard
          label="Absent"
          value={absentToday}
          sub="unexpected absences"
          color="red"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>}
        />
        <KPICard
          label="Late Arrivals"
          value={lateCount}
          sub=">15 min late"
          color="amber"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>}
        />
        <KPICard
          label="On Leave"
          value={onLeaveToday}
          sub={`${offToday} on day off`}
          color="blue"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
        />
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's employee status */}
        <div className="lg:col-span-2 card p-5">
          <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse2" />
            Today's Attendance
          </h2>
          <div className="space-y-2">
            {employees.length === 0 && (
              <p className="text-gray-500 text-sm py-8 text-center">No employees found. Add employees first.</p>
            )}
            {employees.map(emp => {
              const att = attendanceByUser[emp.id];
              const sch = todaySchedule[emp.id];
              let status = 'absent';
              let statusLabel = 'Absent';
              let timeInfo = '';

              if (sch?.type === 'off') { status = 'off'; statusLabel = 'Day Off'; }
              else if (sch?.type === 'annual') { status = 'leave'; statusLabel = 'Annual Leave'; }
              else if (sch?.type === 'sick') { status = 'leave'; statusLabel = 'Sick Leave'; }
              else if (sch?.type === 'holiday') { status = 'leave'; statusLabel = sch.name || 'Holiday'; }
              else if (att?.checkIn && att?.checkOut) {
                status = 'checked-out'; statusLabel = 'Completed';
                timeInfo = `${formatTime(att.checkIn)} – ${formatTime(att.checkOut)}`;
              } else if (att?.checkIn) {
                status = 'present'; statusLabel = 'Present';
                timeInfo = `In: ${formatTime(att.checkIn)}`;
              }

              const statusClasses = {
                present: 'status-present',
                'checked-out': 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
                absent: 'status-absent',
                off: 'status-off',
                leave: 'status-leave',
              };

              return (
                <div key={emp.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-900 hover:bg-surface-800 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-surface-700 border border-surface-600 flex items-center justify-center text-white font-semibold text-sm">
                      {emp.name?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{emp.name}</p>
                      {sch?.type === 'work' && (
                        <p className="text-gray-600 text-xs font-mono">{sch.startTime}–{sch.endTime}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {timeInfo && <p className="text-gray-500 text-xs font-mono hidden sm:block">{timeInfo}</p>}
                    <span className={`text-xs px-2.5 py-1 rounded-lg font-medium ${statusClasses[status]}`}>{statusLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick stats */}
        <div className="space-y-4">
          {/* Checked out */}
          <div className="card p-5">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-3">Completion Rate</p>
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-bold text-2xl">{presentToday > 0 ? Math.round((checkedOutToday / presentToday) * 100) : 0}%</span>
              <span className="text-gray-500 text-sm">{checkedOutToday}/{presentToday} checked out</span>
            </div>
            <div className="h-2 bg-surface-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-500"
                style={{ width: `${presentToday > 0 ? (checkedOutToday / presentToday) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Presence rate */}
          <div className="card p-5">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-3">Presence Rate</p>
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-bold text-2xl">
                {totalEmployees > 0 ? Math.round(((presentToday + onLeaveToday + offToday) / totalEmployees) * 100) : 0}%
              </span>
              <span className="text-gray-500 text-sm">accounted for</span>
            </div>
            <div className="h-2 bg-surface-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full transition-all duration-500"
                style={{ width: `${totalEmployees > 0 ? ((presentToday + onLeaveToday + offToday) / totalEmployees) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Total employees */}
          <div className="card p-5 border border-amber-500/10">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-3">Workforce</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{totalEmployees}</p>
                <p className="text-gray-500 text-xs">Total</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-400">{presentToday}</p>
                <p className="text-gray-500 text-xs">Active</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
