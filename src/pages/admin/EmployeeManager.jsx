import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where, setDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { db, secondaryAuth } from '../../firebase/config';

function Modal({ show, onClose, title, children }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-surface-800 border border-surface-600 rounded-2xl p-6 w-full max-w-md slide-up">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-semibold text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function EmployeeManager() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', department: '', role: 'employee' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { loadEmployees(); }, []);

  const loadEmployees = async () => {
    const snap = await getDocs(collection(db, 'users'));
    setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!form.name || !form.email || !form.password) {
      setError('Name, email, and password are required.');
      return;
    }
    setSaving(true); setError('');
    try {
      // Create auth account using secondary app (won't affect admin session)
      const result = await createUserWithEmailAndPassword(secondaryAuth, form.email, form.password);
      const uid = result.user.uid;
      await signOut(secondaryAuth); // Sign out of secondary instance

      // Create Firestore user doc
      await setDoc(doc(db, 'users', uid), {
        name: form.name, email: form.email, department: form.department,
        role: form.role, createdAt: new Date().toISOString()
      });

      setSuccess(`${form.name} has been added successfully!`);
      setForm({ name: '', email: '', password: '', department: '', role: 'employee' });
      setAddModal(false);
      loadEmployees();
    } catch (e) {
      setError(e.code === 'auth/email-already-in-use' ? 'This email is already registered.' : e.message);
    }
    setSaving(false);
  };

  const handleEdit = async () => {
    if (!editModal || !form.name) { setError('Name is required.'); return; }
    setSaving(true); setError('');
    try {
      await updateDoc(doc(db, 'users', editModal.id), {
        name: form.name, department: form.department, role: form.role
      });
      setSuccess('Employee updated.');
      setEditModal(null);
      loadEmployees();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const openEdit = (emp) => {
    setForm({ name: emp.name || '', email: emp.email || '', password: '', department: emp.department || '', role: emp.role || 'employee' });
    setError(''); setSuccess('');
    setEditModal(emp);
  };

  const openAdd = () => {
    setForm({ name: '', email: '', password: '', department: '', role: 'employee' });
    setError(''); setSuccess('');
    setAddModal(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Employees</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage employee accounts and access</p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
          Add Employee
        </button>
      </div>

      {success && (
        <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
          {success}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid gap-3">
          {employees.length === 0 && (
            <div className="card p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-surface-700 flex items-center justify-center mx-auto mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
              </div>
              <p className="text-white font-medium mb-1">No employees yet</p>
              <p className="text-gray-500 text-sm">Add your first employee to get started</p>
            </div>
          )}
          {employees.map(emp => (
            <div key={emp.id} className="card p-4 flex items-center justify-between hover:border-surface-500 transition-colors">
              <div className="flex items-center gap-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-base flex-shrink-0 ${
                  emp.role === 'admin' ? 'bg-amber-500/20 border border-amber-500/30 text-amber-400' : 'bg-surface-700 border border-surface-600 text-white'
                }`}>
                  {emp.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-white font-semibold text-sm">{emp.name || 'Unnamed'}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${emp.role === 'admin' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-surface-700 text-gray-400 border border-surface-600'}`}>
                      {emp.role || 'employee'}
                    </span>
                  </div>
                  <p className="text-gray-500 text-xs mt-0.5">{emp.email}</p>
                  {emp.department && <p className="text-gray-600 text-xs">{emp.department}</p>}
                </div>
              </div>
              <button onClick={() => openEdit(emp)} className="btn-secondary text-sm px-3 py-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Employee Modal */}
      <Modal show={addModal} onClose={() => setAddModal(false)} title="Add New Employee">
        <div className="space-y-4">
          <div><label className="label">Full Name *</label><input className="input-field" placeholder="John Doe" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} /></div>
          <div><label className="label">Email Address *</label><input type="email" className="input-field" placeholder="john@company.com" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} /></div>
          <div><label className="label">Password *</label>
            <input type="password" className="input-field" placeholder="Min. 6 characters" value={form.password} onChange={e => setForm(p => ({...p, password: e.target.value}))} />
            <p className="text-gray-600 text-xs mt-1">Employee will use this to login. They can't change it unless you reset it.</p>
          </div>
          <div><label className="label">Department</label><input className="input-field" placeholder="e.g. Operations" value={form.department} onChange={e => setForm(p => ({...p, department: e.target.value}))} /></div>
          <div>
            <label className="label">Role</label>
            <select className="input-field" value={form.role} onChange={e => setForm(p => ({...p, role: e.target.value}))}>
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}
          <div className="flex gap-3 pt-2">
            <button onClick={handleAdd} disabled={saving} className="btn-primary flex-1">{saving ? 'Creating...' : 'Create Account'}</button>
            <button onClick={() => setAddModal(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Edit Employee Modal */}
      <Modal show={!!editModal} onClose={() => setEditModal(null)} title="Edit Employee">
        <div className="space-y-4">
          <div><label className="label">Full Name</label><input className="input-field" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} /></div>
          <div>
            <label className="label">Email</label>
            <input className="input-field opacity-60 cursor-not-allowed" value={form.email} disabled />
            <p className="text-gray-600 text-xs mt-1">Email cannot be changed after creation.</p>
          </div>
          <div><label className="label">Department</label><input className="input-field" placeholder="e.g. Operations" value={form.department} onChange={e => setForm(p => ({...p, department: e.target.value}))} /></div>
          <div>
            <label className="label">Role</label>
            <select className="input-field" value={form.role} onChange={e => setForm(p => ({...p, role: e.target.value}))}>
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}
          <div className="flex gap-3 pt-2">
            <button onClick={handleEdit} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Save Changes'}</button>
            <button onClick={() => setEditModal(null)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
