import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useTheme } from './contexts/ThemeContext';
import LoginPage from './pages/LoginPage';
import StudentHome from './pages/student/StudentHome';
import StudentTimetable from './pages/student/StudentTimetable';
import CoffeePage from './pages/student/CoffeePage';
import MyOrdersPage from './pages/student/MyOrdersPage';
import TeacherHome from './pages/teacher/TeacherHome';
import AcademicDashboard from './pages/academic/AcademicDashboard';
import BaristaDashboard from './pages/barista/BaristaDashboard';
import BottomNav from './components/layout/BottomNav';
import Header from './components/layout/Header';
import ChatbotFAB from './components/chatbot/ChatbotFAB';
import PageWrapper from './components/layout/PageWrapper';
import LoadingSpinner from './components/ui/LoadingSpinner';

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  if (loading) {
    return (
      <div className={`h-screen w-screen flex items-center justify-center transition-colors duration-300 ${
        isDark ? 'bg-surface-dark' : 'bg-surface'
      }`}>
        <LoadingSpinner size="lg" text="กำลังตรวจสอบสิทธิ์..." />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to default home for their role
    return <Navigate to="/" replace />;
  }

  return children;
}

function MainLayout() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  
  if (!user) return <Navigate to="/login" replace />;

  // Barista gets full screen without header and bottom nav
  if (user.role === 'barista') {
    return (
      <div className={`min-h-screen pb-safe-bottom transition-colors duration-300 relative overflow-hidden ${
        isDark ? 'bg-surface-dark text-white' : 'bg-surface text-ink'
      }`}>
        {/* Background decorative elements */}
        <div className={`absolute top-[-10%] left-[-15%] w-72 h-72 rounded-full animate-float pointer-events-none ${
          isDark ? 'opacity-60' : 'opacity-30'
        }`} style={{
          background: 'radial-gradient(circle, rgba(26,60,200,0.15) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }} />
        <div className={`absolute bottom-[10%] right-[-10%] w-56 h-56 rounded-full animate-float pointer-events-none ${
          isDark ? 'opacity-40' : 'opacity-20'
        }`} style={{
          animationDelay: '-3s',
          background: 'radial-gradient(circle, rgba(200,16,46,0.1) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }} />
        <div className={`absolute top-[40%] left-[60%] w-40 h-40 rounded-full animate-float pointer-events-none ${
          isDark ? 'opacity-30' : 'opacity-15'
        }`} style={{
          animationDelay: '-5s',
          background: 'radial-gradient(circle, rgba(26,60,200,0.12) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }} />

        {/* Shimmer Line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sbac-blue/30 to-transparent animate-shimmer pointer-events-none" 
             style={{ backgroundSize: '200% 100%' }} />

        <div className="relative z-10 min-h-screen flex flex-col">
          <Routes>
            <Route path="/" element={<PageWrapper><BaristaDashboard /></PageWrapper>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    );
  }

  // Other roles get standard header and bottom nav
  return (
    <div className={`min-h-screen flex flex-col pb-24 transition-colors duration-300 relative overflow-hidden ${
      isDark ? 'bg-surface-dark text-white' : 'bg-surface text-ink'
    }`}>
      {/* Background decorative elements */}
      <div className={`absolute top-[-10%] left-[-15%] w-72 h-72 rounded-full animate-float pointer-events-none ${
        isDark ? 'opacity-60' : 'opacity-30'
      }`} style={{
        background: 'radial-gradient(circle, rgba(26,60,200,0.15) 0%, transparent 70%)',
        filter: 'blur(40px)',
      }} />
      <div className={`absolute bottom-[10%] right-[-10%] w-56 h-56 rounded-full animate-float pointer-events-none ${
        isDark ? 'opacity-40' : 'opacity-20'
      }`} style={{
        animationDelay: '-3s',
        background: 'radial-gradient(circle, rgba(200,16,46,0.1) 0%, transparent 70%)',
        filter: 'blur(40px)',
      }} />
      <div className={`absolute top-[40%] left-[60%] w-40 h-40 rounded-full animate-float pointer-events-none ${
        isDark ? 'opacity-30' : 'opacity-15'
      }`} style={{
        animationDelay: '-5s',
        background: 'radial-gradient(circle, rgba(26,60,200,0.12) 0%, transparent 70%)',
        filter: 'blur(40px)',
      }} />

      {/* Shimmer Line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sbac-blue/30 to-transparent animate-shimmer pointer-events-none" 
           style={{ backgroundSize: '200% 100%' }} />

      <div className="relative z-10 flex-1 flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-6 max-w-md">
          <Routes>
            {/* Default route redirects based on role */}
            <Route path="/" element={
              user.role === 'student' ? <Navigate to="/home" replace /> :
              user.role === 'teacher' ? <Navigate to="/teacher" replace /> :
              user.role === 'academic' ? <Navigate to="/academic" replace /> :
              <Navigate to="/login" replace />
            } />

            {/* Student routes */}
            <Route path="/home" element={
              <ProtectedRoute allowedRoles={['student']}>
                <PageWrapper><StudentHome /></PageWrapper>
              </ProtectedRoute>
            } />
            <Route path="/timetable" element={
              <ProtectedRoute allowedRoles={['student', 'teacher', 'academic']}>
                <PageWrapper><StudentTimetable /></PageWrapper>
              </ProtectedRoute>
            } />
            <Route path="/coffee" element={
              <ProtectedRoute allowedRoles={['student', 'teacher']}>
                <PageWrapper><CoffeePage /></PageWrapper>
              </ProtectedRoute>
            } />
            <Route path="/orders" element={
              <ProtectedRoute allowedRoles={['student', 'teacher']}>
                <PageWrapper><MyOrdersPage /></PageWrapper>
              </ProtectedRoute>
            } />

            {/* Teacher routes */}
            <Route path="/teacher" element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <PageWrapper><TeacherHome /></PageWrapper>
              </ProtectedRoute>
            } />

            {/* Academic routes */}
            <Route path="/academic" element={
              <ProtectedRoute allowedRoles={['academic']}>
                <PageWrapper><AcademicDashboard /></PageWrapper>
              </ProtectedRoute>
            } />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        
        {/* Botton navigation based on role */}
        <BottomNav />
        
        {/* Chatbot FAB for students and teachers */}
        {(user.role === 'student' || user.role === 'teacher') && <ChatbotFAB />}
      </div>
    </div>
  );
}

export default function App() {
  const { loading } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  if (loading) {
    return (
      <div className={`h-screen w-screen flex items-center justify-center transition-colors duration-300 ${
        isDark ? 'bg-surface-dark' : 'bg-surface'
      }`}>
        <LoadingSpinner size="lg" text="กำลังโหลด..." />
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<MainLayout />} />
      </Routes>
    </Router>
  );
}
