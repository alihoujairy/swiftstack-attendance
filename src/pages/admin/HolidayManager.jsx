import React, { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';

export default function HolidayManager() {
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ date: '', name: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadHolidays(); }, []);

  const loadHolidays = async () => {
    const snap = await getDocs(collection(db, 'holidays'));
    const h = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    h.sort((a, b) => a.date.localeCompare(b.date));
    setHolidays(h);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!form.date || !form.name) { setError('Date and name are required.'); return; }
    if (holidays.find(h => h.date === form.date)) { setError('A holiday already exists on this date.'); return; }
    setSaving(true); setError('');
    await addDoc(collection(db, 'holidays'), { date: form.date, name: form.name });
    setForm({ date: '', name: '' });
    loadHolidays();
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this holiday?')) return;
    await deleteDoc(doc(db, 'holidays', id));
    setHolidays(prev => prev.filter(h => h.id !== id));
  };

  const grouped = holidays.reduce((acc, h) => {
    const year = h.date.slice(0, 4);
    if (!acc[year]) acc[year] = [];
    acc[year].push(h);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Holiday Management</h1>
        <p className="text-gray-500 text-sm mt-0.5">Manage company holidays and special off days</p>
      </div>

      {/* Add holiday form */}
      <div className="card p-5">
        <h2 className="text-white font-semibold mb-4">Add Holiday</h2>
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-shrink-0">
            <label className="label">Date</label>
            <input type="date" className="input-field" value={form.date} onChange={e => setForm(p => ({...p, date: e.target.value}))} />
          </div>
          <div className="flex-1">
            <label className="label">Holiday Name</label>
            <input type="text" className="input-field" placeholder="e.g. Eid Al-Adha, Independence Day..." value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} />
          </div>
          <button onClick={handleAdd} disabled={saving} className="btn-primary flex-shrink-0">
            {saving ? 'Adding...' : 'Add Holiday'}
          </button>
        </div>
        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      </div>

      {/* Holidays list */}
      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3">📅</div>
          <p className="text-white font-medium">No holidays added yet</p>
          <p className="text-gray-500 text-sm mt-1">Add company holidays above</p>
        </div>
      ) : (
        Object.entries(grouped).sort((a,b) => b[0].localeCompare(a[0])).map(([year, hols]) => (
          <div key={year} className="card overflow-hidden">
            <div className="px-5 py-3 bg-surface-900 border-b border-surface-700">
              <h3 className="text-amber-400 font-semibold">{year}</h3>
            </div>
            <div className="divide-y divide-surface-700">
              {hols.map(h => {
                const date = new Date(h.date + 'T00:00:00');
                const isPast = date < new Date();
                return (
                  <div key={h.id} className={`flex items-center justify-between px-5 py-3.5 hover:bg-surface-900/50 transition-colors ${isPast ? 'opacity-60' : ''}`}>
                    <div className="flex items-center gap-4">
                      <div className="text-center w-12">
                        <p className="text-amber-400 font-bold text-lg leading-none">{date.getDate()}</p>
                        <p className="text-gray-500 text-xs">{date.toLocaleString('en',{month:'short'})}</p>
                      </div>
                      <div>
                        <p className="text-white font-medium text-sm">{h.name}</p>
                        <p className="text-gray-600 text-xs">{date.toLocaleDateString('en-GB',{weekday:'long'})}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isPast && <span className="text-gray-600 text-xs">Past</span>}
                      <button onClick={() => handleDelete(h.id)} className="btn-danger px-3 py-1.5 text-xs">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Info box */}
      <div className="card p-4 border border-blue-500/10">
        <div className="flex gap-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" className="flex-shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          <div>
            <p className="text-blue-400 text-sm font-medium">About holidays</p>
            <p className="text-gray-500 text-xs mt-0.5">Holidays added here serve as reference. To mark a specific employee's day as a holiday in the schedule, use the Schedule Manager and select "Holiday" type for that day.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
