import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { User, Session } from "@supabase/supabase-js";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import ClientDashboard from "@/components/dashboard/ClientDashboard";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const OWNER_EMAIL = "belovedstudioinc@gmail.com";

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyRole, setCompanyRole] = useState<"admin" | "agent" | "client" | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      setUser(session.user);

      // Get membership
      let { data: membership } = await supabase
        .from("company_members")
        .select("company_id, role")
        .eq("user_id", session.user.id)
        .maybeSingle();

      // If owner email and no membership, bootstrap
      if (!membership && session.user.email?.toLowerCase() === OWNER_EMAIL) {
        const { error: bootErr } = await supabase.rpc("bootstrap_owner_admin");
        if (bootErr) {
          console.error("Bootstrap error", bootErr);
        } else {
          const refetch = await supabase
            .from("company_members")
            .select("company_id, role")
            .eq("user_id", session.user.id)
            .maybeSingle();
          membership = refetch.data;
        }
      }

      if (!membership) {
        setBlocked(true);
        setLoading(false);
        return;
      }

      setCompanyId(membership.company_id);
      setCompanyRole(membership.role as "admin" | "agent" | "client");
      setLoading(false);
    };

    init();
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast({ title: "Logged out" });
      navigate("/auth");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold">Access denied</h1>
          <p className="text-muted-foreground">
            Your account is not associated with a company. Account creation is invite-only —
            please contact the administrator to receive an invitation.
          </p>
          <Button onClick={handleLogout}>Sign out</Button>
        </div>
      </div>
    );
  }

  if (!user || !companyId || !companyRole) return null;

  const isStaff = companyRole === "admin" || companyRole === "agent";

  return isStaff ? (
    <AdminDashboard user={user} onLogout={handleLogout} companyId={companyId} role={companyRole} />
  ) : (
    <ClientDashboard user={user} onLogout={handleLogout} companyId={companyId} />
  );
};

export default Dashboard;
