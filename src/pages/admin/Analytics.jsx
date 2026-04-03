import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { getDaysInMonth, minutesToHHMM, monthLabel, todayKey } from '../../utils/calculations';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EF4444'];

export default function Analytics() {
  const [employees, setEmployees] = useState([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [attendance, setAttendance] = useState([]);
  const [schedules, setSchedules] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, [year, month]);

  const loadData = async () => {
    setLoading(true);
    const empSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'employee')));
    const emps = empSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    setEmployees(emps);

    const days = getDaysInMonth(year, month);
    const attSnap = await getDocs(query(collection(db, 'attendance'), where('date', '>=', days[0]), where('date', '<=', days[days.length - 1])));
    const att = attSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    setAttendance(att);

    const schSnap = await getDocs(query(collection(db, 'schedules'), where('date', '>=', days[0]), where('date', '<=', days[days.length - 1])));
    const schMap = {};
    schSnap.docs.forEach(d => {
      const data = d.data();
      if (!schMap[data.userId]) schMap[data.userId] = {};
      schMap[data.userId][data.date] = data;
    });
    setSchedules(schMap);
    setLoading(false);
  };

  // Per-employee stats — aggregate multiple sessions per day
  const today = todayKey();
  const empStats = employees.map(emp => {
    const empAtt = attendance.filter(a => a.userId === emp.id);
    const empSch = schedules[emp.id] || {};
    let totalWorked = 0, totalOT = 0, presentDays = 0, absentDays = 0, leaveDays = 0;
    const days = getDaysInMonth(year, month);

    days.forEach(day => {
      const daySessions = empAtt.filter(a => a.date === day);
      const completedSessions = daySessions.filter(s => s.checkIn && s.checkOut);
      const sch = empSch[day];
      const isOffDay = ['off', 'annual', 'sick', 'holiday'].includes(sch?.type);

      if (isOffDay) {
        if (completedSessions.length > 0) {
          // Worked on a day off/holiday — all hours count as OT
          const dayWorked = completedSessions.reduce((sum, s) => {
            const ci = s.checkIn?.toDate ? s.checkIn.toDate() : new Date(s.checkIn);
            const co = s.checkOut?.toDate ? s.checkOut.toDate() : new Date(s.checkOut);
            return sum + Math.round((co - ci) / 60000);
          }, 0);
          totalWorked += dayWorked;
          presentDays++;
          totalOT += dayWorked;
        } else {
          if (sch?.type !== 'off') leaveDays++;
        }
        return;
      }

      if (completedSessions.length > 0) {
        const dayWorked = completedSessions.reduce((sum, s) => {
          const ci = s.checkIn?.toDate ? s.checkIn.toDate() : new Date(s.checkIn);
          const co = s.checkOut?.toDate ? s.checkOut.toDate() : new Date(s.checkOut);
          return sum + Math.round((co - ci) / 60000);
        }, 0);
        totalWorked += dayWorked;
        presentDays++;
        if (sch?.type === 'work' && sch.startTime && sch.endTime) {
          const [sh, sm] = sch.startTime.split(':').map(Number);
          const [eh, em] = sch.endTime.split(':').map(Number);
          totalOT += dayWorked - ((eh * 60 + em) - (sh * 60 + sm));
        }
      } else if (sch?.type === 'work') {
        // Future days are unknown — never count as absent
        if (day < today) {
          absentDays++;
        } else if (day === today && sch.startTime) {
          // For today: only absent if more than 15 min past shift start with no check-in
          const now = new Date();
          const [sh, sm] = sch.startTime.split(':').map(Number);
          const nowMins = now.getHours() * 60 + now.getMinutes();
          if (nowMins > sh * 60 + sm + 15) absentDays++;
        }
        // day > today: skip — not yet known
      }
    });

    return { ...emp, totalWorked, totalOT, presentDays, absentDays, leaveDays };
  });

  // Daily attendance trend — deduplicated by userId, filtered to current employees only
  const days = getDaysInMonth(year, month);
  const employeeIdSet = new Set(employees.map(e => e.id));
  const dailyData = days.slice(0, 31).map(day => {
    const present = new Set(
      attendance.filter(a => a.date === day && a.checkIn && employeeIdSet.has(a.userId))
      .map(a => a.userId)
    ).size;
    return {
      day: new Date(day + 'T00:00:00').getDate().toString(),
      present,
    };
  });

  const otData = empStats.map(e => ({
    name: e.name?.split(' ')[0] || e.name,
    ot: Math.round(e.totalOT / 60 * 10) / 10,
    hours: Math.round(e.totalWorked / 60 * 10) / 10,
  }));

  const totalLeave = empStats.reduce((s, e) => s + e.leaveDays, 0);
  const totalPresent = empStats.reduce((s, e) => s + e.presentDays, 0);
  const totalAbsent = empStats.reduce((s, e) => s + e.absentDays, 0);
  const pieData = [
    { name: 'Present', value: totalPresent },
    { name: 'Absent', value: totalAbsent },
    { name: 'On Leave', value: totalLeave },
  ].filter(d => d.value > 0);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-surface-800 border border-surface-600 rounded-xl px-4 py-3 text-sm">
        <p className="text-white font-medium mb-1">{label}</p>
        {payload.map((p, i) => <p key={i} style={{color: p.color}}>{p.name}: {p.value}</p>)}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-gray-500 text-sm mt-0.5">Workforce insights and performance metrics</p>
        </div>
        <div className="flex gap-3">
          <select className="input-field" style={{width:'140px'}} value={month} onChange={e => setMonth(Number(e.target.value))}>
            {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{new Date(2000,m-1).toLocaleString('en',{month:'long'})}</option>)}
          </select>
          <select className="input-field" style={{width:'100px'}} value={year} onChange={e => setYear(Number(e.target.value))}>
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-4 border border-green-500/10">
              <p className="text-gray-500 text-xs uppercase tracking-wider">Total Present Days</p>
              <p className="text-3xl font-bold text-green-400 mt-1">{totalPresent}</p>
            </div>
            <div className="card p-4 border border-red-500/10">
              <p className="text-gray-500 text-xs uppercase tracking-wider">Total Absent Days</p>
              <p className="text-3xl font-bold text-red-400 mt-1">{totalAbsent}</p>
            </div>
            <div className="card p-4 border border-blue-500/10">
              <p className="text-gray-500 text-xs uppercase tracking-wider">Leave Days</p>
              <p className="text-3xl font-bold text-blue-400 mt-1">{totalLeave}</p>
            </div>
            <div className="card p-4 border border-amber-500/10">
              <p className="text-gray-500 text-xs uppercase tracking-wider">Total OT Balance</p>
              <p className={`text-3xl font-bold mt-1 ${empStats.reduce((s,e)=>s+e.totalOT,0) >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                {minutesToHHMM(empStats.reduce((s,e)=>s+e.totalOT,0))}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 card p-5">
              <h2 className="text-white font-semibold mb-4">Daily Attendance — {monthLabel(year, month)}</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dailyData} margin={{top:5,right:5,left:-20,bottom:5}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2535" />
                  <XAxis dataKey="day" tick={{fill:'#6b7280',fontSize:11}} axisLine={false} tickLine={false} />
                  <YAxis tick={{fill:'#6b7280',fontSize:11}} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="present" name="Present" fill="#F59E0B" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card p-5">
              <h2 className="text-white font-semibold mb-4">Attendance Breakdown</h2>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={3} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend formatter={(value) => <span style={{color:'#9ca3af',fontSize:'12px'}}>{value}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-48 text-gray-600 text-sm">No data for this period</div>
              )}
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-700">
              <h2 className="text-white font-semibold">Employee Summary — {monthLabel(year, month)}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-900">
                  <tr>
                    <th className="table-header">Employee</th>
                    <th className="table-header text-right">Present</th>
                    <th className="table-header text-right">Absent</th>
                    <th className="table-header text-right">Leave</th>
                    <th className="table-header text-right">Total Hours</th>
                    <th className="table-header text-right">OT Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {empStats.map(emp => (
                    <tr key={emp.id} className="hover:bg-surface-900/50 transition-colors">
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-xs font-bold">{emp.name?.[0]}</div>
                          <span className="text-white font-medium text-sm">{emp.name}</span>
                        </div>
                      </td>
                      <td className="table-cell text-right"><span className="text-green-400 font-medium">{emp.presentDays}</span></td>
                      <td className="table-cell text-right"><span className="text-red-400 font-medium">{emp.absentDays}</span></td>
                      <td className="table-cell text-right"><span className="text-blue-400 font-medium">{emp.leaveDays}</span></td>
                      <td className="table-cell text-right font-mono text-sm">{minutesToHHMM(emp.totalWorked)}</td>
                      <td className="table-cell text-right">
                        <span className={emp.totalOT >= 0 ? 'ot-positive' : 'ot-negative'}>
                          {emp.totalOT >= 0 ? '+' : ''}{minutesToHHMM(emp.totalOT)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {otData.length > 0 && (
            <div className="card p-5">
              <h2 className="text-white font-semibold mb-4">Hours Worked vs OT Balance per Employee</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={otData} margin={{top:5,right:5,left:-20,bottom:5}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2535" />
                  <XAxis dataKey="name" tick={{fill:'#9ca3af',fontSize:12}} axisLine={false} tickLine={false} />
                  <YAxis tick={{fill:'#6b7280',fontSize:11}} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="hours" name="Hours Worked" fill="#3B82F6" radius={[4,4,0,0]} />
                  <Bar dataKey="ot" name="OT (hrs)" fill="#F59E0B" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
