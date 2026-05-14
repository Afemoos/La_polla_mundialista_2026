import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { 
    GoogleAuthProvider, 
    signInWithPopup, 
    signOut, 
    onAuthStateChanged
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
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
                // AI-NOTE: Migración a nueva estructura. Intentar leer de la nueva ruta primero.
                const newProfileRef = doc(db, 'users', user.uid, 'profile', 'data');
                const newProfileSnap = await getDoc(newProfileRef);
                
                if (!newProfileSnap.exists()) {
                    // AI-NOTE: Intentar migrar datos antiguos. La ruta users/{uid} ya no tiene reglas
                    // de lectura en firestore.rules, por lo que getDoc puede lanzar permission-denied.
                    // Envolvemos en try/catch para que usuarios nuevos no se queden en pantalla en blanco.
                    try {
                        const oldUserRef = doc(db, 'users', user.uid);
                        const oldUserSnap = await getDoc(oldUserRef);
                        
                        if (oldUserSnap.exists()) {
                            const oldData = oldUserSnap.data();
                            await setDoc(newProfileRef, {
                                uid: user.uid,
                                email: user.email,
                                tokens: oldData.tokens || 0,
                                paidFeatures: [],
                                deletedAt: null,
                                createdAt: oldData.createdAt || serverTimestamp(),
                                updatedAt: serverTimestamp(),
                            });
                        } else {
                            // Usuario completamente nuevo
                            await setDoc(newProfileRef, {
                                uid: user.uid,
                                email: user.email,
                                tokens: 0,
                                paidFeatures: [],
                                deletedAt: null,
                                createdAt: serverTimestamp(),
                                updatedAt: serverTimestamp(),
                            });
                        }
                    } catch {
                        // AI-NOTE: Si falla la lectura de la ruta antigua (ej. permission-denied),
                        // crear perfil nuevo directamente. La migración de datos antiguos ya no es necesaria
                        // porque la fase de limpieza eliminó las colecciones antiguas.
                        await setDoc(newProfileRef, {
                            uid: user.uid,
                            email: user.email,
                            tokens: 0,
                            paidFeatures: [],
                            deletedAt: null,
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                        });
                    }
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
