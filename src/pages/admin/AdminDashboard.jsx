import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Users, SlidersHorizontal, History } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import TabNav from '../../components/layout/TabNav';
import AdminAccounts from './AdminAccounts';
import AdminSettings from './AdminSettings';
import AdminAudit from './AdminAudit';

/* หน้าผู้ดูแลระบบ — งานที่ "ตั้งค่าไว้แล้วนาน ๆ แก้ที" แยกจากงานประจำวันของฝ่ายวิชาการ

   ทำไมแยกหน้า: หน้า /academic เป็นงานที่ทำทุกเช้า (อนุมัติใบลา จัดสอนแทน)
   ส่วนหน้านี้คือการเปลี่ยนกติกาของทั้งวิทยาลัย ซึ่งกดผิดทีเดียวกระทบทุกคน
   การเอาไปปนกันในหน้าเดียวแปลว่าปุ่มอันตรายอยู่ข้างปุ่มที่กดทุกวัน

   ในรุ่นสาธิตนี้บัญชี sysadmin ทำงานวิชาการได้ด้วย (ดู ProtectedRoute ของ /academic)
   ถ้าโรงเรียนเอาไปใช้จริงแล้วอยากแยกคน ให้ถอด sysadmin ออกจาก allowedRoles ของ /academic */

const TABS = [
  { id: 'accounts', label: 'บัญชีผู้ใช้', icon: Users },
  { id: 'settings', label: 'เงื่อนไขของระบบ', icon: SlidersHorizontal },
  { id: 'audit', label: 'ปูมการแก้ไข', icon: History },
];

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('accounts');

  return (
    <div className="space-y-6">
      <PageHeader icon={ShieldCheck} title="ผู้ดูแลระบบ">
        <Link
          to="/academic"
          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-sbac-blue/10 text-brand hover:bg-sbac-blue/20 transition-colors"
        >
          ไปงานวิชาการ
        </Link>
      </PageHeader>

      <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'accounts' && (
        <div role="tabpanel" id="panel-accounts" aria-labelledby="tab-accounts" tabIndex={-1}>
          <AdminAccounts />
        </div>
      )}
      {activeTab === 'settings' && (
        <div role="tabpanel" id="panel-settings" aria-labelledby="tab-settings" tabIndex={-1}>
          <AdminSettings />
        </div>
      )}
      {activeTab === 'audit' && (
        <div role="tabpanel" id="panel-audit" aria-labelledby="tab-audit" tabIndex={-1}>
          <AdminAudit />
        </div>
      )}
    </div>
  );
}
