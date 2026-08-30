import { motion } from 'framer-motion';

export default function LoadingSpinner({ size = 'md', text = 'กำลังโหลด...' }) {
  const sizes = {
    sm: 'w-5 h-5',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        className={`${sizes[size]} rounded-full border-2 border-slate-200 border-t-sbac-blue`}
      />
      {text && <p className="text-xs text-ink-muted font-semibold">{text}</p>}
    </div>
  );
}
