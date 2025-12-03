import { useState, useEffect } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FolderKanban, FileText, MessageSquare, Star, LogOut, Menu, User as UserIcon, Mail, Phone, Calendar, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface ClientDashboardProps {
  user: User;
  onLogout: () => void;
}

const ClientDashboard = ({ user, onLogout }: ClientDashboardProps) => {
  const [profile, setProfile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("projects");
  const [projects, setProjects] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [serviceRequests, setServiceRequests] = useState<any[]>([]);
  const [ratings, setRatings] = useState<any[]>([]);
  const [adminInfo, setAdminInfo] = useState<any>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNewRequestOpen, setIsNewRequestOpen] = useState(false);
  const [isNewRatingOpen, setIsNewRatingOpen] = useState(false);
  const [newRequest, setNewRequest] = useState({ title: "", description: "", priority: 3 });
  const [newRating, setNewRating] = useState({ rating: 5, feedback: "", project_id: "" });
  const { toast } = useToast();
  const [stats, setStats] = useState({
    activeProjects: 0,
    totalInvoices: 0,
    pendingRequests: 0,
  });

  useEffect(() => {
    fetchProfile();
    fetchStats();
    fetchData();
  }, [user.id]);

  const fetchData = async () => {
    fetchProjects();
    fetchInvoices();
    fetchServiceRequests();
    fetchAdminInfo();
    fetchRatings();
  };

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

  const fetchProjects = async () => {
    const { data } = await supabase.from("projects").select("*").eq("client_id", user.id).order("created_at", { ascending: false });
    setProjects(data || []);
  };

  const fetchInvoices = async () => {
    const { data } = await supabase.from("invoices").select("*, invoice_items(*)").eq("client_id", user.id).order("created_at", { ascending: false });
    setInvoices(data || []);
  };

  const fetchServiceRequests = async () => {
    const { data } = await supabase.from("service_requests").select("*").eq("client_id", user.id).order("created_at", { ascending: false });
    setServiceRequests(data || []);
  };

  const fetchAdminInfo = async () => {
    const { data: clientData } = await supabase.from("clients").select("admin_id").eq("client_id", user.id).maybeSingle();
    if (clientData) {
      const { data: adminProfile } = await supabase.from("profiles").select("*").eq("id", clientData.admin_id).maybeSingle();
      setAdminInfo(adminProfile);
    }
  };

  const fetchRatings = async () => {
    const { data } = await supabase.from("satisfaction_ratings").select("*, projects(name)").eq("client_id", user.id).order("created_at", { ascending: false });
    setRatings(data || []);
  };

  const handleCreateRating = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminInfo) {
      toast({ title: "Error", description: "Admin information not found", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("satisfaction_ratings").insert({
      client_id: user.id,
      admin_id: adminInfo.id,
      rating: newRating.rating,
      feedback: newRating.feedback || null,
      project_id: newRating.project_id || null,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Success", description: "Feedback submitted successfully" });
    setIsNewRatingOpen(false);
    setNewRating({ rating: 5, feedback: "", project_id: "" });
    fetchRatings();
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminInfo) {
      toast({ title: "Error", description: "Admin information not found", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("service_requests").insert({
      client_id: user.id,
      admin_id: adminInfo.id,
      title: newRequest.title,
      description: newRequest.description,
      priority: newRequest.priority,
      status: "pending",
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Success", description: "Service request created successfully" });
    setIsNewRequestOpen(false);
    setNewRequest({ title: "", description: "", priority: 3 });
    fetchServiceRequests();
    fetchStats();
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "active": return <Clock className="h-4 w-4 text-blue-500" />;
      case "pending": return <Clock className="h-4 w-4 text-yellow-500" />;
      case "in_progress": return <Clock className="h-4 w-4 text-blue-500" />;
      default: return <XCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Floating Glass Navigation Bar */}
      <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 glass-nav px-6 py-3 rounded-full border border-glass-border shadow-2xl max-w-4xl w-[95%] animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            {/* Mobile Menu */}
            <Sheet>
              <SheetTrigger asChild className="lg:hidden">
                <Button variant="ghost" size="icon" className="rounded-full">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="glass-nav">
                <div className="space-y-4 mt-8">
                  <Button variant="ghost" className="w-full justify-start" onClick={() => setActiveTab("projects")}>
                    <FolderKanban className="mr-2 h-4 w-4" />
                    Projects
                  </Button>
                  <Button variant="ghost" className="w-full justify-start" onClick={() => setActiveTab("invoices")}>
                    <FileText className="mr-2 h-4 w-4" />
                    Invoices
                  </Button>
                  <Button variant="ghost" className="w-full justify-start" onClick={() => setActiveTab("requests")}>
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Requests
                  </Button>
                  <Button variant="ghost" className="w-full justify-start" onClick={() => setActiveTab("feedback")}>
                    <Star className="mr-2 h-4 w-4" />
                    Feedback
                  </Button>
                </div>
              </SheetContent>
            </Sheet>

            {/* Logo */}
            <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Client Portal
            </h1>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-2">
              <Button 
                variant={activeTab === "projects" ? "default" : "ghost"} 
                size="sm" 
                className="rounded-full"
                onClick={() => setActiveTab("projects")}
              >
                <FolderKanban className="h-4 w-4 mr-2" />
                Projects
              </Button>
              <Button 
                variant={activeTab === "invoices" ? "default" : "ghost"} 
                size="sm" 
                className="rounded-full"
                onClick={() => setActiveTab("invoices")}
              >
                <FileText className="h-4 w-4 mr-2" />
                Invoices
              </Button>
              <Button 
                variant={activeTab === "requests" ? "default" : "ghost"} 
                size="sm" 
                className="rounded-full"
                onClick={() => setActiveTab("requests")}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Requests
              </Button>
              <Button 
                variant={activeTab === "feedback" ? "default" : "ghost"} 
                size="sm" 
                className="rounded-full"
                onClick={() => setActiveTab("feedback")}
              >
                <Star className="h-4 w-4 mr-2" />
                Feedback
              </Button>
            </div>
          </div>

          {/* Profile Menu */}
          <Sheet open={isProfileOpen} onOpenChange={setIsProfileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <UserIcon className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent className="glass-nav">
              <SheetHeader>
                <SheetTitle>Profile</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 mt-8">
                <div className="flex flex-col items-center gap-4">
                  <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                    <UserIcon className="h-10 w-10 text-primary" />
                  </div>
                  <div className="text-center">
                    <h3 className="font-semibold text-lg">{profile?.full_name}</h3>
                    <p className="text-sm text-muted-foreground">{profile?.email}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Email</p>
                      <p className="text-sm text-muted-foreground">{profile?.email || "Not set"}</p>
                    </div>
                  </div>
                  {profile?.phone_number && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Phone className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Phone</p>
                        <p className="text-sm text-muted-foreground">{profile.phone_number}</p>
                      </div>
                    </div>
                  )}
                  {adminInfo && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <UserIcon className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Your Admin</p>
                        <p className="text-sm text-muted-foreground">{adminInfo.full_name}</p>
                        <p className="text-xs text-muted-foreground">{adminInfo.email}</p>
                      </div>
                    </div>
                  )}
                </div>

                <Button variant="outline" className="w-full" onClick={onLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-4 pt-24 pb-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard title="Active Projects" value={stats.activeProjects} icon={FolderKanban} />
          <StatCard title="Invoices" value={stats.totalInvoices} icon={FileText} />
          <StatCard title="Pending Requests" value={stats.pendingRequests} icon={MessageSquare} />
        </div>

        {/* Content based on active tab */}
        {activeTab === "projects" && (
          <Card>
            <CardHeader>
              <CardTitle>My Projects</CardTitle>
            </CardHeader>
            <CardContent>
              {projects.length === 0 ? (
                <p className="text-muted-foreground">No projects yet.</p>
              ) : (
                <div className="space-y-4">
                  {projects.map((project) => (
                    <div key={project.id} className="flex items-start justify-between p-4 border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {getStatusIcon(project.status)}
                          <h3 className="font-semibold">{project.name}</h3>
                          <Badge variant={project.status === "active" ? "default" : "secondary"}>
                            {project.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{project.description}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {project.start_date && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Started: {new Date(project.start_date).toLocaleDateString()}
                            </div>
                          )}
                          {project.end_date && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              End: {new Date(project.end_date).toLocaleDateString()}
                            </div>
                          )}
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
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <p className="text-muted-foreground">No invoices yet.</p>
              ) : (
                <div className="space-y-4">
                  {invoices.map((invoice) => (
                    <div key={invoice.id} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="font-semibold">Invoice #{invoice.invoice_number}</h3>
                          <p className="text-sm text-muted-foreground">
                            {new Date(invoice.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold">₹{invoice.total_amount}</p>
                          <Badge variant={invoice.amount_paid >= invoice.total_amount ? "default" : "secondary"}>
                            {invoice.amount_paid >= invoice.total_amount ? "Paid" : "Pending"}
                          </Badge>
                        </div>
                      </div>
                      {invoice.invoice_items && invoice.invoice_items.length > 0 && (
                        <div className="space-y-2 mt-4 border-t pt-3">
                          {invoice.invoice_items.map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <span>{item.service_name} (x{item.quantity})</span>
                              <span>₹{item.total_price}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {invoice.upi_qr_url && (
                        <div className="mt-4 pt-4 border-t">
                          <p className="text-sm font-medium mb-2">Payment QR Code:</p>
                          <img src={invoice.upi_qr_url} alt="UPI QR" className="h-32 w-32 object-contain" />
                        </div>
                      )}
                      {invoice.upi_id && (
                        <div className="mt-2">
                          <p className="text-sm"><span className="font-medium">UPI ID:</span> {invoice.upi_id}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "requests" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Service Requests</CardTitle>
              <Dialog open={isNewRequestOpen} onOpenChange={setIsNewRequestOpen}>
                <DialogTrigger asChild>
                  <Button>New Request</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Service Request</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateRequest} className="space-y-4">
                    <div>
                      <Label htmlFor="title">Title*</Label>
                      <Input
                        id="title"
                        value={newRequest.title}
                        onChange={(e) => setNewRequest({ ...newRequest, title: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={newRequest.description}
                        onChange={(e) => setNewRequest({ ...newRequest, description: e.target.value })}
                        rows={4}
                      />
                    </div>
                    <div>
                      <Label htmlFor="priority">Priority (1-5)</Label>
                      <Input
                        id="priority"
                        type="number"
                        min="1"
                        max="5"
                        value={newRequest.priority}
                        onChange={(e) => setNewRequest({ ...newRequest, priority: parseInt(e.target.value) })}
                      />
                    </div>
                    <Button type="submit" className="w-full">Submit Request</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {serviceRequests.length === 0 ? (
                <p className="text-muted-foreground">No service requests yet. Create your first one!</p>
              ) : (
                <div className="space-y-4">
                  {serviceRequests.map((request) => (
                    <div key={request.id} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(request.status)}
                          <h3 className="font-semibold">{request.title}</h3>
                        </div>
                        <Badge variant={
                          request.status === "completed" ? "default" :
                          request.status === "in_progress" ? "secondary" :
                          "outline"
                        }>
                          {request.status}
                        </Badge>
                      </div>
                      {request.description && (
                        <p className="text-sm text-muted-foreground mb-2">{request.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Priority: {request.priority}/5</span>
                        <span>Created: {new Date(request.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "feedback" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Satisfaction Feedback</CardTitle>
              <Dialog open={isNewRatingOpen} onOpenChange={setIsNewRatingOpen}>
                <DialogTrigger asChild>
                  <Button>Add Feedback</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Rate Your Experience</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateRating} className="space-y-4">
                    <div>
                      <Label htmlFor="rating">Rating (1-5 stars)*</Label>
                      <div className="flex gap-2 mt-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setNewRating({ ...newRating, rating: star })}
                            className="p-1"
                          >
                            <Star
                              className={`h-8 w-8 ${star <= newRating.rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="project">Project (optional)</Label>
                      <select
                        id="project"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={newRating.project_id}
                        onChange={(e) => setNewRating({ ...newRating, project_id: e.target.value })}
                      >
                        <option value="">General feedback</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>{project.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="feedback">Feedback</Label>
                      <Textarea
                        id="feedback"
                        value={newRating.feedback}
                        onChange={(e) => setNewRating({ ...newRating, feedback: e.target.value })}
                        placeholder="Share your experience..."
                        rows={4}
                      />
                    </div>
                    <Button type="submit" className="w-full">Submit Feedback</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {ratings.length === 0 ? (
                <p className="text-muted-foreground">No feedback submitted yet. Share your experience!</p>
              ) : (
                <div className="space-y-4">
                  {ratings.map((rating) => (
                    <div key={rating.id} className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`h-5 w-5 ${star <= rating.rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
                          />
                        ))}
                        <span className="ml-2 font-semibold">{rating.rating}/5</span>
                      </div>
                      {rating.projects?.name && (
                        <p className="text-sm text-muted-foreground mb-2">
                          Project: {rating.projects.name}
                        </p>
                      )}
                      {rating.feedback && (
                        <p className="text-sm">{rating.feedback}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(rating.created_at).toLocaleDateString()}
                      </p>
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
