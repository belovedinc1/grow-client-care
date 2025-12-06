import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, FolderKanban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ClientProfile {
  id: string;
  full_name: string;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "completed" | "on_hold" | "cancelled";
  start_date: string | null;
  end_date: string | null;
  client_id: string;
  profiles?: { full_name: string };
}

interface ProjectsManagerProps {
  adminId: string;
}

export const ProjectsManager = ({ adminId }: ProjectsManagerProps) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    client_id: "",
    status: "active" as "active" | "completed" | "on_hold" | "cancelled",
    start_date: "",
    end_date: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchProjects();
    fetchClients();
  }, [adminId]);

  const fetchProjects = async () => {
    const { data } = await supabase
      .from("projects")
      .select(`
        *,
        profiles!projects_client_id_fkey (full_name)
      `)
      .eq("admin_id", adminId)
      .order("created_at", { ascending: false });
    setProjects(data || []);
  };

  const fetchClients = async () => {
    const { data } = await supabase
      .from("clients")
      .select(`
        client_id,
        profiles!clients_client_id_fkey (id, full_name)
      `)
      .eq("admin_id", adminId);

    const clientProfiles = data
      ?.filter(item => item.profiles)
      .map(item => item.profiles as unknown as ClientProfile) || [];
    
    setClients(clientProfiles);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { error } = await supabase.from("projects").insert({
      admin_id: adminId,
      client_id: formData.client_id,
      name: formData.name,
      description: formData.description || null,
      status: formData.status,
      start_date: formData.start_date || null,
      end_date: formData.end_date || null,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Success", description: "Project created successfully" });
    setIsDialogOpen(false);
    resetForm();
    fetchProjects();
  };

  const handleEdit = (project: Project) => {
    setSelectedProject(project);
    setFormData({
      name: project.name,
      description: project.description || "",
      client_id: project.client_id,
      status: project.status,
      start_date: project.start_date || "",
      end_date: project.end_date || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) return;

    const { error } = await supabase
      .from("projects")
      .update({
        name: formData.name,
        description: formData.description || null,
        client_id: formData.client_id,
        status: formData.status,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
      })
      .eq("id", selectedProject.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Success", description: "Project updated successfully" });
    setIsEditDialogOpen(false);
    setSelectedProject(null);
    resetForm();
    fetchProjects();
  };

  const handleDelete = async () => {
    if (!selectedProject) return;

    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", selectedProject.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Success", description: "Project deleted successfully" });
    setIsDeleteDialogOpen(false);
    setSelectedProject(null);
    fetchProjects();
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      client_id: "",
      status: "active",
      start_date: "",
      end_date: "",
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      active: "bg-green-100 text-green-800",
      completed: "bg-blue-100 text-blue-800",
      on_hold: "bg-yellow-100 text-yellow-800",
      cancelled: "bg-red-100 text-red-800",
    };
    return variants[status] || "bg-gray-100 text-gray-800";
  };

  const ProjectForm = ({ onSubmit, submitLabel }: { onSubmit: (e: React.FormEvent) => void; submitLabel: string }) => (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Project Name*</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>
      <div>
        <Label htmlFor="client">Assign to Client*</Label>
        <Select value={formData.client_id} onValueChange={(value) => setFormData({ ...formData, client_id: value })}>
          <SelectTrigger>
            <SelectValue placeholder="Select client" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
        />
      </div>
      <div>
        <Label htmlFor="status">Status</Label>
        <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value as typeof formData.status })}>
          <SelectTrigger>
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="on_hold">On Hold</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="start_date">Start Date</Label>
          <Input
            id="start_date"
            type="date"
            value={formData.start_date}
            onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="end_date">End Date</Label>
          <Input
            id="end_date"
            type="date"
            value={formData.end_date}
            onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
          />
        </div>
      </div>
      <Button type="submit" className="w-full">{submitLabel}</Button>
    </form>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Projects</CardTitle>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
            </DialogHeader>
            <ProjectForm onSubmit={handleSubmit} submitLabel="Create Project" />
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {projects.length === 0 ? (
          <p className="text-muted-foreground">No projects yet. Create your first project to get started.</p>
        ) : (
          <div className="space-y-4">
            {projects.map((project) => (
              <div key={project.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <FolderKanban className="h-4 w-4 text-primary" />
                      <span className="font-semibold">{project.name}</span>
                      <Badge variant="outline" className={getStatusBadge(project.status)}>
                        {project.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Client: {project.profiles?.full_name}
                    </p>
                    {project.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {project.description}
                      </p>
                    )}
                    {(project.start_date || project.end_date) && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {project.start_date && `Start: ${new Date(project.start_date).toLocaleDateString()}`}
                        {project.start_date && project.end_date && " | "}
                        {project.end_date && `End: ${new Date(project.end_date).toLocaleDateString()}`}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(project)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => { setSelectedProject(project); setIsDeleteDialogOpen(true); }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => { setIsEditDialogOpen(open); if (!open) { resetForm(); setSelectedProject(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          <ProjectForm onSubmit={handleUpdate} submitLabel="Update Project" />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedProject?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
