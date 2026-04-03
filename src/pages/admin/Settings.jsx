import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase/config';

export default function Settings() {
  const [settings, setSettings] = useState({ companyName: '', logoUrl: '', overtimeThresholdMinutes: 570 });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [logoPreview, setLogoPreview] = useState(null);

  useEffect(() => {
    getDoc(doc(db, 'settings', 'general')).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        setSettings(d);
        if (d.logoUrl) setLogoPreview(d.logoUrl);
      }
    });
  }, []);

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError('Logo must be under 2MB.'); return; }
    setUploading(true); setError('');
    try {
      const storageRef = ref(storage, `company/logo_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setSettings(p => ({ ...p, logoUrl: url }));
      setLogoPreview(url);
    } catch (e) {
      setError('Upload failed. Make sure Firebase Storage is enabled.');
    }
    setUploading(false);
  };

  const handleSave = async () => {
    setSaving(true); setError(''); setSaved(false);
    try {
      await setDoc(doc(db, 'settings', 'general'), settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError('Failed to save settings.');
    }
    setSaving(false);
  };

  const hours = Math.floor(settings.overtimeThresholdMinutes / 60);
  const mins = settings.overtimeThresholdMinutes % 60;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-500 text-sm mt-0.5">Manage company branding and system configuration</p>
      </div>

      {/* Company branding */}
      <div className="card p-6 space-y-5">
        <h2 className="text-white font-semibold border-b border-surface-600 pb-3">Company Branding</h2>

        <div>
          <label className="label">Company Name</label>
          <input
            className="input-field"
            placeholder="Your Company Name"
            value={settings.companyName || ''}
            onChange={e => setSettings(p => ({ ...p, companyName: e.target.value }))}
          />
          <p className="text-gray-600 text-xs mt-1">Displayed on the login page</p>
        </div>

        <div>
          <label className="label">Company Logo</label>
          <div className="flex items-start gap-4">
            <div className="w-24 h-24 rounded-xl bg-surface-700 border border-surface-600 flex items-center justify-center overflow-hidden flex-shrink-0">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-2" />
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9l4-4 4 4 4-4 4 4M3 15l4-4 4 4 4-4 4 4"/>
                </svg>
              )}
            </div>
            <div className="flex-1">
              <label className={`btn-secondary text-sm cursor-pointer inline-flex items-center gap-2 ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                {uploading ? 'Uploading...' : 'Upload Logo'}
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploading} />
              </label>
              <p className="text-gray-600 text-xs mt-2">PNG, JPG or SVG. Max 2MB.<br/>Shown on the login page.</p>
              {logoPreview && (
                <button onClick={() => { setLogoPreview(null); setSettings(p => ({ ...p, logoUrl: '' })); }}
                  className="text-red-400 hover:text-red-300 text-xs mt-2 flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  Remove logo
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Attendance config */}
      <div className="card p-6 space-y-5">
        <h2 className="text-white font-semibold border-b border-surface-600 pb-3">Attendance Rules</h2>

        <div>
          <label className="label">Scheduled Work Hours (per shift)</label>
          <div className="flex gap-3 items-center">
            <div>
              <input
                type="number" min="0" max="23"
                className="input-field text-center font-mono"
                style={{width:'80px'}}
                value={hours}
                onChange={e => setSettings(p => ({ ...p, overtimeThresholdMinutes: Number(e.target.value) * 60 + mins }))}
              />
              <p className="text-gray-600 text-xs mt-1 text-center">hours</p>
            </div>
            <span className="text-gray-500 font-bold text-lg mb-4">:</span>
            <div>
              <input
                type="number" min="0" max="59" step="5"
                className="input-field text-center font-mono"
                style={{width:'80px'}}
                value={mins}
                onChange={e => setSettings(p => ({ ...p, overtimeThresholdMinutes: hours * 60 + Number(e.target.value) }))}
              />
              <p className="text-gray-600 text-xs mt-1 text-center">minutes</p>
            </div>
            <div className="mb-4 text-gray-400 text-sm">
              = <span className="text-amber-400 font-semibold">{hours}h {mins > 0 ? `${mins}m` : ''}</span> standard shift
            </div>
          </div>
          <p className="text-gray-600 text-xs">
            Anything worked beyond the scheduled shift end time counts as overtime.
            Anything below counts as undertime. Default: 9h 30m (570 minutes).
          </p>
        </div>
      </div>

      {/* Firestore rules reminder */}
      <div className="card p-4 border border-amber-500/10">
        <div className="flex gap-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" className="flex-shrink-0 mt-0.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <div>
            <p className="text-amber-400 text-sm font-medium">Security Note</p>
            <p className="text-gray-500 text-xs mt-1">
              Make sure your Firestore security rules are deployed correctly (see the <code className="text-amber-400/70">firestore.rules</code> file in your project).
              Without proper rules, data may be publicly accessible.
            </p>
          </div>
        </div>
      </div>

      {/* Save button */}
      {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">{error}</div>}
      {saved && <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
        Settings saved successfully!
      </div>}

      <button onClick={handleSave} disabled={saving} className="btn-primary px-8">
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
}
