import { useState, useEffect } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderKanban, FileText, MessageSquare, LogOut, Menu, User as UserIcon, Mail, Phone, Calendar, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { TicketsManager } from "./TicketsManager";

interface ClientDashboardProps {
  user: User;
  onLogout: () => void;
  companyId: string;
}

const ClientDashboard = ({ user, onLogout, companyId }: ClientDashboardProps) => {
  const [profile, setProfile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("tickets");
  const [projects, setProjects] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const { toast } = useToast();
  const [stats, setStats] = useState({ activeProjects: 0, totalInvoices: 0, openTickets: 0 });

  useEffect(() => {
    fetchProfile();
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, companyId]);

  const fetchProfile = async () => {
    const { data } = await supabase.from("company_members").select("*").eq("user_id", user.id).eq("company_id", companyId).maybeSingle();
    setProfile(data);
  };

  const fetchData = async () => {
    const [pRes, iRes, tRes] = await Promise.all([
      supabase.from("projects").select("*", { count: "exact" }).eq("client_id", user.id),
      supabase.from("invoices").select("*", { count: "exact" }).eq("client_id", user.id),
      supabase.from("tickets").select("*", { count: "exact" }).eq("created_by", user.id).neq("status", "closed"),
    ]);
    setStats({
      activeProjects: pRes.count || 0,
      totalInvoices: iRes.count || 0,
      openTickets: tRes.count || 0,
    });

    const { data: pdata } = await supabase.from("projects").select("*").eq("client_id", user.id).order("created_at", { ascending: false });
    setProjects(pdata || []);
    const { data: idata } = await supabase.from("invoices").select("*, invoice_items(*)").eq("client_id", user.id).order("created_at", { ascending: false });
    setInvoices(idata || []);
  };

  const StatCard = ({ title, value, icon: Icon }: any) => (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-5 w-5 text-primary" />
      </CardHeader>
      <CardContent><div className="text-3xl font-bold">{value}</div></CardContent>
    </Card>
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "active": return <Clock className="h-4 w-4 text-blue-500" />;
      default: return <XCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 glass-nav px-6 py-3 rounded-full border border-glass-border shadow-2xl max-w-4xl w-[95%] animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Sheet>
              <SheetTrigger asChild className="lg:hidden">
                <Button variant="ghost" size="icon" className="rounded-full"><Menu className="h-5 w-5" /></Button>
              </SheetTrigger>
              <SheetContent side="left" className="glass-nav">
                <div className="space-y-4 mt-8">
                  <Button variant="ghost" className="w-full justify-start" onClick={() => setActiveTab("tickets")}><MessageSquare className="mr-2 h-4 w-4" />Tickets</Button>
                  <Button variant="ghost" className="w-full justify-start" onClick={() => setActiveTab("projects")}><FolderKanban className="mr-2 h-4 w-4" />Projects</Button>
                  <Button variant="ghost" className="w-full justify-start" onClick={() => setActiveTab("invoices")}><FileText className="mr-2 h-4 w-4" />Invoices</Button>
                </div>
              </SheetContent>
            </Sheet>
            <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Client Portal</h1>
            <div className="hidden lg:flex items-center gap-2">
              <Button variant={activeTab === "tickets" ? "default" : "ghost"} size="sm" className="rounded-full" onClick={() => setActiveTab("tickets")}><MessageSquare className="h-4 w-4 mr-2" />Tickets</Button>
              <Button variant={activeTab === "projects" ? "default" : "ghost"} size="sm" className="rounded-full" onClick={() => setActiveTab("projects")}><FolderKanban className="h-4 w-4 mr-2" />Projects</Button>
              <Button variant={activeTab === "invoices" ? "default" : "ghost"} size="sm" className="rounded-full" onClick={() => setActiveTab("invoices")}><FileText className="h-4 w-4 mr-2" />Invoices</Button>
            </div>
          </div>
          <Sheet open={isProfileOpen} onOpenChange={setIsProfileOpen}>
            <SheetTrigger asChild><Button variant="ghost" size="icon" className="rounded-full"><UserIcon className="h-5 w-5" /></Button></SheetTrigger>
            <SheetContent className="glass-nav">
              <SheetHeader><SheetTitle>Profile</SheetTitle></SheetHeader>
              <div className="space-y-6 mt-8">
                <div className="flex flex-col items-center gap-4">
                  <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center"><UserIcon className="h-10 w-10 text-primary" /></div>
                  <div className="text-center">
                    <h3 className="font-semibold text-lg">{profile?.full_name}</h3>
                    <p className="text-sm text-muted-foreground">{profile?.email}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    <div><p className="text-sm font-medium">Email</p><p className="text-sm text-muted-foreground">{profile?.email || "Not set"}</p></div>
                  </div>
                </div>
                <Button variant="outline" className="w-full" onClick={onLogout}><LogOut className="mr-2 h-4 w-4" />Logout</Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>

      <main className="container mx-auto px-4 pt-24 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard title="Open Tickets" value={stats.openTickets} icon={MessageSquare} />
          <StatCard title="Active Projects" value={stats.activeProjects} icon={FolderKanban} />
          <StatCard title="Invoices" value={stats.totalInvoices} icon={FileText} />
        </div>

        {activeTab === "tickets" && (
          <TicketsManager companyId={companyId} currentUserId={user.id} isStaff={false} />
        )}

        {activeTab === "projects" && (
          <Card>
            <CardHeader><CardTitle>My Projects</CardTitle></CardHeader>
            <CardContent>
              {projects.length === 0 ? <p className="text-muted-foreground">No projects yet.</p> : (
                <div className="space-y-4">
                  {projects.map((project) => (
                    <div key={project.id} className="flex items-start justify-between p-4 border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {getStatusIcon(project.status)}
                          <h3 className="font-semibold">{project.name}</h3>
                          <Badge variant={project.status === "active" ? "default" : "secondary"}>{project.status}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{project.description}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {project.start_date && <div className="flex items-center gap-1"><Calendar className="h-3 w-3" />Started: {new Date(project.start_date).toLocaleDateString()}</div>}
                          {project.end_date && <div className="flex items-center gap-1"><Calendar className="h-3 w-3" />End: {new Date(project.end_date).toLocaleDateString()}</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "invoices" && (
          <Card>
            <CardHeader><CardTitle>Invoices</CardTitle></CardHeader>
            <CardContent>
              {invoices.length === 0 ? <p className="text-muted-foreground">No invoices yet.</p> : (
                <div className="space-y-4">
                  {invoices.map((invoice) => (
                    <div key={invoice.id} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="font-semibold">Invoice #{invoice.invoice_number}</h3>
                          <p className="text-sm text-muted-foreground">{new Date(invoice.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold">₹{invoice.total_amount}</p>
                          <Badge variant={invoice.amount_paid >= invoice.total_amount ? "default" : "secondary"}>
                            {invoice.amount_paid >= invoice.total_amount ? "Paid" : "Pending"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default ClientDashboard;
