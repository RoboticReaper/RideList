'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, User, getAuth, signInWithRedirect, getRedirectResult, signInWithPopup } from "firebase/auth";
import { app } from "./firebase";
import { OAuthProvider } from "firebase/auth";
import { useRouter } from "next/navigation";
import { getLocalizedHref } from "../LocalizedLink";
import { useParams } from "next/navigation";

export const signInWithUIUC = async () => {
  const provider = new OAuthProvider("microsoft.com")
  provider.setCustomParameters({ tenant: 'illinois.edu' });

  const auth = getAuth(app);

  const isLocalhost = window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  try {
    if (isLocalhost) {
      // DEVELOPMENT: Use Popup to avoid the "reprocess" loop
      console.log("Using Popup (Localhost Mode)");
      await signInWithPopup(auth, provider);
    } else {
      //  PRODUCTION / MOBILE: Use Redirect
      console.log("Using Redirect (Production Mode)");
      await signInWithRedirect(auth, provider);
    }
    return true
  } catch (error) {
    console.error(error)
    return false
  }
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter()
  const params = useParams();

  useEffect(() => {
    const auth = getAuth(app);

    const handleRedirectCallback = async () => {
      try {
        const result = await getRedirectResult(auth);

        if (result) {
          // User successfully returned from Microsoft
          const user = result.user;
          console.log("Logged in via Redirect:", user.email);

          // SECURITY STEP:
          // Immediately call your API verification here to ensure it's illinois.edu
          //   await verifyUserWithServer(user); 
        }
      } catch (error) {
        console.error("Redirect login error:", error);
      }
    };

    handleRedirectCallback();

    // Subscribe to auth state changes
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push(getLocalizedHref(params, '/'))
      }

      setUser(user);
      setLoading(false);
    });



    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

// Custom hook to access auth state in any component
export const useAuth = () => useContext(AuthContext);