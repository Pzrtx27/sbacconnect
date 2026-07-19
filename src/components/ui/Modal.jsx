import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

export default function Modal({ isOpen, onClose, title, children }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
          />
          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 400 }}
            className="fixed bottom-0 left-0 right-0 z-[61] max-w-lg mx-auto"
          >
            <div className={`rounded-t-3xl shadow-glass-lg max-h-[85vh] flex flex-col safe-bottom transition-colors duration-300 ${
              isDark ? 'bg-slate-800' : 'bg-white'
            }`}>
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className={`w-10 h-1 rounded-full transition-colors duration-300 ${
                  isDark ? 'bg-slate-600' : 'bg-slate-200'
                }`} />
              </div>
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-3">
                <h2 className={`text-lg font-extrabold transition-colors duration-300 ${
                  isDark ? 'text-white' : 'text-sbac-navy'
                }`}>{title}</h2>
                <button 
                  onClick={onClose}
                  className={`p-2 rounded-xl transition-colors ${
                    isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'
                  }`}
                >
                  <X size={20} className={isDark ? 'text-slate-400' : 'text-ink-muted'} />
                </button>
              </div>
              {/* Content */}
              <div className="px-6 pb-6 overflow-y-auto flex-1">
                {children}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
