import { useState, useEffect } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Users, 
  FolderKanban, 
  Star, 
  DollarSign, 
  TrendingUp,
  LogOut,
  FileText,
  MessageSquare,
  Briefcase,
  Menu
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface AdminDashboardProps {
  user: User;
  onLogout: () => void;
}

const AdminDashboard = ({ user, onLogout }: AdminDashboardProps) => {
  const [stats, setStats] = useState({
    activeClients: 0,
    activeProjects: 0,
    avgRating: 0,
    totalIncome: 0,
    totalExpenses: 0,
  });
  const [profile, setProfile] = useState<any>(null);

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
    const [clientsRes, projectsRes, ratingsRes, invoicesRes] = await Promise.all([
      supabase.from("clients").select("*", { count: "exact" }).eq("admin_id", user.id),
      supabase.from("projects").select("*", { count: "exact" }).eq("admin_id", user.id).eq("status", "active"),
      supabase.from("satisfaction_ratings").select("rating").eq("admin_id", user.id),
      supabase.from("invoices").select("total_amount, amount_paid").eq("admin_id", user.id),
    ]);

    const avgRating = ratingsRes.data?.length 
      ? ratingsRes.data.reduce((acc, r) => acc + r.rating, 0) / ratingsRes.data.length 
      : 0;

    const totalIncome = invoicesRes.data?.reduce((acc, inv) => acc + Number(inv.amount_paid), 0) || 0;
    const totalExpenses = 0;

    setStats({
      activeClients: clientsRes.count || 0,
      activeProjects: projectsRes.count || 0,
      avgRating: Math.round(avgRating * 10) / 10,
      totalIncome,
      totalExpenses,
    });
  };

  const StatCard = ({ title, value, icon: Icon, trend }: any) => (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-5 w-5 text-primary" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        {trend && (
          <p className="text-xs text-muted-foreground mt-1">
            <TrendingUp className="inline h-3 w-3 mr-1" />
            {trend}
          </p>
        )}
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
            <h1 className="text-2xl font-bold text-primary">Client Care CRM</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium">{profile?.full_name || "Admin"}</p>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <StatCard
            title="Active Clients"
            value={stats.activeClients}
            icon={Users}
            trend="+2 this month"
          />
          <StatCard
            title="Active Projects"
            value={stats.activeProjects}
            icon={FolderKanban}
            trend="+5 this month"
          />
          <StatCard
            title="Satisfaction Rating"
            value={`${stats.avgRating.toFixed(1)}/5`}
            icon={Star}
          />
          <StatCard
            title="Total Income"
            value={`$${stats.totalIncome.toLocaleString()}`}
            icon={DollarSign}
            trend="+12% from last month"
          />
          <StatCard
            title="Total Expenses"
            value={`$${stats.totalExpenses.toLocaleString()}`}
            icon={TrendingUp}
          />
        </div>

        {/* Tabs Section */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-5 gap-2">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="invoices">
              <FileText className="h-4 w-4 mr-2" />
              Invoices
            </TabsTrigger>
            <TabsTrigger value="requests">
              <MessageSquare className="h-4 w-4 mr-2" />
              Requests
            </TabsTrigger>
            <TabsTrigger value="services">
              <Briefcase className="h-4 w-4 mr-2" />
              Services
            </TabsTrigger>
            <TabsTrigger value="clients">
              <Users className="h-4 w-4 mr-2" />
              Clients
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Welcome back, {profile?.full_name}!</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  You have {stats.activeClients} active clients and {stats.activeProjects} ongoing projects.
                  Your average satisfaction rating is {stats.avgRating.toFixed(1)} out of 5.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invoices">
            <Card>
              <CardHeader>
                <CardTitle>Invoicing</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Create and manage invoices for your clients. Invoice features coming soon!
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
                  Manage and respond to client service requests. Feature coming soon!
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="services">
            <Card>
              <CardHeader>
                <CardTitle>Available Services</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Manage your service catalog and pricing. Feature coming soon!
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="clients">
            <Card>
              <CardHeader>
                <CardTitle>Client Management</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  View and manage your client relationships. Feature coming soon!
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboard;
