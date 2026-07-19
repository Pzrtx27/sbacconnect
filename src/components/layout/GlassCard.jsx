import { motion } from 'framer-motion';
import { useTheme } from '../../contexts/ThemeContext';

export default function GlassCard({ children, className = '', onClick, delay = 0 }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ 
        duration: 0.4, 
        delay,
        ease: [0.16, 1, 0.3, 1] 
      }}
      whileTap={onClick ? { scale: 0.97 } : undefined}
      onClick={onClick}
      className={`rounded-3xl p-5 transition-colors duration-300 ${
        isDark
          ? 'bg-white/[0.06] backdrop-blur-2xl border border-white/10'
          : 'bg-white shadow-card border border-slate-100 hover:shadow-card-hover'
      } ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </motion.div>
  );
}
