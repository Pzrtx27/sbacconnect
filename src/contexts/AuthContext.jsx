import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { sha256 } from '../utils/crypto';

const AuthContext = createContext(null);

// Rate limiting constants
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 3 * 60 * 1000; // 3 minutes

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const loginAttempts = useRef(0);
  const lockoutUntil = useRef(null);

  useEffect(() => {
    // Check localStorage for saved session
    const saved = localStorage.getItem('sbac_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Basic session validation — must have id and role
        if (parsed && parsed.id && parsed.role) {
          setUser(parsed);
        } else {
          localStorage.removeItem('sbac_user');
        }
      } catch (e) {
        localStorage.removeItem('sbac_user');
      }
    }
    setLoading(false);
  }, []);

  const login = async (userId, nationalId) => {
    // Rate limiting check
    if (lockoutUntil.current && Date.now() < lockoutUntil.current) {
      const remainSec = Math.ceil((lockoutUntil.current - Date.now()) / 1000);
      return { 
        success: false, 
        error: `ระบบถูกล็อคชั่วคราว กรุณารอ ${remainSec} วินาที แล้วลองใหม่` 
      };
    }

    setLoading(true);
    try {
      let userData = null;

      // Compute SHA-256 hash of national ID
      const hashedNationalId = await sha256(nationalId);
      let studentDoc = null;

      // 1. Try querying via hashed national ID (Secure Import)
      const studentsHashQuery = query(
        collection(db, 'students'),
        where('national_id_hash', '==', hashedNationalId)
      );
      const studentHashSnap = await getDocs(studentsHashQuery);
      
      if (!studentHashSnap.empty) {
        studentDoc = studentHashSnap.docs.find(d => d.id === userId);
      }

      // 2. Fallback: Try querying via plain national ID (Legacy)
      if (!studentDoc) {
        const studentsLegacyQuery = query(
          collection(db, 'students'),
          where('national_id', '==', nationalId)
        );
        const studentLegacySnap = await getDocs(studentsLegacyQuery);
        if (!studentLegacySnap.empty) {
          studentDoc = studentLegacySnap.docs.find(d => d.id === userId);
        }
      }
      
      if (studentDoc) {
        const sData = studentDoc.data();
        // Get user data for balance etc.
        const userDoc = await getDoc(doc(db, 'users', `user_${userId}`));
        const uData = userDoc.exists() ? userDoc.data() : {};
        
        userData = {
          id: userId,
          name: sData.full_name || uData.name || 'นักเรียน',
          role: uData.role || 'student',
          class_id: sData.class_id || uData.class || '',
          branch: sData.branch || '',
          year: sData.year || '',
          room: sData.room || '',
          session: sData.session || '',
          card_balance: uData.card_balance || 0,
          email: sData.email || uData.email || '',
        };
      }

      // Check users collection (for admin, barista, teacher, academic)
      // Verify password/national_id stored in Firestore (plain or hashed)
      if (!userData) {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
          const uData = userDoc.data();
          const isMatch = 
            uData.password === nationalId || 
            uData.national_id === nationalId ||
            uData.password_hash === hashedNationalId ||
            uData.national_id_hash === hashedNationalId;

          if (isMatch) {
            userData = {
              id: userId,
              name: uData.name || userId,
              role: uData.role || 'student',
              class_id: uData.class || '',
              card_balance: uData.card_balance || 0,
              branch: uData.branch || '',
              year: uData.year || '',
              room: uData.room || '',
              session: uData.session || '',
            };
          }
        }
      }

      if (userData) {
        // Reset login attempts on success
        loginAttempts.current = 0;
        lockoutUntil.current = null;

        setUser(userData);
        localStorage.setItem('sbac_user', JSON.stringify(userData));
        return { success: true, user: userData };
      }

      // Failed login — increment attempts
      loginAttempts.current += 1;
      if (loginAttempts.current >= MAX_LOGIN_ATTEMPTS) {
        lockoutUntil.current = Date.now() + LOCKOUT_DURATION_MS;
        loginAttempts.current = 0;
        return { 
          success: false, 
          error: `พยายามเข้าสู่ระบบผิดเกินกำหนด ระบบถูกล็อค 3 นาที` 
        };
      }

      const remaining = MAX_LOGIN_ATTEMPTS - loginAttempts.current;
      return { 
        success: false, 
        error: `รหัสหรือเลขบัตรประชาชนไม่ถูกต้อง (เหลืออีก ${remaining} ครั้ง)` 
      };
    } catch (err) {
      // Do not expose error details to client
      return { success: false, error: 'ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่อีกครั้ง' };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('sbac_user');
  };

  const updateBalance = (newBalance) => {
    if (user) {
      const updated = { ...user, card_balance: newBalance };
      setUser(updated);
      localStorage.setItem('sbac_user', JSON.stringify(updated));
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateBalance }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

export default AuthContext;
