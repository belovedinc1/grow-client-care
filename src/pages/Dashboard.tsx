import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { User, Session } from "@supabase/supabase-js";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import ClientDashboard from "@/components/dashboard/ClientDashboard";
import { Loader2 } from "lucide-react";

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<"admin" | "client" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
      }
    );

    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/auth");
        return;
      }

      setSession(session);
      setUser(session.user);

      // SECURITY FIX: Fetch role from secure user_roles table instead of profiles
      // The get_user_role function is SECURITY DEFINER and bypasses RLS safely
      const { data: roleData, error: roleError } = await supabase
        .rpc('get_user_role', { _user_id: session.user.id });

      if (roleError) {
        console.error("Error fetching user role:", roleError);
        // Fallback: try to get role from profiles (for backward compatibility during migration)
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single();

        if (profile) {
          setUserRole(profile.role as "admin" | "client");
        }
      } else if (roleData) {
        setUserRole(roleData as "admin" | "client");
      } else {
        // Default to client if no role found
        setUserRole("client");
      }
      
      setLoading(false);
    };

    initAuth();

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast({
        title: "Logged out successfully",
        description: "See you soon!",
      });
      navigate("/auth");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !userRole) {
    return null;
  }

  return (
    <>
      {userRole === "admin" ? (
        <AdminDashboard user={user} onLogout={handleLogout} />
      ) : (
        <ClientDashboard user={user} onLogout={handleLogout} />
      )}
    </>
  );
};

export default Dashboard;
