import { useState, useEffect } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FolderKanban, FileText, MessageSquare, Star, LogOut, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface ClientDashboardProps {
  user: User;
  onLogout: () => void;
}

const ClientDashboard = ({ user, onLogout }: ClientDashboardProps) => {
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState({
    activeProjects: 0,
    totalInvoices: 0,
    pendingRequests: 0,
  });

  useEffect(() => {
    fetchProfile();
    fetchStats();
  }, [user.id]);

  const fetchProfile = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    setProfile(data);
  };

  const fetchStats = async () => {
    const [projectsRes, invoicesRes, requestsRes] = await Promise.all([
      supabase.from("projects").select("*", { count: "exact" }).eq("client_id", user.id).eq("status", "active"),
      supabase.from("invoices").select("*", { count: "exact" }).eq("client_id", user.id),
      supabase.from("service_requests").select("*", { count: "exact" }).eq("client_id", user.id).eq("status", "pending"),
    ]);

    setStats({
      activeProjects: projectsRes.count || 0,
      totalInvoices: invoicesRes.count || 0,
      pendingRequests: requestsRes.count || 0,
    });
  };

  const StatCard = ({ title, value, icon: Icon }: any) => (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-5 w-5 text-primary" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );

  const Navigation = () => (
    <div className="space-y-2">
      <Button variant="ghost" className="w-full justify-start" onClick={onLogout}>
        <LogOut className="mr-2 h-4 w-4" />
        Logout
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sheet>
              <SheetTrigger asChild className="lg:hidden">
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left">
                <Navigation />
              </SheetContent>
            </Sheet>
            <h1 className="text-2xl font-bold text-primary">Client Portal</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium">{profile?.full_name || "Client"}</p>
              <p className="text-xs text-muted-foreground">{profile?.email}</p>
            </div>
            <Button variant="outline" onClick={onLogout} className="hidden lg:flex">
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard
            title="Active Projects"
            value={stats.activeProjects}
            icon={FolderKanban}
          />
          <StatCard
            title="Invoices"
            value={stats.totalInvoices}
            icon={FileText}
          />
          <StatCard
            title="Pending Requests"
            value={stats.pendingRequests}
            icon={MessageSquare}
          />
        </div>

        {/* Tabs Section */}
        <Tabs defaultValue="projects" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4">
            <TabsTrigger value="projects">
              <FolderKanban className="h-4 w-4 mr-2" />
              Projects
            </TabsTrigger>
            <TabsTrigger value="invoices">
              <FileText className="h-4 w-4 mr-2" />
              Invoices
            </TabsTrigger>
            <TabsTrigger value="requests">
              <MessageSquare className="h-4 w-4 mr-2" />
              Requests
            </TabsTrigger>
            <TabsTrigger value="feedback">
              <Star className="h-4 w-4 mr-2" />
              Feedback
            </TabsTrigger>
          </TabsList>

          <TabsContent value="projects">
            <Card>
              <CardHeader>
                <CardTitle>My Projects</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  View your active and completed projects. Feature coming soon!
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invoices">
            <Card>
              <CardHeader>
                <CardTitle>Invoices</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  View and download your invoices. Feature coming soon!
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requests">
            <Card>
              <CardHeader>
                <CardTitle>Service Requests</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Submit and track your service requests. Feature coming soon!
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="feedback">
            <Card>
              <CardHeader>
                <CardTitle>Satisfaction Feedback</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Rate your experience and provide feedback. Feature coming soon!
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default ClientDashboard;
