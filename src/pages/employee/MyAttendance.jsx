import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { getDaysInMonth, minutesToHHMM, formatTime, dayOfWeek, monthLabel, todayKey } from '../../utils/calculations';

const BRANCH_LABELS = { verdun: 'Verdun', khaldeh: 'Khaldeh' };

export default function MyAttendance() {
  const { user, profile } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [attendance, setAttendance] = useState({});  // { date: [sessions] }
  const [schedules, setSchedules] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (user) loadData(); }, [user, year, month]);

  const loadData = async () => {
    setLoading(true);
    const days = getDaysInMonth(year, month);
    const attSnap = await getDocs(query(
      collection(db, 'attendance'),
      where('userId', '==', user.uid),
      where('date', '>=', days[0]),
      where('date', '<=', days[days.length - 1])
    ));
    // Group sessions by date (multiple sessions per day supported)
    const attByDate = {};
    attSnap.docs.forEach(d => {
      const data = { id: d.id, ...d.data() };
      if (!attByDate[data.date]) attByDate[data.date] = [];
      attByDate[data.date].push(data);
    });
    // Sort each day's sessions by checkIn time
    Object.keys(attByDate).forEach(date => {
      attByDate[date].sort((a, b) => (a.checkIn?.toMillis?.() || 0) - (b.checkIn?.toMillis?.() || 0));
    });
    setAttendance(attByDate);

    const schSnap = await getDocs(query(
      collection(db, 'schedules'),
      where('userId', '==', user.uid),
      where('date', '>=', days[0]),
      where('date', '<=', days[days.length - 1])
    ));
    const sch = {};
    schSnap.docs.forEach(d => { sch[d.data().date] = d.data(); });
    setSchedules(sch);
    setLoading(false);
  };

  const days = getDaysInMonth(year, month);
  const today = todayKey();

  // Compute stats — aggregate all completed sessions per day
  let totalWorked = 0, totalOT = 0, presentDays = 0, leaveDays = 0, offDays = 0;
  days.forEach(day => {
    // Skip future days entirely — we don't know yet what will happen
    if (day > today) return;

    const sessions = attendance[day] || [];
    const sch = schedules[day];
    const completedSessions = sessions.filter(s => s.checkIn && s.checkOut);
    const isOffDay = ['off', 'annual', 'sick', 'holiday'].includes(sch?.type);

    if (isOffDay) {
      if (completedSessions.length > 0) {
        // Employee worked on a day off/holiday — all hours count as OT
        const dayWorked = completedSessions.reduce((sum, s) => {
          const ci = s.checkIn?.toDate ? s.checkIn.toDate() : new Date(s.checkIn);
          const co = s.checkOut?.toDate ? s.checkOut.toDate() : new Date(s.checkOut);
          return sum + Math.round((co - ci) / 60000);
        }, 0);
        totalWorked += dayWorked;
        presentDays++;
        totalOT += dayWorked;
      } else {
        if (sch?.type === 'off') offDays++;
        else leaveDays++;
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
    }
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">My Attendance</h1>
          <p className="text-gray-500 text-sm mt-0.5">{profile?.name} — {monthLabel(year, month)}</p>
        </div>
        <div className="flex gap-3">
          <select className="input-field" style={{width:'130px'}} value={month} onChange={e => setMonth(Number(e.target.value))}>
            {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{new Date(2000,m-1).toLocaleString('en',{month:'long'})}</option>)}
          </select>
          <select className="input-field" style={{width:'100px'}} value={year} onChange={e => setYear(Number(e.target.value))}>
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4 border border-green-500/10">
          <p className="text-gray-500 text-xs uppercase tracking-wider">Days Present</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{presentDays}</p>
        </div>
        <div className="card p-4 border border-surface-600">
          <p className="text-gray-500 text-xs uppercase tracking-wider">Hours Worked</p>
          <p className="text-2xl font-bold text-white mt-1 font-mono">{minutesToHHMM(totalWorked)}</p>
        </div>
        <div className="card p-4 border border-blue-500/10">
          <p className="text-gray-500 text-xs uppercase tracking-wider">Leave Days</p>
          <p className="text-2xl font-bold text-blue-400 mt-1">{leaveDays}</p>
        </div>
        <div className={`card p-4 border ${totalOT >= 0 ? 'border-amber-500/20' : 'border-red-500/20'}`}>
          <p className="text-gray-500 text-xs uppercase tracking-wider">OT Balance</p>
          <p className={`text-2xl font-bold mt-1 font-mono ${totalOT >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
            {totalOT >= 0 ? '+' : ''}{minutesToHHMM(totalOT)}
          </p>
        </div>
      </div>

      {/* Day-by-day list */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="bg-surface-900">
                <tr>
                  <th className="table-header">Date</th>
                  <th className="table-header">Check In</th>
                  <th className="table-header">Check Out</th>
                  <th className="table-header">Hours</th>
                  <th className="table-header">Scheduled</th>
                  <th className="table-header">OT / Short</th>
                  <th className="table-header">Notes</th>
                </tr>
              </thead>
              <tbody>
                {days.map(day => {
                  const sessions = attendance[day] || [];
                  const sch = schedules[day];
                  const dow = dayOfWeek(day);
                  const dateD = new Date(day + 'T00:00:00');
                  const dateLabel = dateD.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                  const isFuture = day > today;
                  const isToday = day === today;

                  // Aggregate sessions
                  const completedSessions = sessions.filter(s => s.checkIn && s.checkOut);
                  const activeSession = sessions.find(s => s.checkIn && !s.checkOut);
                  const hasMultipleSessions = sessions.length > 1;

                  // First check-in, last check-out across all sessions
                  const firstSession = sessions[0];
                  const lastCompletedSession = completedSessions[completedSessions.length - 1];

                  const firstCi = firstSession?.checkIn?.toDate ? firstSession.checkIn.toDate()
                    : firstSession?.checkIn ? new Date(firstSession.checkIn) : null;
                  const lastCo = lastCompletedSession?.checkOut?.toDate ? lastCompletedSession.checkOut.toDate()
                    : lastCompletedSession?.checkOut ? new Date(lastCompletedSession.checkOut) : null;

                  const totalWorkedMins = completedSessions.reduce((sum, s) => {
                    const ci = s.checkIn?.toDate ? s.checkIn.toDate() : new Date(s.checkIn);
                    const co = s.checkOut?.toDate ? s.checkOut.toDate() : new Date(s.checkOut);
                    return sum + Math.round((co - ci) / 60000);
                  }, 0);

                  let otMins = null;
                  if (completedSessions.length > 0) {
                    if (sch?.type === 'work' && sch.startTime && sch.endTime) {
                      const [sh, sm] = sch.startTime.split(':').map(Number);
                      const [eh, em] = sch.endTime.split(':').map(Number);
                      otMins = totalWorkedMins - ((eh * 60 + em) - (sh * 60 + sm));
                    } else if (['off', 'annual', 'sick', 'holiday'].includes(sch?.type)) {
                      otMins = totalWorkedMins; // all hours are OT on a day off/holiday
                    }
                  }

                  let schLabel = '';
                  if (sch?.type === 'work') schLabel = `${sch.startTime}–${sch.endTime}`;
                  else if (sch?.type === 'off') schLabel = 'Off';
                  else if (sch?.type === 'annual') schLabel = 'Annual';
                  else if (sch?.type === 'sick') schLabel = 'Sick';
                  else if (sch?.type === 'holiday') schLabel = sch.name || 'Holiday';

                  const isOff = ['off', 'annual', 'sick', 'holiday'].includes(sch?.type);

                  // Branch note: check any session in this day
                  const branchNote = sessions.find(s => s.branchNote)?.branchNote;

                  // Notes: remarks from first session, or branch note
                  const primaryRemarks = firstSession?.remarks || '';

                  return (
                    <tr key={day} className={`${isToday ? 'bg-amber-500/3 border-l-2 border-l-amber-500' : ''} ${isFuture || (isOff && !sessions.length) ? 'opacity-40' : ''} hover:bg-surface-900/50 transition-colors`}>
                      <td className="table-cell">
                        <div>
                          <span className="font-medium text-white text-sm">{dateLabel}</span>
                          <span className={`text-xs ml-1.5 ${isToday ? 'text-amber-400 font-bold' : 'text-gray-600'}`}>{dow}</span>
                          {isToday && <span className="ml-1.5 text-xs px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded font-medium">Today</span>}
                        </div>
                      </td>
                      <td className="table-cell font-mono text-xs">
                        {firstCi ? (
                          <span className={firstSession?.isManual ? 'text-amber-400' : 'text-green-400'}>
                            {firstCi.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                            {firstSession?.isManual && <span className="ml-1 text-amber-500/50 text-xs">M</span>}
                          </span>
                        ) : <span className="text-gray-700">–</span>}
                      </td>
                      <td className="table-cell font-mono text-xs">
                        {lastCo ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-blue-400">{lastCo.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                            {hasMultipleSessions && (
                              <span className="text-xs px-1.5 py-0.5 bg-amber-500/10 text-amber-400/80 border border-amber-500/15 rounded">{sessions.length}×</span>
                            )}
                          </div>
                        ) : activeSession ? (
                          <span className="text-amber-500/60 text-xs">Active</span>
                        ) : <span className="text-gray-700">–</span>}
                      </td>
                      <td className="table-cell font-mono text-sm">
                        {totalWorkedMins > 0 ? <span className="text-white">{minutesToHHMM(totalWorkedMins)}</span> : <span className="text-gray-700">–</span>}
                      </td>
                      <td className="table-cell text-xs">
                        {schLabel ? (
                          <span className={`px-2 py-0.5 rounded-md font-medium ${
                            sch?.type === 'work' ? 'text-gray-300' :
                            sch?.type === 'off' ? 'text-gray-500' :
                            sch?.type === 'annual' ? 'text-blue-400 bg-blue-500/10' :
                            sch?.type === 'sick' ? 'text-purple-400 bg-purple-500/10' :
                            'text-pink-400 bg-pink-500/10'
                          }`}>{schLabel}</span>
                        ) : <span className="text-gray-700">–</span>}
                      </td>
                      <td className="table-cell">
                        {otMins !== null ? (
                          <span className={otMins > 0 ? 'ot-positive' : otMins < 0 ? 'ot-negative' : 'ot-zero'}>
                            {otMins > 0 ? '+' : ''}{minutesToHHMM(otMins)}
                          </span>
                        ) : <span className="text-gray-700">–</span>}
                      </td>
                      <td className="table-cell text-xs max-w-[150px]">
                        <div className="space-y-1">
                          {branchNote && (
                            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium ${branchNote.branch === 'verdun' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'}`}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                              {BRANCH_LABELS[branchNote.branch]}
                              {branchNote.doubleTransport && <span className="text-xs opacity-75">· 2x</span>}
                              {(branchNote.fromTime || branchNote.toTime) && (
                                <span className="text-xs opacity-60 font-mono">
                                  {branchNote.fromTime && ` ${branchNote.fromTime}`}{branchNote.toTime && `–${branchNote.toTime}`}
                                </span>
                              )}
                            </div>
                          )}
                          {primaryRemarks && !branchNote && <span className="text-gray-500 truncate block">{primaryRemarks}</span>}
                          {primaryRemarks && branchNote && <span className="text-gray-600 truncate block text-xs">{primaryRemarks}</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-surface-900 border-t-2 border-amber-500/20">
                  <td className="table-cell font-bold text-white">TOTAL</td>
                  <td className="table-cell" colSpan={2} />
                  <td className="table-cell font-bold font-mono text-amber-400">{minutesToHHMM(totalWorked)}</td>
                  <td className="table-cell" />
                  <td className="table-cell">
                    <span className={totalOT >= 0 ? 'ot-positive' : 'ot-negative'}>
                      {totalOT >= 0 ? '+' : ''}{minutesToHHMM(totalOT)}
                    </span>
                  </td>
                  <td className="table-cell" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
