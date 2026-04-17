import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, LogOut, Building2 } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import TicketsManager from "@/components/crm/TicketsManager";
import InvitesManager from "@/components/crm/InvitesManager";

const CrmDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null),
    );
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate("/auth");
      else setUser(session.user);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const { membership, loading: memLoading } = useCompany(user);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Logged out" });
    navigate("/auth");
  };

  if (authLoading || memLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  if (!membership) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground" />
          <h2 className="text-xl font-semibold">No company assigned</h2>
          <p className="text-sm text-muted-foreground">
            Your account isn't linked to any company. Ask an admin to invite you,
            or create a new company.
          </p>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => navigate("/auth")}>Create company</Button>
            <Button variant="outline" onClick={handleLogout}>Logout</Button>
          </div>
        </div>
      </div>
    );
  }

  const initials = (membership.full_name ?? user.email ?? "U")
    .split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

  const isAdmin = membership.role === "admin";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-primary rounded-lg flex-shrink-0">
              <Building2 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold truncate">{membership.company_name}</p>
              <p className="text-xs text-muted-foreground capitalize">{membership.role}</p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="truncate max-w-[200px]">
                {membership.full_name ?? user.email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" /> Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <Tabs defaultValue="tickets">
          <TabsList>
            <TabsTrigger value="tickets">Tickets</TabsTrigger>
            {isAdmin && <TabsTrigger value="team">Team & invites</TabsTrigger>}
          </TabsList>
          <TabsContent value="tickets" className="mt-4">
            <TicketsManager
              companyId={membership.company_id}
              role={membership.role}
              userId={user.id}
            />
          </TabsContent>
          {isAdmin && (
            <TabsContent value="team" className="mt-4">
              <InvitesManager companyId={membership.company_id} />
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
};

export default CrmDashboard;
