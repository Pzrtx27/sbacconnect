import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { motion } from 'framer-motion';
import { showToast } from '../components/ui/Toast';
import sbacLogo from '../assets/sbac_logo.png';
import { 
  LogIn, 
  Lock, 
  Sun, 
  Moon, 
  Eye, 
  EyeOff, 
  User, 
  Globe,
  ShieldCheck,
  IdCard
} from 'lucide-react';

/** หน้าเริ่มต้นของแต่ละ role (ต้องตรงกับ HOME_BY_ROLE ใน App.jsx) */
const HOME_BY_ROLE = {
  student: '/home',
  teacher: '/teacher',
  academic: '/academic',
  barista: '/barista',
};

/* จำเฉพาะ "ชื่อผู้ใช้" เท่านั้น ไม่เก็บรหัสประจำตัวลงเครื่องเด็ดขาด
   เครื่องในห้องคอมเป็นเครื่องใช้ร่วม ถ้าเก็บรหัสไว้ด้วยคนถัดไปล็อกอินเป็นคนก่อนหน้าได้เลย */
const REMEMBER_KEY = 'sbac_remembered_username';

export default function LoginPage() {
  const [userId, setUserId] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lang, setLang] = useState('TH');
  const { login, authenticating } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // เติมชื่อผู้ใช้ที่เคยจำไว้ให้อัตโนมัติ (localStorage ถูกบล็อกได้ในโหมดไม่ระบุตัวตน จึงห่อ try)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) setUserId(saved);
      else setRememberMe(false);
    } catch {
      /* ignore */
    }
  }, []);

  const handleLogin = async (e) => {
    e?.preventDefault();
    if (!userId || !nationalId) {
      const errMsg = lang === 'TH' ? 'กรุณากรอกข้อมูลให้ครบถ้วน' : 'Please fill in all fields';
      setError(errMsg);
      showToast(errMsg, 'error');
      return;
    }
    setIsLoading(true);
    setError('');
    const result = await login(userId, nationalId);
    setIsLoading(false);
    if (result.success) {
      try {
        if (rememberMe) localStorage.setItem(REMEMBER_KEY, userId.trim());
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {
        /* ignore */
      }
      const role = (result.user.role || 'student').toLowerCase().trim();
      const welcomeMsg = lang === 'TH'
        ? `ยินดีต้อนรับคุณ ${result.user.name}`
        : `Welcome, ${result.user.name}`;
      showToast(welcomeMsg, 'success');
      // replace: true — กันไม่ให้กดปุ่ม back แล้วเด้งกลับหน้าล็อกอิน
      // ถ้า navigate พลาดด้วยเหตุผลใดก็ตาม LoginRoute ใน App.jsx จะเด้งให้เองอยู่ดี
      navigate(HOME_BY_ROLE[role] || '/home', { replace: true });
    } else {
      setError(result.error);
      showToast(result.error, 'error');
    }
  };

  const toggleLanguage = () => {
    const nextLang = lang === 'TH' ? 'EN' : 'TH';
    setLang(nextLang);
    showToast(nextLang === 'TH' ? 'เปลี่ยนภาษาเป็น ไทย' : 'Language changed to English', 'info');
  };

  const isDark = theme === 'dark';

  // Translations
  const t = {
    title: 'SBAC CONNECT',
    subtitle: 'Smart Campus • Access • Care',
    formTitle: lang === 'TH' ? 'เข้าสู่ระบบ' : 'Sign In',
    formDesc: lang === 'TH' ? 'กรอกชื่อผู้ใช้และรหัสประจำตัวนักเรียน' : 'Sign in with your username and student code',
    labelUser: lang === 'TH' ? 'ชื่อผู้ใช้ (Username)' : 'Username',
    phUser: lang === 'TH' ? 'กรอกชื่อผู้ใช้' : 'Enter your username',
    labelPass: lang === 'TH' ? 'รหัสประจำตัวนักเรียน' : 'Student Code',
    phPass: lang === 'TH' ? 'กรอกรหัสประจำตัว' : 'Enter your student code',
    remember: lang === 'TH' ? 'จดจำบัญชีผู้ใช้' : 'Remember me',
    forgot: lang === 'TH' ? 'ลืมรหัสผ่าน?' : 'Forgot password?',
    btnSubmit: lang === 'TH' ? 'เข้าสู่ระบบ' : 'Sign In',
    btnLoading: lang === 'TH' ? 'กำลังตรวจสอบ...' : 'Authenticating...',
    secTitle: lang === 'TH' ? 'ระบบเชื่อมต่อปลอดภัย' : 'Secured Connection',
    secDesc: lang === 'TH' ? 'ข้อมูลถูกเข้ารหัสเพื่อความปลอดภัย' : 'Your data is encrypted for security',
    forgotToast: lang === 'TH' 
      ? 'กรุณานำบัตรประจำตัวนักเรียนติดต่อฝ่ายทะเบียน อาคาร 1 ชั้น 1 เพื่อรับรหัสผ่านใหม่' 
      : 'Please contact the Registrar Office at Building 1, 1st Floor with your student ID card to reset your password.',
  };

  return (
    <div className={`min-h-screen relative flex flex-col items-center justify-center px-4 py-10 transition-colors duration-300 ${
      isDark ? 'bg-black text-white' : 'bg-slate-50 text-slate-900'
    }`}>

      {/* Top Controls Bar */}
      <div className="absolute top-5 right-5 z-20 flex items-center gap-3">
        {/* Language Toggler */}
        <button
          onClick={toggleLanguage}
          className={`flex items-center gap-1.5 px-3 min-h-[44px] rounded-xl text-xs font-bold transition-all duration-300 ${
            isDark 
              ? 'bg-neutral-900 hover:bg-neutral-800 text-slate-200 border border-neutral-800' 
              : 'bg-surface-card hover:bg-slate-50 text-slate-700 border border-slate-200/80 shadow-sm'
          }`}
          aria-label="Toggle language"
        >
          <Globe size={14} className="text-brand" />
          <span>{lang}</span>
        </button>

        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className={`w-11 h-11 flex items-center justify-center rounded-xl transition-all duration-300 border ${
            isDark 
              ? 'bg-neutral-900 hover:bg-neutral-800 text-accent-amber border-neutral-800' 
              : 'bg-surface-card hover:bg-slate-50 text-sbac-navy border-slate-200/80 shadow-sm'
          }`}
          aria-label="Toggle theme"
          id="login-theme-toggle"
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      {/* Logo and Brand Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-8 relative z-10"
      >
        <div className="relative inline-block mb-4 group">
          <div className="w-28 h-28 inline-flex items-center justify-center p-1 relative z-10">
            <img 
              src={sbacLogo} 
              alt="SBAC Logo" 
              className="w-full h-full object-contain filter drop-shadow-md select-none transform group-hover:scale-105 transition-transform duration-300" 
            />
          </div>
        </div>
        <h1 className={`text-2xl font-extrabold tracking-wider transition-colors duration-300 font-display ${
          isDark ? 'text-white' : 'text-sbac-navy'
        }`}>
          {t.title}
        </h1>
        <div className="flex items-center justify-center gap-2 mt-1.5">
          <p className={`text-[10px] font-extrabold uppercase tracking-[3px] transition-colors duration-300 ${
            isDark ? 'text-content-secondary' : 'text-content-muted'
          }`}>
            {t.subtitle}
          </p>
        </div>
      </motion.div>

      {/* Login Card */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="w-full max-w-md relative z-10"
      >
        <div className={`rounded-[32px] p-8 transition-all duration-300 border ${
          isDark 
            ? 'bg-neutral-900 border-neutral-800 shadow-2xl text-white' 
            : 'bg-surface-card shadow-xl border-slate-200 text-slate-900'
        }`}>
          <div className="mb-6">
            <h2 className={`text-xl font-bold flex items-center gap-2 transition-colors duration-300 ${
              isDark ? 'text-white' : 'text-sbac-navy'
            }`}>
              <LogIn size={22} className="text-brand" />
              <span>{t.formTitle}</span>
            </h2>
            <p className={`text-xs mt-1.5 transition-colors duration-300 ${
              isDark ? 'text-content-secondary' : 'text-content-muted'
            }`}>
              {t.formDesc}
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* User ID field */}
            <div className="space-y-1.5">
              <label htmlFor="login-user-id" className={`text-[11px] font-extrabold uppercase tracking-wide block transition-colors duration-300 ${
                isDark ? 'text-slate-200' : 'text-slate-600'
              }`}>
                {t.labelUser}
              </label>
              <div className="relative">
                <div className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-300 ${
                  isDark ? 'text-content-muted' : 'text-content-muted'
                }`}>
                  <User size={18} />
                </div>
                <input
                  type="text"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder={t.phUser}
                  className={`w-full rounded-2xl pl-12 pr-4 py-3.5 font-medium text-sm transition-all duration-250 focus:outline-none focus:ring-2 border ${
                    isDark 
                      ? 'bg-black border-neutral-800 text-white placeholder:text-content-muted focus:ring-sbac-blue/40 focus:border-sbac-blue'
                      : 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-content-muted focus:ring-sbac-blue/20 focus:border-sbac-blue focus:bg-surface-card shadow-inner'
                  }`}
                  id="login-user-id"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
            </div>

            {/* National ID / Password field */}
            <div className="space-y-1.5">
              <label htmlFor="login-national-id" className={`text-[11px] font-extrabold uppercase tracking-wide block transition-colors duration-300 ${
                isDark ? 'text-slate-200' : 'text-slate-600'
              }`}>
                {t.labelPass}
              </label>
              <div className="relative">
                <div className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-300 ${
                  isDark ? 'text-content-muted' : 'text-content-muted'
                }`}>
                  <IdCard size={18} />
                </div>
                {/* ห้ามใส่ inputMode="numeric" ตรงนี้ — รหัสประจำตัวนักเรียนขึ้นต้นด้วยตัวอักษร
                    (เช่น S0001 ดู 06_seed_real.example.sql) บนมือถือแป้นตัวเลขล้วนพิมพ์ S ไม่ได้เลย */}
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                  placeholder={t.phPass}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  className={`w-full rounded-2xl pl-12 pr-12 py-3.5 font-medium text-sm transition-all duration-250 focus:outline-none focus:ring-2 border ${
                    isDark 
                      ? 'bg-black border-neutral-800 text-white placeholder:text-content-muted focus:ring-sbac-blue/40 focus:border-sbac-blue'
                      : 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-content-muted focus:ring-sbac-blue/20 focus:border-sbac-blue focus:bg-surface-card shadow-inner'
                  }`}
                  id="login-national-id"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'ซ่อนรหัสประจำตัว' : 'แสดงรหัสประจำตัว'}
                  aria-pressed={showPassword}
                  className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-xl transition-colors ${
                    isDark ? 'text-content-muted hover:text-white hover:bg-white/5' : 'text-content-muted hover:text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Options Bar */}
            <div className="flex items-center justify-between px-1">
              <label className="flex items-center gap-2 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className={`w-4 h-4 rounded border-slate-300 text-brand focus:ring-sbac-blue/30 transition-all ${
                    isDark ? 'bg-black border-neutral-800' : ''
                  }`}
                />
                <span className={`text-xs font-bold transition-colors duration-200 group-hover:text-brand ${
                  isDark ? 'text-slate-200' : 'text-slate-600'
                }`}>
                  {t.remember}
                </span>
              </label>
              <button 
                type="button" 
                onClick={() => showToast(t.forgotToast, 'info')}
                className="text-xs font-extrabold text-brand hover:underline transition-colors min-h-[44px] px-1 -mr-1 inline-flex items-center"
              >
                {t.forgot}
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-accent-rose dark:text-accent-rose font-bold bg-rose-500/10 px-4 py-3 rounded-xl border border-rose-500/20 flex items-center gap-2"
              >
                <span>⚠️</span>
                <span>{error}</span>
              </motion.div>
            )}

            {/* Submit Button with shadow */}
            <motion.button
              type="submit"
              disabled={isLoading || authenticating}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="w-full flex items-center justify-center gap-2 text-white font-extrabold rounded-2xl py-3.5 transition-all duration-200 bg-sbac-blue hover:bg-sbac-navy shadow-lg shadow-sbac-blue/30 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              id="login-submit-btn"
            >
              {(isLoading || authenticating) ? (
                <div className="flex items-center gap-2">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                  />
                  <span>{t.btnLoading}</span>
                </div>
              ) : (
                <>
                  <span>{t.btnSubmit}</span>
                  <LogIn size={18} />
                </>
              )}
            </motion.button>
          </form>
        </div>
      </motion.div>

      {/* Security Notice */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className={`flex items-center gap-2 max-w-sm px-4 py-2 mt-6 rounded-full border text-[10px] font-semibold ${
          isDark 
            ? 'bg-neutral-900/60 border-white/10 text-content-secondary' 
            : 'bg-slate-100/50 border-slate-200 text-content-muted'
        }`}
      >
        <ShieldCheck size={14} className="text-accent-emerald" />
        <span className="leading-none">{t.secTitle}</span>
        <span className="opacity-40">|</span>
        <span className="leading-none opacity-80">{t.secDesc}</span>
      </motion.div>

      {/* Footer Info */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className={`text-[10px] font-bold text-center mt-8 space-y-1.5 relative z-10 transition-colors duration-300 ${
          isDark ? 'text-content-secondary' : 'text-content-muted'
        }`}
      >
        {/* เดิมบรรทัดนี้เป็นข้อความเดียวกับ toast ของปุ่ม "ลืมรหัสผ่าน?" แบบคำต่อคำ
            บวกกับคำว่า "ลืมรหัสผ่าน?" ซ้ำอีกรอบทั้งที่กดไม่ได้ — เหลือแค่ชื่อวิทยาลัยพอ */}
        <div className="opacity-75">วิทยาลัยเทคโนโลยีสยามบริหารธุรกิจ นนทบุรี (SBAC)</div>
        <div className="opacity-60 font-medium">© 2026 Siam Business Administration Technological College. All rights reserved.</div>
      </motion.div>
    </div>
  );
}
