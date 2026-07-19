import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Calendar, AlertCircle } from 'lucide-react';

// Seed initial timetable data
const INITIAL_TIMETABLE = {
  Monday: {
    1: { subject: 'การสร้างเกมคอมฯ', teacher: 'อ.ธีรภาพ', room: '1409' },
    2: { subject: 'การสร้างเกมคอมฯ', teacher: 'อ.ธีรภาพ', room: '1409' },
    3: { subject: 'English for Project', teacher: 'อ.มานี', room: '1503' },
    4: { subject: 'พักกลางวัน', teacher: '', room: '' },
    5: { subject: 'ทักษะดิจิทัล', teacher: 'อ.วิชัย', room: '1509' },
    6: { subject: 'ทักษะดิจิทัล', teacher: 'อ.วิชัย', room: '1509' },
  },
  Tuesday: {
    1: { subject: 'การซ่อมบำรุงคอมฯ', teacher: 'อ.มานะ', room: '1401' },
    2: { subject: 'การซ่อมบำรุงคอมฯ', teacher: 'อ.มานะ', room: '1401' },
    3: { subject: 'การออกแบบกราฟิก', teacher: 'อ.สมชาย', room: '1406' },
    4: { subject: 'พักกลางวัน', teacher: '', room: '' },
    5: { subject: 'โครงงาน', teacher: 'อ.ปิยะนุช', room: '1503' },
    6: { subject: 'โครงงาน', teacher: 'อ.ปิยะนุช', room: '1503' },
  },
  Wednesday: {
    1: { subject: 'English for Project', teacher: 'อ.มานี', room: '1503' },
    2: { subject: 'การออกแบบกราฟิก', teacher: 'อ.สมชาย', room: '1406' },
    3: { subject: 'การออกแบบกราฟิก', teacher: 'อ.สมชาย', room: '1406' },
    4: { subject: 'พักกลางวัน', teacher: '', room: '' },
    5: { subject: 'การสร้างเกมคอมฯ', teacher: 'อ.ธีรภาพ', room: '1409' },
    6: { subject: 'การสร้างเกมคอมฯ', teacher: 'อ.ธีรภาพ', room: '1409' },
  },
  Thursday: {
    1: { subject: 'ทักษะดิจิทัล', teacher: 'อ.วิชัย', room: '1509' },
    2: { subject: 'การซ่อมบำรุงคอมฯ', teacher: 'อ.มานะ', room: '1401' },
    3: { subject: 'โครงงาน', teacher: 'อ.ปิยะนุช', room: '1503' },
    4: { subject: 'พักกลางวัน', teacher: '', room: '' },
    5: { subject: 'กิจกรรมโฮมรูม', teacher: 'อ.ปิยะนุช', room: '1503' },
    6: { subject: 'กิจกรรมโฮมรูม', teacher: 'อ.ปิยะนุช', room: '1503' },
  },
  Friday: {
    1: { subject: 'โครงงาน', teacher: 'อ.ปิยะนุช', room: '1503' },
    2: { subject: 'โครงงาน', teacher: 'อ.ปิยะนุช', room: '1503' },
    3: { subject: 'การซ่อมบำรุงคอมฯ', teacher: 'อ.มานะ', room: '1401' },
    4: { subject: 'พักกลางวัน', teacher: '', room: '' },
    5: { subject: 'สันทนาการ', teacher: 'อ.วิชัย', room: 'สนาม' },
    6: { subject: 'สันทนาการ', teacher: 'อ.วิชัย', room: 'สนาม' },
  }
};

const DAYS_TH = {
  Monday: 'จันทร์',
  Tuesday: 'อังคาร',
  Wednesday: 'พุธ',
  Thursday: 'พฤหัสฯ',
  Friday: 'ศุกร์'
};

export default function StudentTimetable() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [timetable, setTimetable] = useState(INITIAL_TIMETABLE);
  const [lastUpdated, setLastUpdated] = useState('09:30');

  useEffect(() => {
    // Listen to real-time timetable updates from Firestore for this class
    const classId = user?.class_id || 'm3_6';
    const unsub = onSnapshot(doc(db, 'timetable', classId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        // Merge updates into timetable
        setTimetable(prev => {
          const updated = { ...prev };
          Object.keys(data).forEach(day => {
            if (updated[day]) {
              updated[day] = { ...updated[day], ...data[day] };
            } else {
              updated[day] = data[day];
            }
          });
          return updated;
        });
        setLastUpdated(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }));
      }
    }, (err) => {
      console.warn('Firestore timetable access failed, using demo data', err);
    });

    return () => unsub();
  }, [user]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className={`text-xl font-extrabold flex items-center gap-2 transition-colors duration-300 ${
          isDark ? 'text-white' : 'text-sbac-navy'
        }`}>
          <Calendar size={24} className="text-sbac-blue-light" />
          ตารางสอน
        </h2>
        <span className={`text-xs font-bold flex items-center gap-1 px-3 py-1 rounded-full transition-colors duration-300 ${
          isDark ? 'bg-emerald-950/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
        }`}>
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          Real-time
        </span>
      </div>

      {/* Meta details */}
      <div className={`p-4 rounded-2xl border space-y-2 text-sm font-semibold transition-colors duration-300 ${
        isDark ? 'bg-white/[0.04] border-white/5 text-slate-300' : 'bg-slate-50 border-slate-100 text-ink-secondary'
      }`}>
        <div className="flex justify-between">
          <span className={isDark ? 'text-slate-400' : 'text-ink-muted'}>ระดับชั้น / ห้อง</span>
          <span className={`font-bold transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
            ปวช. {user?.year || '3'}/{user?.room || '6'} ({user?.branch || 'เทคโนโลยีสารสนเทศ'})
          </span>
        </div>
        <div className="flex justify-between">
          <span className={isDark ? 'text-slate-400' : 'text-ink-muted'}>ห้องเรียนหลัก / คาบเวลา</span>
          <span className={`font-bold transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
            ห้อง {user?.room === '6' ? '1503' : '1504'} / เช้า
          </span>
        </div>
        <div className="flex justify-between">
          <span className={isDark ? 'text-slate-400' : 'text-ink-muted'}>อาจารย์ที่ปรึกษา</span>
          <span className={`font-bold transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
            อ.ปิยะนุช พูลศิริ
          </span>
        </div>
        <div className="flex justify-between">
          <span className={isDark ? 'text-slate-400' : 'text-ink-muted'}>ปีการศึกษา</span>
          <span className={`font-bold transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
            1/2569
          </span>
        </div>
        <div className={`text-[10px] border-t pt-2 flex justify-between transition-colors duration-300 ${
          isDark ? 'text-slate-500 border-white/5' : 'text-ink-muted border-slate-200/50'
        }`}>
          <span>อัปเดตล่าสุด: {lastUpdated} น.</span>
          <span className="text-emerald-600 font-bold">● Connected</span>
        </div>
      </div>

      {/* Grid Timetable */}
      <div className={`rounded-3xl border shadow-sm overflow-hidden transition-colors duration-300 ${
        isDark ? 'bg-white/[0.04] border-white/5' : 'bg-white border-slate-100 shadow-sm'
      }`}>
        <div className="overflow-x-auto scrollbar-hide">
          <table className={`w-full border-collapse text-left min-w-[500px] transition-colors duration-300 ${
            isDark ? 'divide-white/5' : 'divide-slate-100'
          }`}>
            <thead>
              <tr className={`border-b transition-colors duration-300 ${
                isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'
              }`}>
                <th className={`p-3 text-xs font-extrabold w-16 transition-colors duration-300 ${
                  isDark ? 'text-white' : 'text-sbac-navy'
                }`}>วัน</th>
                {[1, 2, 3, 4, 5, 6].map(p => (
                  <th key={p} className={`p-3 text-xs font-extrabold text-center transition-colors duration-300 ${
                    isDark ? 'text-white' : 'text-sbac-navy'
                  }`}>
                    คาบ {p}
                    <span className={`block text-[8px] font-normal mt-0.5 transition-colors duration-300 ${
                      isDark ? 'text-slate-400' : 'text-ink-muted'
                    }`}>
                      {p === 1 ? '08:30-09:30' : 
                       p === 2 ? '09:30-10:30' : 
                       p === 3 ? '10:30-11:30' : 
                       p === 4 ? '11:30-12:30' : 
                       p === 5 ? '12:30-13:30' : '13:30-14:30'}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={`divide-y transition-colors duration-300 ${
              isDark ? 'divide-white/5' : 'divide-slate-100'
            }`}>
              {Object.entries(timetable).map(([day, periods]) => (
                <tr key={day} className={`transition-colors duration-200 ${
                  isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50/50'
                }`}>
                  <td className={`p-3 text-xs font-extrabold transition-colors duration-300 ${
                    isDark ? 'text-white bg-white/5' : 'text-sbac-navy bg-slate-50/30'
                  }`}>
                    {DAYS_TH[day] || day}
                  </td>
                  {[1, 2, 3, 4, 5, 6].map(p => {
                    const period = periods[p] || { subject: '', teacher: '', room: '' };
                    const isSubstituted = period.is_substituted;
                    return (
                      <td 
                        key={p} 
                        className={`p-2.5 text-center transition-all duration-300 ${
                          isSubstituted 
                            ? (isDark ? 'bg-rose-950/20 border border-rose-900/30 animate-pulse' : 'bg-rose-50 border border-rose-100 animate-pulse') 
                            : period.subject === 'พักกลางวัน'
                            ? (isDark ? 'bg-white/5 text-slate-500' : 'bg-slate-50/70 text-ink-muted') 
                            : ''
                        }`}
                      >
                        {period.subject ? (
                          <div className="space-y-0.5 animate-fade-in">
                            <div className={`text-xs font-extrabold transition-colors duration-300 ${
                              isSubstituted 
                                ? (isDark ? 'text-rose-400' : 'text-rose-700') 
                                : (isDark ? 'text-white' : 'text-sbac-navy')
                            }`}>
                              {period.subject}
                            </div>
                            {period.teacher && (
                              <div className={`text-[9px] font-semibold transition-colors duration-300 ${
                                isDark ? 'text-slate-300' : 'text-ink-secondary'
                              }`}>
                                {isSubstituted ? `สอนแทน: ${period.substitute_teacher || period.teacher}` : period.teacher}
                              </div>
                            )}
                            {period.room && (
                              <div className={`text-[8px] font-bold inline-block px-1.5 py-0.5 rounded transition-colors duration-300 ${
                                isSubstituted 
                                  ? (isDark ? 'bg-rose-900/30 text-rose-400' : 'bg-rose-100 text-rose-800') 
                                  : (isDark ? 'bg-white/10 text-slate-300' : 'bg-slate-100 text-ink-secondary')
                              }`}>
                                {isSubstituted && period.substitute_room ? period.substitute_room : period.room}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className={`text-[10px] font-bold transition-colors duration-300 ${
                            isDark ? 'text-slate-700' : 'text-slate-300'
                          }`}>-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`flex gap-2 items-center p-3 rounded-2xl border transition-colors duration-300 ${
        isDark ? 'bg-white/[0.04] border-white/5' : 'bg-slate-50 border-slate-100'
      }`}>
        <AlertCircle className="text-rose-500 flex-shrink-0" size={16} />
        <p className={`text-[10px] leading-relaxed transition-colors duration-300 ${
          isDark ? 'text-slate-400' : 'text-ink-muted'
        }`}>
          <strong>หมายเหตุ:</strong> คาบเรียนแถบสีแดงกระพริบ มีการปรับเปลี่ยนการเรียนการสอน (มีอาจารย์สอนแทนหรือเปลี่ยนห้องเรียน) แบบเรียลไทม์
        </p>
      </div>
    </div>
  );
}
