import { useState, useEffect } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  FolderKanban, 
  Star, 
  DollarSign, 
  TrendingDown,
  LogOut,
  FileText,
  MessageSquare,
  Briefcase,
  Menu,
  Users2,
  Receipt
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ServicesManager } from "./ServicesManager";
import { ClientsManager } from "./ClientsManager";
import { InvoiceManager } from "./InvoiceManager";
import { ServiceRequestsManager } from "./ServiceRequestsManager";
import { ProjectsManager } from "./ProjectsManager";
import { ExpenseManager } from "./ExpenseManager";
import { TeamManager } from "./TeamManager";

interface AdminDashboardProps {
  user: User;
  onLogout: () => void;
}

const AdminDashboard = ({ user, onLogout }: AdminDashboardProps) => {
  const [activeTab, setActiveTab] = useState("overview");
  const [stats, setStats] = useState({
    activeClients: 0,
    activeProjects: 0,
    avgRating: 0,
    totalIncome: 0,
    totalExpenses: 0,
  });
  const [profile, setProfile] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);

  useEffect(() => {
    fetchProfile();
    fetchStats();
    fetchProjects();
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
    const [clientsRes, projectsRes, ratingsRes, invoicesRes, expensesRes] = await Promise.all([
      supabase.from("clients").select("*", { count: "exact" }).eq("admin_id", user.id),
      supabase.from("projects").select("*", { count: "exact" }).eq("admin_id", user.id).eq("status", "active"),
      supabase.from("satisfaction_ratings").select("rating").eq("admin_id", user.id),
      supabase.from("invoices").select("total_amount, amount_paid").eq("admin_id", user.id),
      supabase.from("expenses").select("amount").eq("admin_id", user.id),
    ]);

    const avgRating = ratingsRes.data?.length 
      ? ratingsRes.data.reduce((acc, r) => acc + r.rating, 0) / ratingsRes.data.length 
      : 0;

    const totalIncome = invoicesRes.data?.reduce((acc, inv) => acc + Number(inv.amount_paid), 0) || 0;
    const totalExpenses = expensesRes.data?.reduce((acc, exp) => acc + Number(exp.amount), 0) || 0;

    setStats({
      activeClients: clientsRes.count || 0,
      activeProjects: projectsRes.count || 0,
      avgRating: Math.round(avgRating * 10) / 10,
      totalIncome,
      totalExpenses,
    });
  };

  const fetchProjects = async () => {
    const { data } = await supabase
      .from("projects")
      .select(`
        *,
        profiles!projects_client_id_fkey (full_name)
      `)
      .eq("admin_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(5);
    
    setProjects(data || []);
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
            {trend}
          </p>
        )}
      </CardContent>
    </Card>
  );


  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Floating Glass Navigation */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-5xl">
        <div className="backdrop-blur-xl bg-glass-bg border border-glass-border rounded-2xl shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] px-6 py-3">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <h1 className="text-xl font-bold text-primary hidden md:block">Client Care CRM</h1>
            
            {/* Desktop Navigation */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="hidden md:block">
              <TabsList className="bg-transparent border-0">
                <TabsTrigger 
                  value="overview" 
                  className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger 
                  value="invoices"
                  className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Invoices
                </TabsTrigger>
                <TabsTrigger 
                  value="requests"
                  className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Requests
                </TabsTrigger>
                <TabsTrigger 
                  value="projects"
                  className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  <FolderKanban className="h-4 w-4 mr-2" />
                  Projects
                </TabsTrigger>
                <TabsTrigger 
                  value="services"
                  className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  <Briefcase className="h-4 w-4 mr-2" />
                  Services
                </TabsTrigger>
                <TabsTrigger 
                  value="clients"
                  className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  <Users className="h-4 w-4 mr-2" />
                  Clients
                </TabsTrigger>
                <TabsTrigger 
                  value="expenses"
                  className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  <Receipt className="h-4 w-4 mr-2" />
                  Expenses
                </TabsTrigger>
                <TabsTrigger 
                  value="team"
                  className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  <Users2 className="h-4 w-4 mr-2" />
                  Team
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Profile & Mobile Menu */}
            <div className="flex items-center gap-2">
              {/* Mobile Menu */}
              <Sheet>
                <SheetTrigger asChild className="md:hidden">
                  <Button variant="ghost" size="icon">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left">
                  <div className="space-y-4 mt-8">
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start"
                      onClick={() => { setActiveTab("overview"); }}
                    >
                      Overview
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start"
                      onClick={() => { setActiveTab("invoices"); }}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Invoices
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start"
                      onClick={() => { setActiveTab("requests"); }}
                    >
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Requests
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start"
                      onClick={() => { setActiveTab("projects"); }}
                    >
                      <FolderKanban className="mr-2 h-4 w-4" />
                      Projects
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start"
                      onClick={() => { setActiveTab("services"); }}
                    >
                      <Briefcase className="mr-2 h-4 w-4" />
                      Services
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start"
                      onClick={() => { setActiveTab("clients"); }}
                    >
                      <Users className="mr-2 h-4 w-4" />
                      Clients
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start"
                      onClick={() => { setActiveTab("expenses"); }}
                    >
                      <Receipt className="mr-2 h-4 w-4" />
                      Expenses
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start"
                      onClick={() => { setActiveTab("team"); }}
                    >
                      <Users2 className="mr-2 h-4 w-4" />
                      Team
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>

              {/* Profile Dropdown */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-medium text-primary">
                        {profile?.full_name?.charAt(0) || "A"}
                      </span>
                    </div>
                    <div className="text-left hidden lg:block">
                      <p className="text-sm font-medium">{profile?.full_name || "Admin"}</p>
                      <p className="text-xs text-muted-foreground">{profile?.email}</p>
                    </div>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-80">
                  <div className="space-y-6 mt-8">
                    <div className="flex items-center gap-4">
                      <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-2xl font-medium text-primary">
                          {profile?.full_name?.charAt(0) || "A"}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold">{profile?.full_name || "Admin"}</p>
                        <p className="text-sm text-muted-foreground">{profile?.email}</p>
                        <p className="text-xs text-muted-foreground">{profile?.phone_number}</p>
                      </div>
                    </div>
                    <div className="border-t pt-4 space-y-2">
                      <Button variant="ghost" className="w-full justify-start" onClick={onLogout}>
                        <LogOut className="mr-2 h-4 w-4" />
                        Logout
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 pt-32 pb-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8 animate-fade-in">
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
            value={`₹${stats.totalIncome.toLocaleString()}`}
            icon={DollarSign}
            trend="+12% from last month"
          />
          <StatCard
            title="Total Expenses"
            value={`₹${stats.totalExpenses.toLocaleString()}`}
            icon={TrendingDown}
          />
        </div>

        {/* Tabs Section */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Active Projects</CardTitle>
                  <FolderKanban className="h-5 w-5 text-primary" />
                </CardHeader>
                <CardContent>
                  {projects.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No active projects yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {projects.map((project) => (
                        <div key={project.id} className="border-b pb-3 last:border-0">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-semibold text-sm">{project.name}</h4>
                              <p className="text-xs text-muted-foreground">
                                Client: {project.profiles?.full_name}
                              </p>
                            </div>
                            <Badge variant="outline" className="bg-green-100 text-green-800">
                              Active
                            </Badge>
                          </div>
                          {project.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {project.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="invoices">
            <InvoiceManager adminId={user.id} adminProfile={profile} />
          </TabsContent>

          <TabsContent value="requests">
            <ServiceRequestsManager adminId={user.id} />
          </TabsContent>

          <TabsContent value="projects">
            <ProjectsManager adminId={user.id} />
          </TabsContent>

          <TabsContent value="services">
            <ServicesManager adminId={user.id} />
          </TabsContent>

          <TabsContent value="clients">
            <ClientsManager adminId={user.id} />
          </TabsContent>

          <TabsContent value="expenses">
            <ExpenseManager adminId={user.id} />
          </TabsContent>

          <TabsContent value="team">
            <TeamManager adminId={user.id} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboard;
