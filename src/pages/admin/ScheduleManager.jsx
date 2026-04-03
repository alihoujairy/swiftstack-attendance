import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { getDaysInMonth, dayOfWeek, monthLabel, todayKey } from '../../utils/calculations';
import { exportSchedule } from '../../utils/exportExcel';

const SHIFT_TYPES = [
  { value: 'work', label: 'Work', color: 'text-green-400 bg-green-500/10 border-green-500/20' },
  { value: 'off', label: 'Off', color: 'text-gray-400 bg-gray-500/10 border-gray-500/20' },
  { value: 'annual', label: 'Annual', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  { value: 'sick', label: 'Sick', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  { value: 'holiday', label: 'Holiday', color: 'text-pink-400 bg-pink-500/10 border-pink-500/20' },
];

function CellEditor({ schedule, onSave, onDelete, onClose }) {
  const [type, setType] = useState(schedule?.type || 'work');
  const [startTime, setStartTime] = useState(schedule?.startTime || '07:00');
  const [endTime, setEndTime] = useState(schedule?.endTime || '16:30');
  const [holidayName, setHolidayName] = useState(schedule?.name || '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-surface-800 border border-surface-600 rounded-2xl p-6 w-full max-w-sm slide-up">
        <h3 className="text-white font-semibold mb-4">Edit Schedule</h3>
        <div className="space-y-4">
          <div>
            <label className="label">Type</label>
            <div className="grid grid-cols-5 gap-1.5">
              {SHIFT_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setType(t.value)}
                  className={`py-2 px-1 rounded-lg border text-xs font-medium transition-all ${type === t.value ? t.color + ' border' : 'text-gray-500 bg-surface-700 border-surface-600 hover:border-gray-500'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          {type === 'work' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Start Time</label>
                <input type="time" className="input-field" value={startTime} onChange={e => setStartTime(e.target.value)} />
              </div>
              <div>
                <label className="label">End Time</label>
                <input type="time" className="input-field" value={endTime} onChange={e => setEndTime(e.target.value)} />
              </div>
            </div>
          )}
          {type === 'holiday' && (
            <div>
              <label className="label">Holiday Name</label>
              <input type="text" className="input-field" placeholder="e.g. New Year's Day" value={holidayName} onChange={e => setHolidayName(e.target.value)} />
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={() => onSave({ type, startTime: type === 'work' ? startTime : null, endTime: type === 'work' ? endTime : null, name: type === 'holiday' ? holidayName : null })} className="btn-primary flex-1">Save</button>
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          </div>
          {schedule && (
            <button
              onClick={onDelete}
              className="w-full mt-2 px-4 py-2.5 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/15 transition-colors text-sm font-medium"
            >
              Delete Schedule Entry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ScheduleManager() {
  const [employees, setEmployees] = useState([]);
  const [schedules, setSchedules] = useState({});
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState({});
  const [loading, setLoading] = useState(true);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkConfig, setBulkConfig] = useState({ type: 'work', startTime: '07:00', endTime: '16:30', daysOfWeek: [1,2,3,4,5] });
  const [bulkEmployee, setBulkEmployee] = useState('all');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { loadData(); }, [year, month]);

  const loadData = async () => {
    setLoading(true);
    const days = getDaysInMonth(year, month);
    const empSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'employee')));
    const emps = empSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    setEmployees(emps);

    const schSnap = await getDocs(query(collection(db, 'schedules'), where('date', '>=', days[0]), where('date', '<=', days[days.length - 1])));
    const schMap = {};
    schSnap.docs.forEach(d => {
      const data = d.data();
      if (!schMap[data.userId]) schMap[data.userId] = {};
      schMap[data.userId][data.date] = { docId: d.id, ...data };
    });
    setSchedules(schMap);
    setLoading(false);
  };

  const handleCellClick = (empId, day) => {
    const existing = schedules[empId]?.[day];
    setEditing({ empId, day, existing });
  };

  const handleSave = async ({ type, startTime, endTime, name }) => {
    const { empId, day } = editing;
    setSaving(p => ({ ...p, [`${empId}-${day}`]: true }));
    setError('');

    try {
      const emp = employees.find(e => e.id === empId);
      const docId = `${empId}_${day}`;
      const data = { userId: empId, userName: emp?.name || '', date: day, type, startTime, endTime, name };

      await setDoc(doc(db, 'schedules', docId), data);
      setSchedules(prev => ({
        ...prev,
        [empId]: { ...prev[empId], [day]: { docId, ...data } }
      }));
      setSuccess('Schedule entry saved.');
      setEditing(null);
    } catch (e) {
      console.error(e);
      setError('Failed to save schedule entry.');
    }

    setSaving(p => { const n = {...p}; delete n[`${empId}-${day}`]; return n; });
  };

  const handleDeleteSchedule = async () => {
    if (!editing?.existing) return;

    const confirmed = window.confirm(`Delete the schedule entry for ${editing.existing.userName || 'this employee'} on ${editing.day}? This cannot be undone.`);
    if (!confirmed) return;

    const key = `${editing.empId}-${editing.day}`;
    setSaving(p => ({ ...p, [key]: true }));
    setError('');

    try {
      await deleteDoc(doc(db, 'schedules', editing.existing.docId || `${editing.empId}_${editing.day}`));
      setSchedules(prev => {
        const next = { ...prev };
        if (next[editing.empId]) {
          next[editing.empId] = { ...next[editing.empId] };
          delete next[editing.empId][editing.day];
        }
        return next;
      });
      setSuccess('Schedule entry deleted.');
      setEditing(null);
    } catch (e) {
      console.error(e);
      setError('Failed to delete schedule entry.');
    }

    setSaving(p => { const n = {...p}; delete n[key]; return n; });
  };

  const handleBulkApply = async () => {
    setSaving({ bulk: true });
    setError('');
    const days = getDaysInMonth(year, month);
    const targetEmployees = bulkEmployee === 'all' ? employees : employees.filter(e => e.id === bulkEmployee);
    const writes = [];
    const newSchedules = {};

    try {
      days.forEach(day => {
        const dow = new Date(day + 'T00:00:00').getDay(); // 0=Sun, 1=Mon...
        if (!bulkConfig.daysOfWeek.includes(dow)) return;
        targetEmployees.forEach(emp => {
          const docId = `${emp.id}_${day}`;
          const data = { userId: emp.id, userName: emp.name, date: day, type: bulkConfig.type, startTime: bulkConfig.type === 'work' ? bulkConfig.startTime : null, endTime: bulkConfig.type === 'work' ? bulkConfig.endTime : null, name: bulkConfig.type === 'holiday' ? 'Holiday' : null };
          writes.push(setDoc(doc(db, 'schedules', docId), data));
          if (!newSchedules[emp.id]) newSchedules[emp.id] = {};
          newSchedules[emp.id][day] = { docId, ...data };
        });
      });

      await Promise.all(writes);
      setSchedules(prev => {
        const next = { ...prev };
        Object.keys(newSchedules).forEach(eid => {
          next[eid] = { ...(next[eid] || {}), ...newSchedules[eid] };
        });
        return next;
      });
      setSuccess('Bulk schedule applied.');
      setBulkMode(false);
    } catch (e) {
      console.error(e);
      setError('Failed to apply bulk schedule.');
    }

    setSaving({});
  };

  const handleExport = () => {
    const days = getDaysInMonth(year, month);
    const schByEmp = {};
    employees.forEach(emp => { schByEmp[emp.id] = schedules[emp.id] || {}; });
    exportSchedule({ employees, scheduleByEmployee: schByEmp, days, monthLabel: monthLabel(year, month) });
  };

  const days = getDaysInMonth(year, month);
  const today = todayKey();

  const getCellLabel = (schedule) => {
    if (!schedule) return '';
    if (schedule.type === 'work') return `${schedule.startTime}–${schedule.endTime}`;
    if (schedule.type === 'off') return 'Off';
    if (schedule.type === 'annual') return 'Annual';
    if (schedule.type === 'sick') return 'Sick';
    if (schedule.type === 'holiday') return schedule.name || 'Holiday';
    return '';
  };

  const getCellStyle = (schedule) => {
    if (!schedule) return 'text-gray-700 hover:bg-surface-700 cursor-pointer';
    const styles = { work: 'bg-green-500/10 text-green-400 border-green-500/20', off: 'bg-gray-500/10 text-gray-400 border-gray-500/20', annual: 'bg-blue-500/10 text-blue-400 border-blue-500/20', sick: 'bg-purple-500/10 text-purple-400 border-purple-500/20', holiday: 'bg-pink-500/10 text-pink-400 border-pink-500/20' };
    return `${styles[schedule.type] || ''} border cursor-pointer`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Schedule Manager</h1>
          <p className="text-gray-500 text-sm mt-0.5">Set work hours, leave, and off days for each employee</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setBulkMode(true)} className="btn-secondary text-sm flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16v16H4zM9 9h6M9 12h6M9 15h4"/></svg>
            Bulk Schedule
          </button>
          <button onClick={handleExport} className="btn-primary text-sm flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Export
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

      {/* Month selector */}
      <div className="card p-4 flex gap-3 items-end flex-wrap">
        <div>
          <label className="label">Month</label>
          <select className="input-field" style={{width:'140px'}} value={month} onChange={e => setMonth(Number(e.target.value))}>
            {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{new Date(2000,m-1).toLocaleString('en',{month:'long'})}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Year</label>
          <select className="input-field" style={{width:'100px'}} value={year} onChange={e => setYear(Number(e.target.value))}>
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="text-amber-400 text-sm font-semibold">{monthLabel(year, month)}</div>
      </div>

      {/* Bulk mode panel */}
      {bulkMode && (
        <div className="card p-5 border border-amber-500/20 slide-up">
          <h3 className="text-white font-semibold mb-4">Bulk Schedule Apply</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="label">Employee</label>
              <select className="input-field" value={bulkEmployee} onChange={e => setBulkEmployee(e.target.value)}>
                <option value="all">All Employees</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input-field" value={bulkConfig.type} onChange={e => setBulkConfig(p => ({...p, type: e.target.value}))}>
                {SHIFT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {bulkConfig.type === 'work' && <>
              <div><label className="label">Start</label><input type="time" className="input-field" value={bulkConfig.startTime} onChange={e => setBulkConfig(p => ({...p, startTime: e.target.value}))} /></div>
              <div><label className="label">End</label><input type="time" className="input-field" value={bulkConfig.endTime} onChange={e => setBulkConfig(p => ({...p, endTime: e.target.value}))} /></div>
            </>}
          </div>
          <div className="mt-4">
            <label className="label">Days of Week</label>
            <div className="flex gap-2">
              {[{d:'Mon',v:1},{d:'Tue',v:2},{d:'Wed',v:3},{d:'Thu',v:4},{d:'Fri',v:5},{d:'Sat',v:6},{d:'Sun',v:0}].map(({d,v}) => (
                <button key={v} onClick={() => setBulkConfig(p => ({...p, daysOfWeek: p.daysOfWeek.includes(v) ? p.daysOfWeek.filter(x=>x!==v) : [...p.daysOfWeek,v]}))}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${bulkConfig.daysOfWeek.includes(v) ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'text-gray-500 border-surface-600 hover:border-gray-500'}`}
                >{d}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleBulkApply} disabled={saving.bulk} className="btn-primary">{saving.bulk ? 'Applying...' : 'Apply to All Days'}</button>
            <button onClick={() => setBulkMode(false)} className="btn-secondary">Cancel</button>
          </div>
          <p className="text-amber-400/70 text-xs mt-2">⚠ This will overwrite existing schedule entries for selected days.</p>
        </div>
      )}

      {/* Schedule grid */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" style={{minWidth: `${Math.max(900, days.length * 60 + 160)}px`}}>
              <thead className="bg-surface-900">
                <tr>
                  <th className="table-header sticky left-0 bg-surface-900 z-10" style={{minWidth:'140px'}}>Employee</th>
                  {days.map(day => {
                    const dow = new Date(day + 'T00:00:00').getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    const isToday = day === today;
                    return (
                      <th key={day} className={`table-header text-center px-1 ${isWeekend ? 'text-amber-500/50' : ''} ${isToday ? 'text-amber-400' : ''}`} style={{minWidth:'52px'}}>
                        <div>{dayOfWeek(day)}</div>
                        <div className={`text-xs mt-0.5 font-mono ${isToday ? 'text-amber-400 font-bold' : 'text-gray-600'}`}>{new Date(day + 'T00:00:00').getDate()}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => (
                  <tr key={emp.id} className="border-t border-surface-700">
                    <td className="table-cell sticky left-0 bg-surface-800 z-10 font-medium text-white">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-xs font-bold flex-shrink-0">
                          {emp.name?.[0]}
                        </div>
                        <span className="text-sm truncate">{emp.name}</span>
                      </div>
                    </td>
                    {days.map(day => {
                      const sch = schedules[emp.id]?.[day];
                      const isLoading = saving[`${emp.id}-${day}`];
                      const isToday = day === today;
                      return (
                        <td key={day} className={`px-1 py-2 border-t border-surface-700 ${isToday ? 'bg-amber-500/3' : ''}`}>
                          <button
                            onClick={() => handleCellClick(emp.id, day)}
                            className={`w-full text-center py-1.5 px-1 rounded-lg text-xs font-medium transition-all hover:opacity-80 ${getCellStyle(sch)} ${isLoading ? 'opacity-50' : ''}`}
                            title={sch ? getCellLabel(sch) : 'Click to schedule'}
                          >
                            {isLoading ? '...' : sch ? (
                              sch.type === 'work' ? (
                                <span className="font-mono" style={{fontSize:'10px'}}>{sch.startTime}</span>
                              ) : getCellLabel(sch).slice(0,3)
                            ) : (
                              <span className="text-gray-700 text-xs">–</span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {SHIFT_TYPES.map(t => (
          <span key={t.value} className={`px-2.5 py-1 rounded-lg border ${t.color}`}>{t.label}</span>
        ))}
      </div>

      {/* Cell editor modal */}
      {editing && (
        <CellEditor
          schedule={schedules[editing.empId]?.[editing.day]}
          onSave={handleSave}
          onDelete={handleDeleteSchedule}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
