import * as XLSX from 'xlsx';
import { minutesToHHMM, minutesToReadable, formatTime, formatDate, dayOfWeek } from './calculations';

/**
 * Export attendance data to Excel, matching the attached sheet format.
 * @param {Object} opts
 *   employees: array of { id, name }
 *   attendanceByEmployee: { [employeeId]: { [dateKey]: attendanceDoc } }
 *   scheduleByEmployee: { [employeeId]: { [dateKey]: scheduleDoc } }
 *   days: array of YYYY-MM-DD strings (all days in month)
 *   monthLabel: "January 2026"
 */
export function exportMonthlyAttendance({ employees, attendanceByEmployee, scheduleByEmployee, days, monthLabel }) {
  const wb = XLSX.utils.book_new();

  employees.forEach(emp => {
    const rows = [];
    // Title rows
    rows.push([emp.name, '', '', '', '', '', '', '']);
    rows.push([monthLabel, '', '', '', '', '', '', '']);
    rows.push(['Employee', 'Date', 'In', 'Out', 'Net Working Hours', 'Scheduled', 'OT/Short', 'Remarks']);

    const attendance = attendanceByEmployee[emp.id] || {};
    const schedule = scheduleByEmployee[emp.id] || {};

    let totalWorkedMins = 0;
    let totalOTMins = 0;

    days.forEach(day => {
      const att = attendance[day];
      const sch = schedule[day];
      const dow = dayOfWeek(day);

      let inTime = '';
      let outTime = '';
      let netWorking = '';
      let scheduled = '';
      let otShort = '';
      let remarks = att?.remarks || '';

      if (sch) {
        if (sch.type === 'off') {
          scheduled = 'Off';
        } else if (sch.type === 'annual') {
          scheduled = 'Annual';
        } else if (sch.type === 'sick') {
          scheduled = 'Sick Leave';
        } else if (sch.type === 'holiday') {
          scheduled = sch.name || 'Holiday';
        } else if (sch.type === 'work') {
          scheduled = `${sch.startTime || ''}-${sch.endTime || ''}`;
        }
      }

      if (att) {
        const checkIn = att.checkIn?.toDate ? att.checkIn.toDate() : att.checkIn ? new Date(att.checkIn) : null;
        const checkOut = att.checkOut?.toDate ? att.checkOut.toDate() : att.checkOut ? new Date(att.checkOut) : null;

        if (checkIn) inTime = checkIn.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        if (checkOut) outTime = checkOut.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

        if (checkIn && checkOut) {
          const workedMins = Math.round((checkOut - checkIn) / 60000);
          netWorking = minutesToHHMM(workedMins);
          totalWorkedMins += workedMins;

          if (sch?.type === 'work' && sch.startTime && sch.endTime) {
            const [sh, sm] = sch.startTime.split(':').map(Number);
            const [eh, em] = sch.endTime.split(':').map(Number);
            const scheduledMins = (eh * 60 + em) - (sh * 60 + sm);
            const ot = workedMins - scheduledMins;
            otShort = minutesToHHMM(ot);
            totalOTMins += ot;
          }
        } else if (checkIn && !checkOut) {
          inTime = checkIn.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
          outTime = 'Not checked out';
        }

        if (att.isManual) remarks = (remarks ? remarks + ' | ' : '') + 'Manual entry';
      }

      const dateLabel = new Date(day + 'T00:00:00').toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: '2-digit'
      });

      rows.push([emp.name, `${dateLabel} (${dow})`, inTime, outTime, netWorking, scheduled, otShort, remarks]);
    });

    // Total row
    rows.push([
      'TOTAL', '', '', '',
      minutesToHHMM(totalWorkedMins), '',
      (totalOTMins >= 0 ? '+' : '') + minutesToHHMM(totalOTMins),
      ''
    ]);

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Column widths
    ws['!cols'] = [
      { wch: 18 }, { wch: 22 }, { wch: 10 }, { wch: 10 },
      { wch: 20 }, { wch: 18 }, { wch: 12 }, { wch: 35 }
    ];

    const sheetName = emp.name.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  // Also add a combined sheet
  const allRows = [['Employee', 'Date', 'Day', 'In', 'Out', 'Net Working Hours', 'Scheduled', 'OT/Short', 'Remarks']];
  employees.forEach(emp => {
    const attendance = attendanceByEmployee[emp.id] || {};
    const schedule = scheduleByEmployee[emp.id] || {};
    days.forEach(day => {
      const att = attendance[day];
      const sch = schedule[day];
      const dow = dayOfWeek(day);
      let inTime = '', outTime = '', netWorking = '', scheduled = '', otShort = '', remarks = att?.remarks || '';

      if (sch) {
        if (sch.type !== 'work') scheduled = sch.type === 'off' ? 'Off' : sch.type === 'annual' ? 'Annual' : sch.type === 'sick' ? 'Sick Leave' : sch.name || 'Holiday';
        else scheduled = `${sch.startTime}-${sch.endTime}`;
      }

      if (att) {
        const checkIn = att.checkIn?.toDate ? att.checkIn.toDate() : att.checkIn ? new Date(att.checkIn) : null;
        const checkOut = att.checkOut?.toDate ? att.checkOut.toDate() : att.checkOut ? new Date(att.checkOut) : null;
        if (checkIn) inTime = checkIn.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        if (checkOut) outTime = checkOut.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        if (checkIn && checkOut) {
          const workedMins = Math.round((checkOut - checkIn) / 60000);
          netWorking = minutesToHHMM(workedMins);
          if (sch?.type === 'work' && sch.startTime && sch.endTime) {
            const [sh, sm] = sch.startTime.split(':').map(Number);
            const [eh, em] = sch.endTime.split(':').map(Number);
            const scheduledMins = (eh * 60 + em) - (sh * 60 + sm);
            otShort = minutesToHHMM(workedMins - scheduledMins);
          }
        }
      }

      const dateLabel = new Date(day + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
      allRows.push([emp.name, dateLabel, dow, inTime, outTime, netWorking, scheduled, otShort, remarks]);
    });
  });

  const combinedWs = XLSX.utils.aoa_to_sheet(allRows);
  combinedWs['!cols'] = [
    { wch: 18 }, { wch: 16 }, { wch: 6 }, { wch: 10 }, { wch: 10 },
    { wch: 20 }, { wch: 18 }, { wch: 12 }, { wch: 35 }
  ];
  XLSX.utils.book_append_sheet(wb, combinedWs, 'All Employees');

  XLSX.writeFile(wb, `Attendance_${monthLabel.replace(' ', '_')}.xlsx`);
}

/**
 * Export the schedule for a given month.
 */
export function exportSchedule({ employees, scheduleByEmployee, days, monthLabel }) {
  const wb = XLSX.utils.book_new();
  const header = ['Employee', ...days.map(d => {
    const date = new Date(d + 'T00:00:00');
    return `${dayOfWeek(d)} ${date.getDate()}`;
  })];
  const rows = [header];
  employees.forEach(emp => {
    const sch = scheduleByEmployee[emp.id] || {};
    const row = [emp.name];
    days.forEach(day => {
      const s = sch[day];
      if (!s) { row.push(''); return; }
      if (s.type === 'work') row.push(`${s.startTime}-${s.endTime}`);
      else if (s.type === 'off') row.push('Off');
      else if (s.type === 'annual') row.push('Annual');
      else if (s.type === 'sick') row.push('Sick Leave');
      else if (s.type === 'holiday') row.push(s.name || 'Holiday');
      else row.push('');
    });
    rows.push(row);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 18 }, ...days.map(() => ({ wch: 14 }))];
  XLSX.utils.book_append_sheet(wb, ws, 'Schedule');
  XLSX.writeFile(wb, `Schedule_${monthLabel.replace(' ', '_')}.xlsx`);
}
