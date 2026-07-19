import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { motion } from 'framer-motion';
import { showToast } from '../components/ui/Toast';
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

export default function LoginPage() {
  const [userId, setUserId] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lang, setLang] = useState('TH');
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

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
      const role = result.user.role;
      const welcomeMsg = lang === 'TH' 
        ? `ยินดีต้อนรับคุณ ${result.user.name}` 
        : `Welcome, ${result.user.name}`;
      showToast(welcomeMsg, 'success');
      if (role === 'barista') navigate('/barista');
      else if (role === 'academic') navigate('/');
      else navigate('/');
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
    formDesc: lang === 'TH' ? 'กรุณาเข้าสู่ระบบด้วยรหัสนักเรียน/อาจารย์' : 'Please sign in with your student/staff ID',
    labelUser: lang === 'TH' ? 'รหัสนักเรียน / รหัสอาจารย์' : 'Student / Teacher ID',
    phUser: lang === 'TH' ? 'กรอกรหัสประจำตัว' : 'Enter your ID number',
    labelPass: lang === 'TH' ? 'เลขประจำตัวประชาชน (National ID)' : 'National ID (Password)',
    phPass: lang === 'TH' ? 'กรอกเลขบัตรประชาชน 13 หลัก' : 'Enter 13-digit National ID',
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
    <div className={`min-h-screen relative overflow-hidden flex flex-col items-center justify-center px-4 py-10 transition-colors duration-300 ${
      isDark ? 'bg-surface-dark' : 'bg-surface'
    }`}>
      {/* Background decorative elements */}
      <div className={`absolute top-[-10%] left-[-15%] w-[450px] h-[450px] rounded-full pointer-events-none transition-opacity duration-300 ${
        isDark ? 'opacity-40' : 'opacity-20'
      }`} style={{
        background: 'radial-gradient(circle, rgba(26,60,200,0.18) 0%, transparent 70%)',
        filter: 'blur(50px)',
      }} />
      <div className={`absolute bottom-[-10%] right-[-10%] w-[350px] h-[350px] rounded-full pointer-events-none transition-opacity duration-300 ${
        isDark ? 'opacity-30' : 'opacity-15'
      }`} style={{
        background: 'radial-gradient(circle, rgba(200,16,46,0.15) 0%, transparent 70%)',
        filter: 'blur(50px)',
      }} />

      {/* Shimmer Line */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-sbac-blue/40 to-transparent animate-shimmer pointer-events-none" 
           style={{ backgroundSize: '200% 100%' }} />

      {/* Top Controls Bar */}
      <div className="absolute top-5 right-5 z-20 flex items-center gap-3">
        {/* Language Toggler */}
        <button
          onClick={toggleLanguage}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-300 ${
            isDark 
              ? 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10' 
              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 shadow-sm'
          }`}
          aria-label="Toggle language"
        >
          <Globe size={14} className="text-sbac-blue-light" />
          <span>{lang}</span>
        </button>

        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className={`p-2 rounded-xl transition-all duration-300 border ${
            isDark 
              ? 'bg-white/5 hover:bg-white/10 text-amber-400 border-white/10' 
              : 'bg-white hover:bg-slate-50 text-sbac-navy border-slate-200/80 shadow-sm'
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
          {/* Subtle Logo Backdrop glow */}
          <div className="absolute inset-0 bg-sbac-blue/10 dark:bg-sbac-blue/20 blur-xl rounded-full scale-120 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="w-24 h-24 inline-flex items-center justify-center p-1 relative z-10">
            <img 
              src="/assets/sbac-logo.svg" 
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
          <div className={`h-px w-6 bg-gradient-to-r from-transparent ${isDark ? 'to-sbac-blue/50' : 'to-sbac-blue/30'}`} />
          <p className={`text-[10px] font-extrabold uppercase tracking-[4px] transition-colors duration-300 ${
            isDark ? 'text-slate-300' : 'text-slate-500'
          }`}>
            {t.subtitle}
          </p>
          <div className={`h-px w-6 bg-gradient-to-l from-transparent ${isDark ? 'to-sbac-blue/50' : 'to-sbac-blue/30'}`} />
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
            ? 'bg-slate-900/60 backdrop-blur-2xl border-white/10 shadow-glass-lg' 
            : 'bg-white shadow-card-hover border-slate-100'
        }`}>
          <div className="mb-6">
            <h2 className={`text-xl font-bold flex items-center gap-2 transition-colors duration-300 ${
              isDark ? 'text-white' : 'text-sbac-navy'
            }`}>
              <LogIn size={22} className="text-sbac-blue-light" />
              <span>{t.formTitle}</span>
            </h2>
            <p className={`text-xs mt-1.5 transition-colors duration-300 ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}>
              {t.formDesc}
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* User ID field */}
            <div className="space-y-1.5">
              <label className={`text-[11px] font-extrabold uppercase tracking-wide block transition-colors duration-300 ${
                isDark ? 'text-slate-400' : 'text-slate-600'
              }`}>
                {t.labelUser}
              </label>
              <div className="relative">
                <div className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-300 ${
                  isDark ? 'text-slate-500' : 'text-slate-400'
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
                      ? 'bg-slate-950/40 border-white/10 text-white placeholder:text-slate-600 focus:ring-sbac-blue/30 focus:border-sbac-blue/50 focus:bg-slate-950/60'
                      : 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:ring-sbac-blue/20 focus:border-sbac-blue focus:bg-white shadow-inner'
                  }`}
                  id="login-user-id"
                  autoComplete="username"
                />
              </div>
            </div>

            {/* National ID / Password field */}
            <div className="space-y-1.5">
              <label className={`text-[11px] font-extrabold uppercase tracking-wide block transition-colors duration-300 ${
                isDark ? 'text-slate-400' : 'text-slate-600'
              }`}>
                {t.labelPass}
              </label>
              <div className="relative">
                <div className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-300 ${
                  isDark ? 'text-slate-500' : 'text-slate-400'
                }`}>
                  <IdCard size={18} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                  placeholder={t.phPass}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className={`w-full rounded-2xl pl-12 pr-12 py-3.5 font-medium text-sm transition-all duration-250 focus:outline-none focus:ring-2 border ${
                    isDark 
                      ? 'bg-slate-950/40 border-white/10 text-white placeholder:text-slate-600 focus:ring-sbac-blue/30 focus:border-sbac-blue/50 focus:bg-slate-950/60'
                      : 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:ring-sbac-blue/20 focus:border-sbac-blue focus:bg-white shadow-inner'
                  }`}
                  id="login-national-id"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute right-3.5 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-colors ${
                    isDark ? 'text-slate-500 hover:text-white hover:bg-white/5' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
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
                  className={`w-4 h-4 rounded border-slate-300 text-sbac-blue focus:ring-sbac-blue/30 transition-all ${
                    isDark ? 'bg-slate-950/60 border-white/10' : ''
                  }`} 
                  defaultChecked
                />
                <span className={`text-xs font-bold transition-colors duration-200 group-hover:text-sbac-blue-light ${
                  isDark ? 'text-slate-400' : 'text-slate-600'
                }`}>
                  {t.remember}
                </span>
              </label>
              <button 
                type="button" 
                onClick={() => showToast(t.forgotToast, 'info')}
                className="text-xs font-extrabold text-sbac-blue-light hover:text-sbac-blue hover:underline transition-colors"
              >
                {t.forgot}
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-rose-500 dark:text-rose-400 font-bold bg-rose-500/10 px-4 py-3 rounded-xl border border-rose-500/20 flex items-center gap-2"
              >
                <span>⚠️</span>
                <span>{error}</span>
              </motion.div>
            )}

            {/* Submit Button */}
            <motion.button
              type="submit"
              disabled={isLoading}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="w-full flex items-center justify-center gap-2 text-white font-extrabold rounded-2xl py-3.5 transition-all duration-300 shadow-button select-none bg-gradient-to-r from-sbac-navy via-sbac-blue to-sbac-navy bg-[length:200%_auto] hover:bg-right active:shadow-button disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              id="login-submit-btn"
            >
              {isLoading ? (
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
            ? 'bg-slate-950/20 border-white/5 text-slate-500' 
            : 'bg-slate-100/50 border-slate-200 text-slate-500'
        }`}
      >
        <ShieldCheck size={14} className="text-emerald-500" />
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
          isDark ? 'text-slate-600' : 'text-slate-400'
        }`}
      >
        <div>{t.forgotToast}</div>
        <div className="opacity-75">{t.forgot} • วิทยาลัยเทคโนโลยีสยามบริหารธุรกิจ นนทบุรี (SBAC)</div>
        <div className="opacity-60 font-medium">© 2026 Siam Business Administration Technological College. All rights reserved.</div>
      </motion.div>
    </div>
  );
}
