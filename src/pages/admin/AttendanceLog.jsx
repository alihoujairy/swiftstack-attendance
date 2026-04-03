import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where, doc, updateDoc, addDoc, Timestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { minutesToHHMM, formatTime, dateKey, getDaysInMonth, monthLabel, dayOfWeek } from '../../utils/calculations';
import { exportMonthlyAttendance } from '../../utils/exportExcel';

const BRANCHES = [
  { id: 'verdun', label: 'Verdun', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  { id: 'khaldeh', label: 'Khaldeh', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
];

function Modal({ show, onClose, title, children }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-surface-800 border border-surface-600 rounded-2xl p-6 w-full max-w-md slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function toTimeInputValue(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function combineDateAndTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [hours, minutes] = timeStr.split(':').map(Number);
  const date = new Date(`${dateStr}T00:00:00`);
  date.setHours(hours, minutes, 0, 0);
  return Timestamp.fromDate(date);
}

export default function AttendanceLog() {
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [schedules, setSchedules] = useState({});
  const [selectedEmployee, setSelectedEmployee] = useState('all');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(true);

  // Edit modal
  const [entryModal, setEntryModal] = useState(null);
  const [entryForm, setEntryForm] = useState({ checkIn: '', checkOut: '', remarks: '' });
  const [savingEntry, setSavingEntry] = useState(false);

  // Manual add modal
  const [manualModal, setManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({ userId: '', date: dateKey(new Date()), checkIn: '', checkOut: '', notes: '' });

  // Branch note modal
  const [branchModal, setBranchModal] = useState(null); // { primaryAtt, emp, day }
  const [branchForm, setBranchForm] = useState({ branch: 'verdun', doubleTransport: false, fromTime: '', toTime: '' });
  const [savingBranch, setSavingBranch] = useState(false);

  const [exportLoading, setExportLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { loadEmployees(); }, []);
  useEffect(() => { loadAttendance(); }, [year, month, selectedEmployee]);

  const loadEmployees = async () => {
    const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'employee')));
    setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const loadAttendance = async () => {
    setLoading(true);
    try {
      const days = getDaysInMonth(year, month);
      const attSnap = await getDocs(query(collection(db, 'attendance'), where('date', '>=', days[0]), where('date', '<=', days[days.length - 1])));
      let records = attSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (selectedEmployee !== 'all') records = records.filter(r => r.userId === selectedEmployee);
      setAttendance(records);

      const schSnap = await getDocs(query(collection(db, 'schedules'), where('date', '>=', days[0]), where('date', '<=', days[days.length - 1])));
      const schMap = {};
      schSnap.docs.forEach(d => {
        const data = d.data();
        if (!schMap[data.userId]) schMap[data.userId] = {};
        schMap[data.userId][data.date] = data;
      });
      setSchedules(schMap);
    } catch (e) { console.error(e); setError('Failed to load attendance records.'); }
    setLoading(false);
  };

  // Edit entry modal
  const openEntryModal = (record) => {
    setError(''); setSuccess('');
    setEntryModal(record);
    setEntryForm({ checkIn: toTimeInputValue(record?.checkIn), checkOut: toTimeInputValue(record?.checkOut), remarks: record?.remarks || '' });
  };

  const closeEntryModal = () => { setEntryModal(null); setEntryForm({ checkIn: '', checkOut: '', remarks: '' }); setSavingEntry(false); };

  const saveEntryChanges = async () => {
    if (!entryModal) return;
    if (!entryForm.checkIn) { setError('Check-in time is required.'); return; }
    setSavingEntry(true); setError('');
    try {
      const payload = {
        checkIn: combineDateAndTime(entryModal.date, entryForm.checkIn),
        checkOut: entryForm.checkOut ? combineDateAndTime(entryModal.date, entryForm.checkOut) : null,
        remarks: entryForm.remarks || '',
      };
      await updateDoc(doc(db, 'attendance', entryModal.id), payload);
      setAttendance(prev => prev.map(r => r.id === entryModal.id ? { ...r, ...payload } : r));
      setSuccess('Attendance entry updated.');
      closeEntryModal();
    } catch (e) { setError('Failed to update attendance entry.'); }
    setSavingEntry(false);
  };

  const deleteAttendanceEntry = async () => {
    if (!entryModal) return;
    if (!window.confirm(`Delete this entry for ${entryModal.userName || 'employee'} on ${entryModal.date}?`)) return;
    setSavingEntry(true); setError('');
    try {
      await deleteDoc(doc(db, 'attendance', entryModal.id));
      setAttendance(prev => prev.filter(r => r.id !== entryModal.id));
      setSuccess('Attendance entry deleted.');
      closeEntryModal();
    } catch (e) { setError('Failed to delete attendance entry.'); }
    setSavingEntry(false);
  };

  // Manual entry
  const handleManualEntry = async () => {
    const { userId, date, checkIn, checkOut, notes } = manualForm;
    if (!userId || !date || !checkIn) return;
    const emp = employees.find(e => e.id === userId);
    const [ciH, ciM] = checkIn.split(':').map(Number);
    const checkInDate = new Date(`${date}T00:00:00`);
    checkInDate.setHours(ciH, ciM, 0, 0);
    let checkOutDate = null;
    if (checkOut) {
      const [coH, coM] = checkOut.split(':').map(Number);
      checkOutDate = new Date(`${date}T00:00:00`);
      checkOutDate.setHours(coH, coM, 0, 0);
    }
    try {
      await addDoc(collection(db, 'attendance'), {
        userId, userName: emp?.name || '', date,
        checkIn: Timestamp.fromDate(checkInDate),
        checkOut: checkOutDate ? Timestamp.fromDate(checkOutDate) : null,
        isManual: true,
        remarks: notes || 'Manual entry by admin',
        createdAt: Timestamp.now(),
      });
      setSuccess('Manual attendance entry added.');
      setError('');
      setManualModal(false);
      setManualForm({ userId: '', date: dateKey(new Date()), checkIn: '', checkOut: '', notes: '' });
      loadAttendance();
    } catch (e) { setError('Failed to add manual attendance entry.'); }
  };

  // Branch note modal
  const openBranchModal = (row) => {
    const existingNote = row.primaryAtt?.branchNote;
    setBranchForm({
      branch: existingNote?.branch || 'verdun',
      doubleTransport: existingNote?.doubleTransport || false,
      fromTime: existingNote?.fromTime || '',
      toTime: existingNote?.toTime || '',
    });
    setBranchModal(row);
  };

  const saveBranchNote = async () => {
    if (!branchModal?.primaryAtt?.id) return;
    setSavingBranch(true);
    const note = {
      branch: branchForm.branch,
      doubleTransport: branchForm.doubleTransport,
      fromTime: branchForm.fromTime || null,
      toTime: branchForm.toTime || null,
    };
    try {
      await updateDoc(doc(db, 'attendance', branchModal.primaryAtt.id), { branchNote: note });
      setAttendance(prev => prev.map(r => r.id === branchModal.primaryAtt.id ? { ...r, branchNote: note } : r));
      setSuccess(`Branch note saved for ${branchModal.emp.name} on ${branchModal.day}.`);
      setBranchModal(null);
    } catch (e) { setError('Failed to save branch note.'); }
    setSavingBranch(false);
  };

  const clearBranchNote = async () => {
    if (!branchModal?.primaryAtt?.id) return;
    setSavingBranch(true);
    try {
      await updateDoc(doc(db, 'attendance', branchModal.primaryAtt.id), { branchNote: null });
      setAttendance(prev => prev.map(r => r.id === branchModal.primaryAtt.id ? { ...r, branchNote: null } : r));
      setSuccess('Branch note removed.');
      setBranchModal(null);
    } catch (e) { setError('Failed to clear branch note.'); }
    setSavingBranch(false);
  };

  // Export
  const handleExport = async () => {
    setExportLoading(true);
    const days = getDaysInMonth(year, month);
    const emps = selectedEmployee === 'all' ? employees : employees.filter(e => e.id === selectedEmployee);
    const attByEmp = {};
    const schByEmp = {};
    emps.forEach(emp => {
      attByEmp[emp.id] = {};
      schByEmp[emp.id] = {};
      attendance.filter(a => a.userId === emp.id).forEach(a => { attByEmp[emp.id][a.date] = a; });
      if (schedules[emp.id]) schByEmp[emp.id] = schedules[emp.id];
    });
    exportMonthlyAttendance({ employees: emps, attendanceByEmployee: attByEmp, scheduleByEmployee: schByEmp, days, monthLabel: monthLabel(year, month) });
    setExportLoading(false);
  };

  // Build rows — each session is its own row; empty days show one placeholder row
  const days = getDaysInMonth(year, month);
  const displayEmployees = selectedEmployee === 'all' ? employees : employees.filter(e => e.id === selectedEmployee);

  const rows = [];
  displayEmployees.forEach(emp => {
    days.forEach(day => {
      const sessions = attendance
        .filter(a => a.userId === emp.id && a.date === day)
        .sort((a, b) => (a.checkIn?.toMillis?.() || 0) - (b.checkIn?.toMillis?.() || 0));
      const sch = schedules[emp.id]?.[day];

      if (sessions.length === 0) {
        rows.push({ emp, day, att: null, sch, isReturn: false, sessionIdx: 0, totalSessions: 0, primaryAtt: null });
      } else {
        // Compute aggregated OT for first row
        const completedSessions = sessions.filter(s => s.checkIn && s.checkOut);
        const totalWorkedMins = completedSessions.reduce((sum, s) => {
          const ci = s.checkIn?.toDate ? s.checkIn.toDate() : new Date(s.checkIn);
          const co = s.checkOut?.toDate ? s.checkOut.toDate() : new Date(s.checkOut);
          return sum + Math.round((co - ci) / 60000);
        }, 0);
        let aggOTMins = null;
        if (completedSessions.length > 0 && sch?.type === 'work' && sch.startTime && sch.endTime) {
          const [sh, sm] = sch.startTime.split(':').map(Number);
          const [eh, em] = sch.endTime.split(':').map(Number);
          aggOTMins = totalWorkedMins - ((eh * 60 + em) - (sh * 60 + sm));
        }

        sessions.forEach((att, idx) => {
          rows.push({ emp, day, att, sch, isReturn: idx > 0, sessionIdx: idx, totalSessions: sessions.length, primaryAtt: sessions[0], aggOTMins, totalWorkedMins: idx === 0 ? totalWorkedMins : null });
        });
      }
    });
  });

  const getSingleSessionOT = (att, sch) => {
    if (!att?.checkIn || !att?.checkOut) return null;
    const ci = att.checkIn?.toDate ? att.checkIn.toDate() : new Date(att.checkIn);
    const co = att.checkOut?.toDate ? att.checkOut.toDate() : new Date(att.checkOut);
    const workedMins = Math.round((co - ci) / 60000);
    if (sch?.type !== 'work' || !sch.startTime || !sch.endTime) return { mins: null, worked: workedMins };
    const [sh, sm] = sch.startTime.split(':').map(Number);
    const [eh, em] = sch.endTime.split(':').map(Number);
    return { mins: workedMins - ((eh * 60 + em) - (sh * 60 + sm)), worked: workedMins };
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Attendance Log</h1>
          <p className="text-gray-500 text-sm mt-0.5">Full record of employee check-ins and hours</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setManualModal(true)} className="btn-secondary text-sm flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            Add Manual
          </button>
          <button onClick={handleExport} disabled={exportLoading} className="btn-primary text-sm flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            {exportLoading ? 'Exporting...' : 'Export Excel'}
          </button>
        </div>
      </div>

      {success && (
        <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
          {success}
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
        </div>
      )}

      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Employee</label>
          <select className="input-field" style={{width:'180px'}} value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}>
            <option value="all">All Employees</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Month</label>
          <select className="input-field" style={{width:'130px'}} value={month} onChange={e => setMonth(Number(e.target.value))}>
            {Array.from({length:12},(_,i)=>i+1).map(m => (
              <option key={m} value={m}>{new Date(2000,m-1,1).toLocaleString('en',{month:'long'})}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Year</label>
          <select className="input-field" style={{width:'100px'}} value={year} onChange={e => setYear(Number(e.target.value))}>
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px]">
            <thead className="bg-surface-900">
              <tr>
                <th className="table-header">Employee</th>
                <th className="table-header">Date</th>
                <th className="table-header">Check In</th>
                <th className="table-header">Check Out</th>
                <th className="table-header">Net Hours</th>
                <th className="table-header">Scheduled</th>
                <th className="table-header">OT / Short</th>
                <th className="table-header">Branch</th>
                <th className="table-header">Remarks</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="table-cell text-center py-12 text-gray-500">Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} className="table-cell text-center py-12 text-gray-500">No records found</td></tr>
              ) : rows.map(({ emp, day, att, sch, isReturn, sessionIdx, totalSessions, primaryAtt, aggOTMins, totalWorkedMins: rowWorkedMins }) => {
                const sessionOT = getSingleSessionOT(att, sch);
                const isOff = sch?.type === 'off' || sch?.type === 'annual' || sch?.type === 'sick' || sch?.type === 'holiday';
                const dow = dayOfWeek(day);
                const dateDisp = new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });

                let scheduledLabel = '';
                if (sch?.type === 'off') scheduledLabel = 'Off';
                else if (sch?.type === 'annual') scheduledLabel = 'Annual';
                else if (sch?.type === 'sick') scheduledLabel = 'Sick Leave';
                else if (sch?.type === 'holiday') scheduledLabel = sch.name || 'Holiday';
                else if (sch?.type === 'work') scheduledLabel = `${sch.startTime}–${sch.endTime}`;

                // Branch note from primary session
                const branchNote = primaryAtt?.branchNote;
                const branchDef = BRANCHES.find(b => b.id === branchNote?.branch);

                const rowKey = att ? `${att.id}` : `${emp.id}-${day}-empty`;

                return (
                  <tr key={rowKey} className={`hover:bg-surface-900/50 transition-colors ${isReturn ? 'bg-amber-500/3 border-l-2 border-l-amber-500/30' : ''} ${isOff && !att ? 'opacity-50' : ''}`}>
                    <td className="table-cell">
                      {isReturn ? (
                        <span className="flex items-center gap-1.5 text-amber-400/70 text-xs">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14l-4-4 4-4M5 10h11a4 4 0 010 8h-1"/></svg>
                          Urgent Return
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-white font-medium text-sm">{emp.name}</span>
                          {totalSessions > 1 && sessionIdx === 0 && (
                            <span className="text-xs px-1.5 py-0.5 bg-amber-500/10 text-amber-400/80 border border-amber-500/20 rounded">{totalSessions}×</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="table-cell">
                      {!isReturn && (
                        <>
                          <span className="font-mono text-xs text-gray-300">{dateDisp}</span>
                          <span className="text-gray-600 text-xs ml-1">({dow})</span>
                        </>
                      )}
                    </td>
                    <td className="table-cell font-mono text-xs">
                      {att?.checkIn ? (
                        <span className={`px-2 py-0.5 rounded-md ${att.isManual ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'text-green-400'}`}>
                          {formatTime(att.checkIn)}
                        </span>
                      ) : (isOff ? <span className="text-gray-600">–</span> : <span className="text-red-500/70">–</span>)}
                    </td>
                    <td className="table-cell font-mono text-xs">
                      {att?.checkOut ? (
                        <span className="text-blue-400">{formatTime(att.checkOut)}</span>
                      ) : att?.checkIn ? (
                        <span className="text-amber-500/70 text-xs">Active</span>
                      ) : <span className="text-gray-600">–</span>}
                    </td>
                    <td className="table-cell font-mono text-xs">
                      {/* For first row of a multi-session day, show aggregate total */}
                      {sessionIdx === 0 && rowWorkedMins != null && rowWorkedMins > 0 ? (
                        <span className="text-white">{minutesToHHMM(rowWorkedMins)}</span>
                      ) : sessionIdx > 0 && sessionOT?.worked ? (
                        <span className="text-gray-400">{minutesToHHMM(sessionOT.worked)}</span>
                      ) : sessionOT?.worked ? (
                        <span className="text-white">{minutesToHHMM(sessionOT.worked)}</span>
                      ) : <span className="text-gray-600">–</span>}
                    </td>
                    <td className="table-cell text-xs">
                      {!isReturn && scheduledLabel ? (
                        <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                          sch?.type === 'off' ? 'text-gray-400 bg-gray-500/10' :
                          sch?.type === 'annual' ? 'text-blue-400 bg-blue-500/10' :
                          sch?.type === 'sick' ? 'text-purple-400 bg-purple-500/10' :
                          sch?.type === 'holiday' ? 'text-pink-400 bg-pink-500/10' : 'text-gray-300'
                        }`}>{scheduledLabel}</span>
                      ) : <span className="text-gray-600">–</span>}
                    </td>
                    <td className="table-cell">
                      {/* OT: for first session show aggregate, for return sessions show their own */}
                      {sessionIdx === 0 && aggOTMins != null ? (
                        <span className={aggOTMins > 0 ? 'ot-positive' : aggOTMins < 0 ? 'ot-negative' : 'ot-zero'}>
                          {aggOTMins > 0 ? '+' : ''}{minutesToHHMM(aggOTMins)}
                        </span>
                      ) : sessionIdx > 0 && sessionOT?.mins != null ? (
                        <span className="text-gray-500 text-xs">{minutesToHHMM(sessionOT.worked)}</span>
                      ) : <span className="text-gray-600">–</span>}
                    </td>
                    <td className="table-cell">
                      {/* Branch note — only show on first row for the day */}
                      {!isReturn && (
                        <div className="flex items-center gap-2">
                          {branchNote && branchDef ? (
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md border font-medium ${branchDef.color}`}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                              {branchDef.label}
                              {branchNote.doubleTransport && <span className="opacity-70">· 2x</span>}
                            </span>
                          ) : null}
                          {primaryAtt && (
                            <button
                              onClick={() => openBranchModal({ primaryAtt, emp, day })}
                              title={branchNote ? 'Edit branch note' : 'Add branch note'}
                              className={`p-1.5 rounded-lg border transition-colors ${branchNote ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20' : 'border-surface-600 bg-surface-700 text-gray-500 hover:text-gray-300 hover:border-surface-500'}`}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="table-cell">
                      {att?.remarks ? <span className="text-gray-400 text-xs truncate max-w-[120px] inline-block">{att.remarks}</span> : <span className="text-gray-600">–</span>}
                    </td>
                    <td className="table-cell">
                      {att ? (
                        <button
                          onClick={() => openEntryModal(att)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15 transition-colors"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                          Edit
                        </button>
                      ) : <span className="text-gray-600 text-xs">–</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Entry Modal */}
      <Modal show={!!entryModal} onClose={closeEntryModal} title="Edit Attendance Entry">
        <p className="text-gray-500 text-sm mb-4">
          {entryModal?.userName} — <span className="font-mono">{entryModal?.date}</span>
          {entryModal?.sessionIndex > 1 && <span className="ml-2 text-amber-400/70 text-xs">(Return Session)</span>}
        </p>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Check In Time</label>
              <input type="time" className="input-field" value={entryForm.checkIn} onChange={e => setEntryForm(prev => ({ ...prev, checkIn: e.target.value }))} />
            </div>
            <div>
              <label className="label">Check Out Time</label>
              <input type="time" className="input-field" value={entryForm.checkOut} onChange={e => setEntryForm(prev => ({ ...prev, checkOut: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Remarks</label>
            <textarea className="input-field resize-none" rows={3} placeholder="Add notes or remarks..." value={entryForm.remarks} onChange={e => setEntryForm(prev => ({ ...prev, remarks: e.target.value }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <button onClick={saveEntryChanges} disabled={savingEntry} className="btn-primary sm:col-span-2">{savingEntry ? 'Saving...' : 'Save Changes'}</button>
            <button onClick={closeEntryModal} className="btn-secondary">Cancel</button>
          </div>
          <button onClick={deleteAttendanceEntry} disabled={savingEntry} className="w-full px-4 py-2.5 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/15 transition-colors text-sm font-medium">
            Delete Entry
          </button>
        </div>
      </Modal>

      {/* Manual Entry Modal */}
      <Modal show={manualModal} onClose={() => setManualModal(false)} title="Add Manual Entry">
        <div className="space-y-4">
          <div>
            <label className="label">Employee</label>
            <select className="input-field" value={manualForm.userId} onChange={e => setManualForm(p => ({...p, userId: e.target.value}))}>
              <option value="">Select employee...</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input-field" value={manualForm.date} onChange={e => setManualForm(p => ({...p, date: e.target.value}))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Check In Time</label>
              <input type="time" className="input-field" value={manualForm.checkIn} onChange={e => setManualForm(p => ({...p, checkIn: e.target.value}))} />
            </div>
            <div>
              <label className="label">Check Out Time</label>
              <input type="time" className="input-field" value={manualForm.checkOut} onChange={e => setManualForm(p => ({...p, checkOut: e.target.value}))} />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <input type="text" className="input-field" placeholder="Reason for manual entry..." value={manualForm.notes} onChange={e => setManualForm(p => ({...p, notes: e.target.value}))} />
          </div>
          <div className="flex gap-3">
            <button onClick={handleManualEntry} className="btn-primary flex-1">Add Entry</button>
            <button onClick={() => setManualModal(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Branch Note Modal */}
      <Modal show={!!branchModal} onClose={() => setBranchModal(null)} title="Branch Note">
        {branchModal && (
          <div className="space-y-5">
            <p className="text-gray-500 text-sm">
              <span className="text-white font-medium">{branchModal.emp.name}</span> — <span className="font-mono">{branchModal.day}</span>
            </p>

            {/* Branch selector */}
            <div>
              <label className="label mb-2">Branch Attended</label>
              <div className="grid grid-cols-2 gap-3">
                {BRANCHES.map(b => (
                  <button
                    key={b.id}
                    onClick={() => setBranchForm(p => ({ ...p, branch: b.id }))}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 font-medium transition-all ${
                      branchForm.branch === b.id
                        ? (b.id === 'verdun' ? 'border-purple-500 bg-purple-500/15 text-purple-300' : 'border-cyan-500 bg-cyan-500/15 text-cyan-300')
                        : 'border-surface-600 bg-surface-700 text-gray-400 hover:border-surface-500'
                    }`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Double transportation toggle */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-surface-900 border border-surface-700">
              <div>
                <p className="text-white text-sm font-medium">Double Transportation</p>
                <p className="text-gray-500 text-xs mt-0.5">Employee traveled to another branch</p>
              </div>
              <button
                onClick={() => setBranchForm(p => ({ ...p, doubleTransport: !p.doubleTransport }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${branchForm.doubleTransport ? 'bg-amber-500' : 'bg-surface-600'}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${branchForm.doubleTransport ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {/* Optional time range */}
            <div>
              <label className="label mb-2">Time at Branch <span className="text-gray-600 font-normal">(optional)</span></label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs">From</label>
                  <input type="time" className="input-field" value={branchForm.fromTime} onChange={e => setBranchForm(p => ({ ...p, fromTime: e.target.value }))} />
                </div>
                <div>
                  <label className="label text-xs">To</label>
                  <input type="time" className="input-field" value={branchForm.toTime} onChange={e => setBranchForm(p => ({ ...p, toTime: e.target.value }))} />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={saveBranchNote} disabled={savingBranch} className="btn-primary flex-1">
                {savingBranch ? 'Saving...' : 'Save Note'}
              </button>
              <button onClick={() => setBranchModal(null)} className="btn-secondary">Cancel</button>
            </div>

            {branchModal?.primaryAtt?.branchNote && (
              <button onClick={clearBranchNote} disabled={savingBranch} className="w-full px-4 py-2.5 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/15 transition-colors text-sm font-medium">
                Remove Branch Note
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
