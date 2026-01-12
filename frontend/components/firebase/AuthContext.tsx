'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, User, getAuth, signInWithPopup, OAuthProvider } from "firebase/auth";
import { app } from "./firebase";
import { useRouter, useParams, usePathname, useSearchParams } from "next/navigation";
import { getLocalizedHref } from "../LocalizedLink";

// --- LOGIN FUNCTION ---
export const signInWithUIUC = async () => {
  const provider = new OAuthProvider("microsoft.com");
  provider.setCustomParameters({ tenant: 'illinois.edu' });
  const auth = getAuth(app);

  try {
    await signInWithPopup(auth, provider);
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
  handleProtectedAction: (action?: () => void) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isRegistered: false,
  checkingRegistration: false,
  handleProtectedAction: () => false,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRegistered, setIsRegistered] = useState(false);
  const [checkingRegistration, setCheckingRegistration] = useState(true);
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();

  const searchParams = useSearchParams();

  const handleProtectedAction = (action?: () => void) => {
    if (!user) {
      const currentParams = searchParams.toString();
      const returnPath = pathname + (currentParams ? `?${currentParams}` : '');
      const returnUrl = encodeURIComponent(returnPath);
      router.push(getLocalizedHref(params, `/auth?returnUrl=${returnUrl}`));
      return false;
    }

    if (!isRegistered) {
      const currentParams = searchParams.toString();
      const returnPath = pathname + (currentParams ? `?${currentParams}` : '');
      const returnUrl = encodeURIComponent(returnPath);
      router.push(getLocalizedHref(params, `/complete-profile?returnUrl=${returnUrl}`));
      return false;
    }

    if (action) {
      action();
    }
    return true;
  };

  useEffect(() => {
    const auth = getAuth(app);
    let mounted = true;

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
            let retries = 0;
            while (!created && retries < 3) {
              retries++;
              // Wait 5 seconds before retrying
              console.log(`Account creation failed, retrying in 5s... (Attempt ${retries}/3)`);
              await new Promise(resolve => setTimeout(resolve, 5000));
              created = await createAccount();
            }
            // Once created, we treat it as existing
            if (created) {
              isAccountExists = true;
            } else {
              console.error("Critical: Failed to create account after 3 retries.");
              // Ensure we don't proceed pretending it exists
              isAccountExists = false;
              router.push(getLocalizedHref(params, '/error'));
              return; // Stop execution
            }
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
  const checkProtection = () => {
    // Common variables
    const protectedRoutes = ['/dashboard', '/history', '/roleSettings'];
    const isProtectedRoute = protectedRoutes.some(route => pathname?.includes(route));
    const isCompleteProfilePage = pathname?.includes('/complete-profile');

    return { isProtectedRoute, isCompleteProfilePage };
  };

  const { isProtectedRoute, isCompleteProfilePage } = checkProtection();

  useEffect(() => {
    if (loading) return;

    const currentParams = searchParams.toString();
    const returnPath = pathname + (currentParams ? `?${currentParams}` : '');
    const returnUrl = encodeURIComponent(returnPath);

    // 1. Logged In User
    if (user) {
      if (!checkingRegistration && !isRegistered) {
        // User is logged in but NOT registered. 
        // Only force redirect if on a protected route.
        if (isProtectedRoute && !isCompleteProfilePage) {
          console.log("User not registered on database, accessing protected route, forcing profile completion...");
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
        router.push(getLocalizedHref(params, `/auth?returnUrl=${returnUrl}`));
      }
    }

  }, [user, loading, checkingRegistration, isRegistered, pathname, router, params, searchParams, isProtectedRoute, isCompleteProfilePage]);

  // Determine if we should block rendering
  // We block if:
  // 1. Auth is still loading AND we are on a protected route
  // 2. Auth is done, but we are checking registration AND we are on a protected route (to prevent content flash before redirect to complete-profile)
  const shouldBlock = (loading && isProtectedRoute) ||
    (user && checkingRegistration && isProtectedRoute);

  return (
    <AuthContext.Provider value={{ user, loading, isRegistered, checkingRegistration, handleProtectedAction }}>
      {/* 
         If we are on a protected route, we must wait for auth to resolve.
         If we are on a public route, we render immediately (user will be null initially).
      */}
      {shouldBlock ? <div>Loading account...</div> : children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);