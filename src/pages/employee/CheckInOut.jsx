import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where, addDoc, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { todayKey, dateKey, minutesToHHMM } from '../../utils/calculations';

export default function CheckInOut() {
  const { user, profile } = useAuth();
  const [todayRecords, setTodayRecords] = useState([]);
  const [todaySchedule, setTodaySchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [now, setNow] = useState(new Date());
  const [manualMode, setManualMode] = useState(false);
  const [manualForm, setManualForm] = useState({ checkIn: '', checkOut: '', notes: '' });
  const [manualSaved, setManualSaved] = useState(false);
  const [error, setError] = useState('');
  const today = todayKey();

  // Yesterday's date key — for detecting midnight-crossing shifts
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = dateKey(yesterdayDate);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => { if (user) loadTodayData(); }, [user]);

  const loadTodayData = async () => {
    setLoading(true);
    try {
      // Load today's records
      const todaySnap = await getDocs(query(
        collection(db, 'attendance'),
        where('userId', '==', user.uid),
        where('date', '==', today)
      ));
      const todayRecs = todaySnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.checkIn?.toMillis?.() || 0) - (b.checkIn?.toMillis?.() || 0));

      // Also check yesterday for any unclosed shift (midnight-crossing session)
      const yestSnap = await getDocs(query(
        collection(db, 'attendance'),
        where('userId', '==', user.uid),
        where('date', '==', yesterday)
      ));
      const yestRecs = yestSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const overnightRecord = yestRecs.find(r => r.checkIn && !r.checkOut) || null;

      // Put the overnight record first if it exists (it's the "active" session)
      const allRecords = overnightRecord ? [overnightRecord, ...todayRecs] : todayRecs;
      setTodayRecords(allRecords);

      // Today's schedule
      const schSnap = await getDocs(query(
        collection(db, 'schedules'),
        where('userId', '==', user.uid),
        where('date', '==', today)
      ));
      setTodaySchedule(schSnap.empty ? null : schSnap.docs[0].data());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // Derived state
  const activeRecord = todayRecords.find(r => r.checkIn && !r.checkOut);

  // "Urgent Return" only makes sense for completions within TODAY.
  // A completed overnight (yesterday-dated) record closing after midnight is just a normal checkout —
  // it should NOT offer urgent return. New day = fresh start.
  const completedTodayRecords = todayRecords.filter(r => r.checkIn && r.checkOut && r.date === today);

  const isCheckedIn = !!activeRecord;
  const isOvernightShift = isCheckedIn && activeRecord?.date === yesterday; // active session from yesterday
  const isComplete = completedTodayRecords.length > 0 && !isCheckedIn;

  const handleCheckIn = async () => {
    setActionLoading(true); setError('');
    try {
      const nowTs = Timestamp.now();
      const isReturn = completedTodayRecords.length > 0;
      const docRef = await addDoc(collection(db, 'attendance'), {
        userId: user.uid,
        userName: profile?.name || '',
        date: today,           // always stamped with today's date
        checkIn: nowTs,
        checkOut: null,
        isManual: false,
        remarks: isReturn ? 'Urgent return' : '',
        sessionIndex: todayRecords.filter(r => r.date === today).length + 1,
        createdAt: nowTs,
      });
      setTodayRecords(prev => [...prev, {
        id: docRef.id, userId: user.uid, userName: profile?.name, date: today,
        checkIn: nowTs, checkOut: null, isManual: false,
        sessionIndex: todayRecords.filter(r => r.date === today).length + 1,
        remarks: isReturn ? 'Urgent return' : ''
      }]);
    } catch (e) { setError('Check-in failed. Please try again.'); }
    setActionLoading(false);
  };

  const handleCheckOut = async () => {
    if (!activeRecord?.id) return;
    setActionLoading(true); setError('');
    try {
      const nowTs = Timestamp.now();
      await updateDoc(doc(db, 'attendance', activeRecord.id), { checkOut: nowTs });
      setTodayRecords(prev => prev.map(r => r.id === activeRecord.id ? { ...r, checkOut: nowTs } : r));
    } catch (e) { setError('Check-out failed. Please try again.'); }
    setActionLoading(false);
  };

  const handleManualSubmit = async () => {
    if (!manualForm.checkIn) { setError('Check-in time is required.'); return; }
    setActionLoading(true); setError('');
    try {
      const [ciH, ciM] = manualForm.checkIn.split(':').map(Number);
      const checkInDate = new Date(today + 'T00:00:00');
      checkInDate.setHours(ciH, ciM, 0, 0);
      let checkOutDate = null;
      if (manualForm.checkOut) {
        const [coH, coM] = manualForm.checkOut.split(':').map(Number);
        checkOutDate = new Date(today + 'T00:00:00');
        checkOutDate.setHours(coH, coM, 0, 0);
      }
      const data = {
        userId: user.uid, userName: profile?.name || '',
        date: today,
        checkIn: Timestamp.fromDate(checkInDate),
        checkOut: checkOutDate ? Timestamp.fromDate(checkOutDate) : null,
        isManual: true,
        remarks: manualForm.notes || 'Manual entry by employee',
        sessionIndex: todayRecords.filter(r => r.date === today).length + 1,
        createdAt: Timestamp.now(),
      };
      const ref = await addDoc(collection(db, 'attendance'), data);
      setTodayRecords(prev => [...prev, { id: ref.id, ...data }]);
      setManualSaved(true);
      setManualMode(false);
      setManualForm({ checkIn: '', checkOut: '', notes: '' });
      setTimeout(() => setManualSaved(false), 4000);
    } catch (e) { setError('Failed to save. Please try again.'); }
    setActionLoading(false);
  };

  // Schedule display
  let scheduledLabel = '';
  let scheduledMins = 0;
  if (todaySchedule) {
    if (todaySchedule.type === 'work') {
      scheduledLabel = `${todaySchedule.startTime} – ${todaySchedule.endTime}`;
      const [sh, sm] = todaySchedule.startTime.split(':').map(Number);
      const [eh, em] = todaySchedule.endTime.split(':').map(Number);
      scheduledMins = (eh * 60 + em) - (sh * 60 + sm);
    } else if (todaySchedule.type === 'off') scheduledLabel = 'Day Off';
    else if (todaySchedule.type === 'annual') scheduledLabel = 'Annual Leave';
    else if (todaySchedule.type === 'sick') scheduledLabel = 'Sick Leave';
    else if (todaySchedule.type === 'holiday') scheduledLabel = todaySchedule.name || 'Holiday';
  }

  // Time calculations
  const activeCheckIn = activeRecord?.checkIn?.toDate ? activeRecord.checkIn.toDate()
    : activeRecord?.checkIn ? new Date(activeRecord.checkIn) : null;
  const activeElapsedMins = activeCheckIn ? Math.round((now - activeCheckIn) / 60000) : 0;

  const totalCompletedMins = completedTodayRecords.reduce((total, r) => {
    const ci = r.checkIn?.toDate ? r.checkIn.toDate() : new Date(r.checkIn);
    const co = r.checkOut?.toDate ? r.checkOut.toDate() : new Date(r.checkOut);
    return total + Math.round((co - ci) / 60000);
  }, 0);

  // For overnight shifts, total worked includes time since yesterday's check-in
  const totalWorkedMins = isOvernightShift
    ? activeElapsedMins
    : totalCompletedMins + (isCheckedIn ? activeElapsedMins : 0);

  // On off/leave days, all worked hours count as OT; on work days, OT = worked - scheduled
  const isOffDay = ['off', 'annual', 'sick', 'holiday'].includes(todaySchedule?.type);
  const otMins = isComplete
    ? (isOffDay ? totalCompletedMins : (scheduledMins ? totalCompletedMins - scheduledMins : null))
    : null;

  // Display times — first check-in is from the active/first session
  const displayFirstRecord = activeRecord || todayRecords.find(r => r.date === today);
  const firstCheckIn = displayFirstRecord?.checkIn?.toDate ? displayFirstRecord.checkIn.toDate()
    : displayFirstRecord?.checkIn ? new Date(displayFirstRecord.checkIn) : null;
  const lastCompleted = completedTodayRecords[completedTodayRecords.length - 1];
  const lastCheckOut = lastCompleted?.checkOut?.toDate ? lastCompleted.checkOut.toDate()
    : lastCompleted?.checkOut ? new Date(lastCompleted.checkOut) : null;

  // Sessions to display — today's records + overnight if still active
  const displaySessions = todayRecords.filter(r =>
    r.date === today || (r.date === yesterday && !r.checkOut)
  );

  const dayDisplay = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeDisplay = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // Status label
  let statusLabel = 'Not Checked In';
  if (isCheckedIn) {
    if (isOvernightShift) statusLabel = 'Currently Working — Overnight Shift';
    else if (completedTodayRecords.length > 0) statusLabel = 'Currently Working — Return Session';
    else statusLabel = 'Currently Working';
  } else if (isComplete) {
    statusLabel = 'Shift Complete';
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Date & clock */}
      <div className="text-center py-4">
        <p className="text-gray-500 text-sm">{dayDisplay}</p>
        <p className="text-5xl font-bold text-white mt-2 font-mono tracking-tight">
          {timeDisplay.slice(0,-3)}<span className="text-amber-500">{timeDisplay.slice(-3)}</span>
        </p>
      </div>

      {/* Schedule card */}
      {todaySchedule && (
        <div className={`card p-4 flex items-center gap-4 border ${
          todaySchedule.type === 'work' ? 'border-green-500/20' :
          todaySchedule.type === 'off' ? 'border-gray-500/20' : 'border-blue-500/20'
        }`}>
          <div className={`p-2.5 rounded-xl flex-shrink-0 ${
            todaySchedule.type === 'work' ? 'bg-green-500/10 text-green-400' :
            todaySchedule.type === 'off' ? 'bg-gray-500/10 text-gray-400' : 'bg-blue-500/10 text-blue-400'
          }`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
            </svg>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Today's Schedule</p>
            <p className={`font-semibold text-sm mt-0.5 ${
              todaySchedule.type === 'work' ? 'text-green-400' :
              todaySchedule.type === 'off' ? 'text-gray-400' : 'text-blue-400'
            }`}>{scheduledLabel}</p>
          </div>
        </div>
      )}

      {/* Overnight notice banner */}
      {isOvernightShift && (
        <div className="card p-3 border border-amber-500/20 bg-amber-500/5 flex items-center gap-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" className="flex-shrink-0">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
          </svg>
          <div>
            <p className="text-amber-400 text-sm font-medium">Overnight Shift in Progress</p>
            <p className="text-gray-500 text-xs mt-0.5">
              Shift started yesterday at {activeCheckIn ? activeCheckIn.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '--:--'}. Check out when done.
            </p>
          </div>
        </div>
      )}

      {/* Off-day attendance notice */}
      {isOffDay && (isCheckedIn || isComplete || completedTodayRecords.length > 0) && (
        <div className="card p-3 border border-amber-500/20 bg-amber-500/5 flex items-center gap-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" className="flex-shrink-0">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
          </svg>
          <p className="text-amber-400 text-sm">All hours worked today count as overtime (day off / holiday).</p>
        </div>
      )}

      {/* Main check in/out card */}
      <div className={`card p-8 text-center amber-glow border ${
        isCheckedIn ? 'border-green-500/30' : isComplete ? 'border-blue-500/20' : 'border-surface-600'
      }`}>
        <div className="flex justify-center mb-6">
          <div className={`relative w-24 h-24 rounded-full flex items-center justify-center border-4 ${
            isCheckedIn ? 'border-green-500 bg-green-500/10 checkin-pulse' :
            isComplete ? 'border-blue-500 bg-blue-500/10' : 'border-surface-600 bg-surface-700'
          }`}>
            {isCheckedIn ? (
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            ) : isComplete ? (
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
            ) : (
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
            )}
            {isCheckedIn && <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-surface-800" />}
          </div>
        </div>

        <p className="text-gray-500 text-sm mb-1">{statusLabel}</p>

        <div className="flex items-center justify-center gap-6 my-4">
          <div className="text-center">
            <p className="text-gray-600 text-xs mb-1">{isOvernightShift ? 'Started' : 'Check In'}</p>
            <p className={`text-xl font-bold font-mono ${firstCheckIn ? 'text-green-400' : 'text-gray-700'}`}>
              {firstCheckIn ? firstCheckIn.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
            </p>
            {isOvernightShift && (
              <p className="text-gray-600 text-xs mt-0.5">yesterday</p>
            )}
          </div>
          <div className="text-gray-700">→</div>
          <div className="text-center">
            <p className="text-gray-600 text-xs mb-1">{isCheckedIn ? 'Active' : 'Check Out'}</p>
            <p className={`text-xl font-bold font-mono ${lastCheckOut ? 'text-blue-400' : isCheckedIn ? 'text-amber-500/60' : 'text-gray-700'}`}>
              {isCheckedIn ? 'Active' : lastCheckOut ? lastCheckOut.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
            </p>
          </div>
        </div>

        {(firstCheckIn || isCheckedIn) && (
          <div className="mb-6">
            <p className="text-gray-500 text-xs mb-1">{isComplete ? 'Total worked' : 'Time elapsed'}</p>
            <p className="text-2xl font-bold text-white font-mono">{minutesToHHMM(totalWorkedMins)}</p>
            {otMins !== null && (
              <span className={`inline-block mt-2 ${otMins >= 0 ? 'ot-positive' : 'ot-negative'}`}>
                {otMins >= 0 ? '+' : ''}{minutesToHHMM(Math.abs(otMins))} {otMins >= 0 ? 'overtime' : 'undertime'}
              </span>
            )}
          </div>
        )}

        {/* Action buttons */}
        {!isComplete && (
          <div className="space-y-3">
            {!isCheckedIn && (
              <button
                onClick={handleCheckIn}
                disabled={actionLoading}
                className="btn-primary w-full py-4 text-base flex items-center justify-center gap-3"
              >
                {actionLoading
                  ? <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>}
                Check In
              </button>
            )}
            {isCheckedIn && (
              <button
                onClick={handleCheckOut}
                disabled={actionLoading}
                className="w-full py-4 text-base font-semibold rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 transition-all active:scale-95 flex items-center justify-center gap-3"
              >
                {actionLoading
                  ? <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>}
                Check Out
              </button>
            )}
          </div>
        )}

        {/* Shift complete — Urgent Return only for same-day completions */}
        {isComplete && (
          <div className="space-y-3">
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 text-blue-400 text-sm">
              Your shift for today is complete. See you tomorrow! 👋
            </div>
            <button
              onClick={handleCheckIn}
              disabled={actionLoading}
              className="w-full py-3 text-sm font-semibold rounded-xl bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/30 text-amber-400 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              {actionLoading
                ? <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>}
              Urgent Return — Check In Again
            </button>
          </div>
        )}
      </div>

      {/* Sessions summary — only show active overnight + today's sessions */}
      {displaySessions.length > 0 && (
        <div className="card p-4 space-y-2">
          <p className="text-gray-500 text-xs uppercase tracking-wider mb-3">
            Today's Sessions
            {displaySessions.filter(r => r.date === today).length > 1 && (
              <span className="ml-2 text-xs px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded font-medium">
                {displaySessions.filter(r => r.date === today).length} sessions
              </span>
            )}
          </p>
          {displaySessions.map((rec, idx) => {
            const isOvernight = rec.date === yesterday;
            const ci = rec.checkIn?.toDate ? rec.checkIn.toDate() : rec.checkIn ? new Date(rec.checkIn) : null;
            const co = rec.checkOut?.toDate ? rec.checkOut.toDate() : rec.checkOut ? new Date(rec.checkOut) : null;
            const sessionMins = ci && co ? Math.round((co - ci) / 60000) : ci ? Math.round((now - ci) / 60000) : 0;
            const isActive = ci && !co;
            // Count position among today-only sessions for label
            const todayIdx = displaySessions.filter((r, i) => r.date === today && i < idx).length;
            return (
              <div key={rec.id} className={`flex items-center justify-between p-3 rounded-lg ${
                isOvernight ? 'bg-amber-500/5 border border-amber-500/15' :
                todayIdx > 0 ? 'bg-amber-500/5 border border-amber-500/10' : 'bg-surface-900'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-green-400 animate-pulse' : 'bg-blue-400'}`} />
                  <span className="text-gray-400 text-xs">
                    {isOvernight ? '🌙 Overnight Shift' :
                     todayIdx === 0 ? 'Main Shift' :
                     `Urgent Return${todayIdx > 1 ? ` #${todayIdx}` : ''}`}
                    {rec.isManual && <span className="ml-1.5 text-amber-500/60">· Manual</span>}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="text-green-400">{ci ? ci.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                  <span className="text-gray-600">→</span>
                  <span className={isActive ? 'text-amber-500/60' : 'text-blue-400'}>
                    {co ? co.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'Active'}
                  </span>
                  <span className="text-gray-500 w-10 text-right">{minutesToHHMM(sessionMins)}</span>
                </div>
              </div>
            );
          })}
          {displaySessions.length > 1 && completedTodayRecords.length > 0 && (
            <div className="flex justify-between items-center pt-2 border-t border-surface-700 text-xs">
              <span className="text-gray-500">Total worked today</span>
              <span className="font-mono text-amber-400 font-bold">{minutesToHHMM(totalWorkedMins)}</span>
            </div>
          )}
        </div>
      )}

      {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">{error}</div>}
      {manualSaved && (
        <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 4L12 14.01l-3-3"/></svg>
          Manual entry saved successfully.
        </div>
      )}

      {/* Manual entry */}
      <div>
        <button onClick={() => { setManualMode(p => !p); setError(''); }} className="w-full btn-secondary text-sm flex items-center justify-center gap-2">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          {manualMode ? 'Cancel Manual Entry' : 'Forgot to check in/out? Enter manually'}
        </button>
        {manualMode && (
          <div className="card p-5 mt-3 border border-amber-500/20 slide-up space-y-4">
            <p className="text-amber-400 text-sm font-medium">Manual Time Entry for Today</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Check In Time *</label>
                <input type="time" className="input-field" value={manualForm.checkIn} onChange={e => setManualForm(p => ({...p, checkIn: e.target.value}))} />
              </div>
              <div>
                <label className="label">Check Out Time</label>
                <input type="time" className="input-field" value={manualForm.checkOut} onChange={e => setManualForm(p => ({...p, checkOut: e.target.value}))} />
              </div>
            </div>
            <div>
              <label className="label">Reason / Notes</label>
              <input type="text" className="input-field" placeholder="e.g. Forgot to check in this morning" value={manualForm.notes} onChange={e => setManualForm(p => ({...p, notes: e.target.value}))} />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button onClick={handleManualSubmit} disabled={actionLoading} className="btn-primary w-full">
              {actionLoading ? 'Saving...' : 'Save Manual Entry'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
