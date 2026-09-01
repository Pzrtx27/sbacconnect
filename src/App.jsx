import React, { Component } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import StudentHome from './pages/student/StudentHome';
import StudentTimetable from './pages/student/StudentTimetable';
import CoffeePage from './pages/student/CoffeePage';
import MyOrdersPage from './pages/student/MyOrdersPage';
import OrderHistoryPage from './pages/student/OrderHistoryPage';
import TeacherHome from './pages/teacher/TeacherHome';
import AcademicDashboard from './pages/academic/AcademicDashboard';
import BaristaDashboard from './pages/barista/BaristaDashboard';
import BottomNav from './components/layout/BottomNav';
import SideNav from './components/layout/SideNav';
import Header from './components/layout/Header';
import PageWrapper from './components/layout/PageWrapper';
import LoadingSpinner from './components/ui/LoadingSpinner';
import AssistantFAB from './components/assistant/AssistantFAB';
import { shellWidthClass } from './utils/layout';

/** หน้าเริ่มต้นของแต่ละ role — ใช้ที่เดียวกันทั้งแอปเพื่อไม่ให้ redirect วนลูป
 *  sysadmin ต้องมีในนี้ด้วย: AuthContext เลือก role นี้เป็นอันดับแรกถ้ามี
 *  ถ้าไม่ระบุไว้ จะตกไปที่ '/home' ซึ่ง ProtectedRoute อนุญาตแค่ student
 *  แล้วเด้งกลับมา homeFor() = '/home' อีก กลายเป็นวนไม่จบ */
const HOME_BY_ROLE = {
  student: '/home',
  teacher: '/teacher',
  academic: '/academic',
  barista: '/barista',
  sysadmin: '/academic',
};

const normalizeRole = (user) => (user?.role || 'student').toLowerCase().trim();
const homeFor = (user) => HOME_BY_ROLE[normalizeRole(user)] || '/home';

/** พื้นหลังเต็มจอที่ใช้ร่วมกัน (โทนเดียวกับ .dark body ใน index.css) */
function FullScreen({ children }) {
  return (
    <div className="h-screen w-screen flex items-center justify-center transition-colors duration-300 bg-surface text-ink dark:bg-surface-dark dark:text-white">
      {children}
    </div>
  );
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App ErrorBoundary caught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    // ใช้ replace แทน href เพื่อไม่ให้ปุ่ม back เด้งกลับมาหน้าที่พัง
    window.location.replace('/');
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface text-ink dark:bg-surface-dark dark:text-white flex flex-col items-center justify-center p-6 text-center space-y-4">
          <div
            className="w-16 h-16 rounded-3xl bg-accent-rose/10 text-accent-rose flex items-center justify-center mx-auto border border-accent-rose/20"
            aria-hidden="true"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h2 className="text-lg font-extrabold">เกิดข้อผิดพลาดชั่วคราวในการแสดงผล</h2>
          <p className="text-xs text-content-muted max-w-xs leading-relaxed mx-auto">
            กำลังกู้คืนระบบกลับสู่ปกติ กรุณากดปุ่มด้านล่างเพื่อกลับสู่หน้าหลัก
          </p>
          {import.meta.env?.DEV && this.state.error && (
            <pre className="text-[10px] text-accent-rose max-w-sm overflow-auto text-left bg-accent-rose/5 border border-accent-rose/20 rounded-xl p-3">
              {String(this.state.error?.stack || this.state.error)}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            className="px-6 py-3 bg-sbac-blue hover:bg-sbac-navy text-white text-xs font-extrabold rounded-2xl shadow-lg shadow-sbac-blue/30 active:scale-95 transition-all"
          >
            กลับสู่หน้าหลัก
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <FullScreen>
        <LoadingSpinner size="lg" text="กำลังตรวจสอบสิทธิ์..." />
      </FullScreen>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const userRole = normalizeRole(user);
  const normalizedAllowed = allowedRoles ? allowedRoles.map((r) => r.toLowerCase().trim()) : null;

  if (normalizedAllowed && !normalizedAllowed.includes(userRole)) {
    // ส่งกลับหน้าหลักของ role ตัวเองโดยตรง (ไม่ส่งไป "/" เพื่อกันวนลูป)
    return <Navigate to={homeFor(user)} replace />;
  }

  return children;
}

/** หน้า /login — ถ้าล็อกอินอยู่แล้วให้เด้งเข้าหน้าหลักทันที
 *  ทำให้การเข้าสู่ระบบทำงานถูกต้องแม้ navigate() ใน LoginPage จะพลาด */
function LoginRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <FullScreen>
        <LoadingSpinner size="lg" text="กำลังโหลด..." />
      </FullScreen>
    );
  }

  if (user) return <Navigate to={homeFor(user)} replace />;

  return <LoginPage />;
}

function MainLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <FullScreen>
        <LoadingSpinner size="lg" text="กำลังโหลด..." />
      </FullScreen>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const userRole = normalizeRole(user);

  // Barista ใช้เต็มจอ ไม่มี header / bottom nav
  if (userRole === 'barista') {
    return (
      <div className="min-h-screen safe-bottom transition-colors duration-300 relative bg-surface text-ink dark:bg-surface-dark dark:text-white">
        <div className="relative z-10 min-h-screen flex flex-col">
          <Routes>
            <Route path="/barista" element={<PageWrapper><BaristaDashboard /></PageWrapper>} />
            <Route path="*" element={<Navigate to="/barista" replace />} />
          </Routes>
        </div>
        <AssistantFAB />
      </div>
    );
  }

  return (
    /* pb-24 เว้นที่ให้ BottomNav บนมือถือ — บนคอมไม่มีแถบล่างแล้วจึงคืนพื้นที่ให้เนื้อหา
       xl:pl-64 หลบแถบซ้ายที่เป็น fixed (กว้าง w-64 เท่ากัน) */
    <div className="min-h-screen flex flex-col pb-24 xl:pb-0 xl:pl-64 transition-colors duration-300 relative bg-surface text-ink dark:bg-surface-dark dark:text-white">
      <SideNav />

      <div className="relative z-10 flex-1 flex flex-col">
        <Header />

        {/* ข้ามไปเนื้อหาหลัก — ช่วยผู้ใช้ screen reader / keyboard */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded-xl focus:bg-sbac-blue focus:text-white focus:text-xs focus:font-bold"
        >
          ข้ามไปยังเนื้อหาหลัก
        </a>

        <main
          id="main-content"
          className={`flex-1 container mx-auto px-4 py-6 ${shellWidthClass(userRole)}`}
        >
          <Routes>
            {/* หน้าเริ่มต้น ส่งตาม role */}
            <Route path="/" element={<Navigate to={homeFor(user)} replace />} />

            <Route
              path="/home"
              element={
                <ProtectedRoute allowedRoles={['student']}>
                  <PageWrapper><StudentHome /></PageWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/timetable"
              element={
                <ProtectedRoute allowedRoles={['student', 'teacher', 'academic', 'sysadmin']}>
                  <PageWrapper><StudentTimetable /></PageWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/coffee"
              element={
                <ProtectedRoute allowedRoles={['student', 'teacher']}>
                  <PageWrapper><CoffeePage /></PageWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders"
              element={
                <ProtectedRoute allowedRoles={['student', 'teacher']}>
                  <PageWrapper><MyOrdersPage /></PageWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders/history"
              element={
                <ProtectedRoute allowedRoles={['student', 'teacher']}>
                  <PageWrapper><OrderHistoryPage /></PageWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher"
              element={
                <ProtectedRoute allowedRoles={['teacher']}>
                  <PageWrapper><TeacherHome /></PageWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/academic"
              element={
                <ProtectedRoute allowedRoles={['academic', 'sysadmin']}>
                  <PageWrapper><AcademicDashboard /></PageWrapper>
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to={homeFor(user)} replace />} />
          </Routes>
        </main>

        <BottomNav />
        <AssistantFAB />

      </div>
    </div>
  );
}

export default function App() {
  // สำคัญ: <Router> ต้องอยู่นอกสุดและห้าม unmount ระหว่างล็อกอิน
  // ก่อนหน้านี้ App คืนหน้า loading ตอน login ทำให้ Router ถูก unmount
  // แล้ว navigate() ที่ LoginPage เรียกหลัง await จะยิงไปที่ router ที่ตายแล้ว
  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/*" element={<MainLayout />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}
