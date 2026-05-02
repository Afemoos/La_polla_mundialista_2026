import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { 
    GoogleAuthProvider, 
    signInWithPopup, 
    signOut, 
    onAuthStateChanged
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';

interface AuthContextType {
    currentUser: User | null;
    loginWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
    loading: boolean;
    isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Define los administradores aquí (igual que en tu viejo secrets.toml)
const ADMIN_EMAILS = ["afemos027@gmail.com", "afemos023@gmail.com", "daar.523@gmail.com"];

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setCurrentUser(user);
            if(user && user.email) {
                setIsAdmin(ADMIN_EMAILS.includes(user.email));
                // AI-NOTE: Registrar automáticamente al usuario en Firestore si es su primer login
                const userDocRef = doc(db, 'users', user.uid);
                const userSnap = await getDoc(userDocRef);
                if (!userSnap.exists()) {
                    await setDoc(userDocRef, {
                        uid: user.uid,
                        email: user.email,
                        tokens: 0
                    });
                }
            } else {
                setIsAdmin(false);
            }
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const loginWithGoogle = async () => {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch (error: any) {
            console.error("Error signing in", error);
            alert(`Error al iniciar sesión con Google: ${error?.message || error}`);
        }
    };

    const logout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Error signing out", error);
        }
    };

    const value = {
        currentUser,
        loginWithGoogle,
        logout,
        loading,
        isAdmin
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
