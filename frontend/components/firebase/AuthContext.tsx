'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, User, getAuth, signInWithRedirect, getRedirectResult, signInWithPopup, OAuthProvider, setPersistence, browserLocalPersistence } from "firebase/auth";
import { app } from "./firebase";
import { useRouter, useParams, usePathname } from "next/navigation";
import { getLocalizedHref } from "../LocalizedLink";

// --- LOGIN FUNCTION ---
export const signInWithUIUC = async () => {
  const provider = new OAuthProvider("microsoft.com");
  provider.setCustomParameters({ tenant: 'illinois.edu' });
  const auth = getAuth(app);

  try {
    // Recommendation: Use Popup for localhost to avoid redirect issues
    // Use Redirect for production/mobile
    // Localhost: Enable Popup to bypass auth handler redirect failures (init.json 404 / 3rd party cookies)
    if (window.location.hostname === "localhost") {
      await signInWithPopup(auth, provider);
    } else {
      await signInWithRedirect(auth, provider);
    }
    return true;
  } catch (error) {
    console.error("Login Error:", error);
    return false;
  }
};

// --- CONTEXT ---
interface AuthContextType {
  user: User | null;
  loading: boolean;
  isRegistered: boolean;
  checkingRegistration: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isRegistered: false,
  checkingRegistration: false,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRegistered, setIsRegistered] = useState(false);
  const [checkingRegistration, setCheckingRegistration] = useState(true);
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();

  useEffect(() => {
    const auth = getAuth(app);
    let mounted = true;

    // 1. Handle Redirect Result (Runs once on mount)
    getRedirectResult(auth).then((result) => {
      if (result && mounted) {
        // Optional: Call your API here if needed
      }
    }).catch((error) => {
      console.error("Redirect Error:", error);
    });

    // 2. Listen for Auth Changes
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (mounted) {
        setUser(currentUser);
        // Only set loading to false after we get the first auth state response
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // 3. CHECK REGISTRATION
  useEffect(() => {
    async function checkRegistration() {
      if (user) {
        setCheckingRegistration(true);
        try {
          const token = await user.getIdToken();

          const accountCheckRes = await fetch('/api/user/check-account', { headers: { 'Authorization': `Bearer ${token}` } });
          let isAccountExists = false;

          if (accountCheckRes.ok) {
            const data = await accountCheckRes.json();
            isAccountExists = data.exists;
          }

          // IF ACCOUNT DOES NOT EXIST, CREATE IT (RETRY LOOP)
          if (!isAccountExists) {
            const createAccount = async () => {
              try {
                const createRes = await fetch('/api/user/create-account', {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                return createRes.ok;
              } catch (e) {
                console.error("Error creating account:", e);
                return false;
              }
            };

            let created = await createAccount();
            while (!created) {
              // Wait 5 seconds before retrying
              console.log("Account creation failed, retrying in 5s...");
              await new Promise(resolve => setTimeout(resolve, 5000));
              created = await createAccount();
            }
            // Once created, we treat it as existing
            isAccountExists = true;
          }

          // NOW CHECK PROFILE
          const profileRes = await fetch('/api/user/check-profile', { headers: { 'Authorization': `Bearer ${token}` } });
          let isProfileExists = false;
          if (profileRes.ok) {
            const data = await profileRes.json();
            isProfileExists = data.exists;
          }

          setIsRegistered(isAccountExists && isProfileExists);

        } catch (e) {
          console.error("Error checking/creating registration:", e);
          setIsRegistered(false);
        } finally {
          setCheckingRegistration(false);
        }
      } else {
        setIsRegistered(false);
        setCheckingRegistration(false);
      }
    }

    if (!loading) {
      checkRegistration();
    }
  }, [user, loading]);

  // 4. COMPREHENSIVE AUTH PROTECTION
  useEffect(() => {
    if (loading) return;

    // Common variables
    const protectedRoutes = ['/dashboard', '/history', '/roleSettings'];
    const isProtectedRoute = protectedRoutes.some(route => pathname?.includes(route));
    const isCompleteProfilePage = pathname?.includes('/complete-profile');
    const isAuthPage = pathname?.includes('/auth'); // Assuming login page is /auth

    // 1. Logged In User
    if (user) {
      if (!checkingRegistration && !isRegistered) {
        // User is logged in but NOT registered. 
        // Only force redirect if on a protected route.
        if (isProtectedRoute && !isCompleteProfilePage) {
          console.log("User not registered on database, accessing protected route, forcing profile completion...");
          const returnUrl = encodeURIComponent(pathname || '/dashboard');
          router.push(getLocalizedHref(params, `/complete-profile?returnUrl=${returnUrl}`));
        }
      }
      // If registered, they can go anywhere.
    }
    // 2. Not Logged In User
    else {
      // If trying to access a private route, send to login.
      if (isProtectedRoute) {
        console.log("No user, protecting private route...");
        const returnUrl = encodeURIComponent(pathname || '/dashboard');
        router.push(getLocalizedHref(params, `/auth?returnUrl=${returnUrl}`));
      }
    }

  }, [user, loading, checkingRegistration, isRegistered, pathname, router, params]);

  return (
    <AuthContext.Provider value={{ user, loading, isRegistered, checkingRegistration }}>
      {/* If we are loading, you might want to show a spinner 
         so the user doesn't see a flash of protected content 
         or the redirect happening.
      */}
      {loading ? <div>Loading...</div> : children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);