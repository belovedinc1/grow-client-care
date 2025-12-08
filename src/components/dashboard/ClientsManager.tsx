import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, User, Mail, Phone, Pencil, Trash2 } from "lucide-react";
import { z } from "zod";

// SECURITY FIX: Add input validation schema
const clientSchema = z.object({
  email: z.string().email("Invalid email address").max(255, "Email must be less than 255 characters"),
  full_name: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name must be less than 100 characters"),
  phone_number: z.string().regex(/^\+?[0-9]{10,15}$/, "Phone must be 10-15 digits").optional().or(z.literal('')),
  password: z.string().min(8, "Password must be at least 8 characters").max(72, "Password must be less than 72 characters"),
});

const editClientSchema = z.object({
  full_name: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name must be less than 100 characters"),
  phone_number: z.string().regex(/^\+?[0-9]{10,15}$/, "Phone must be 10-15 digits").optional().or(z.literal('')),
});
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  email: string | null;
  phone_number: string | null;
  avatar_url: string | null;
}

interface ClientsManagerProps {
  adminId: string;
}

export const ClientsManager = ({ adminId }: ClientsManagerProps) => {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientProfile | null>(null);
  const [formData, setFormData] = useState({
    email: "",
    full_name: "",
    phone_number: "",
    password: "",
  });
  const [editFormData, setEditFormData] = useState({
    full_name: "",
    phone_number: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchClients();
  }, [adminId]);

  const fetchClients = async () => {
    // First get client relationships
    const { data: clientData, error: clientError } = await supabase
      .from("clients")
      .select("client_id")
      .eq("admin_id", adminId);

    if (clientError) {
      toast({ title: "Error", description: clientError.message, variant: "destructive" });
      return;
    }

    if (!clientData || clientData.length === 0) {
      setClients([]);
      return;
    }

    // Then fetch profiles for those client IDs
    const clientIds = clientData.map(c => c.client_id);
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone_number, avatar_url")
      .in("id", clientIds);

    if (profileError) {
      toast({ title: "Error", description: profileError.message, variant: "destructive" });
      return;
    }

    // Map profiles, with fallback for missing ones
    const profileMap = new Map(profileData?.map(p => [p.id, p]) || []);
    const clientProfiles: ClientProfile[] = clientIds.map(clientId => {
      const profile = profileMap.get(clientId);
      if (profile) {
        return profile as ClientProfile;
      }
      return {
        id: clientId,
        full_name: "Client profile pending",
        email: null,
        phone_number: null,
        avatar_url: null,
      };
    });

    setClients(clientProfiles);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // SECURITY FIX: Validate input before submission
    try {
      clientSchema.parse(formData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation Error",
          description: error.errors[0].message,
          variant: "destructive",
        });
        return;
      }
    }

    // Create client user account
    // SECURITY FIX: Never pass role in metadata - trigger handles it securely
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        data: {
          full_name: formData.full_name,
          // NOTE: role is NOT passed - database trigger assigns 'client' by default
        },
      },
    });

    if (authError) {
      toast({ title: "Error", description: authError.message, variant: "destructive" });
      return;
    }

    if (!authData.user) {
      toast({ title: "Error", description: "Failed to create user", variant: "destructive" });
      return;
    }

    // Profile is auto-created by the handle_new_user trigger in Supabase
    // Small delay to ensure trigger completes before creating client relationship
    await new Promise(resolve => setTimeout(resolve, 500));

    // Create client relationship
    const { error: clientError } = await supabase
      .from("clients")
      .insert({
        admin_id: adminId,
        client_id: authData.user.id,
      });

    if (clientError) {
      toast({ title: "Error", description: clientError.message, variant: "destructive" });
      return;
    }

    toast({
      title: "Success",
      description: "Client created successfully. They can now log in with their credentials.",
    });
    setIsDialogOpen(false);
    setFormData({ email: "", full_name: "", phone_number: "", password: "" });
    fetchClients();
  };

  const handleEditClient = (client: ClientProfile) => {
    setSelectedClient(client);
    setEditFormData({
      full_name: client.full_name,
      phone_number: client.phone_number || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) return;

    // SECURITY FIX: Validate edit input
    try {
      editClientSchema.parse(editFormData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation Error",
          description: error.errors[0].message,
          variant: "destructive",
        });
        return;
      }
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: editFormData.full_name,
        phone_number: editFormData.phone_number || null,
      })
      .eq("id", selectedClient.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Success", description: "Client updated successfully" });
    setIsEditDialogOpen(false);
    setSelectedClient(null);
    fetchClients();
  };

  const handleDeleteClient = async () => {
    if (!selectedClient) return;

    // Delete the client relationship (profile remains for data integrity)
    const { error } = await supabase
      .from("clients")
      .delete()
      .eq("admin_id", adminId)
      .eq("client_id", selectedClient.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Success", description: "Client removed from your account" });
    setIsDeleteDialogOpen(false);
    setSelectedClient(null);
    fetchClients();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Client Management</CardTitle>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Client
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Client</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="full_name">Full Name*</Label>
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="email">Email*</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone_number}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="password">Password*</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" className="w-full">
                Create Client
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {clients.length === 0 ? (
          <p className="text-muted-foreground">No clients yet. Add your first client to get started.</p>
        ) : (
          <div className="space-y-4">
            {clients.map((client) => (
              <div key={client.id} className="flex items-center gap-4 border-b pb-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  {client.avatar_url ? (
                    <img src={client.avatar_url} alt={client.full_name} className="h-12 w-12 rounded-full" />
                  ) : (
                    <User className="h-6 w-6 text-primary" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">{client.full_name}</h3>
                  <div className="flex flex-col gap-1 mt-1">
                    {client.email && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        {client.email}
                      </div>
                    )}
                    {client.phone_number && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {client.phone_number}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => handleEditClient(client)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => { setSelectedClient(client); setIsDeleteDialogOpen(true); }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Edit Client Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateClient} className="space-y-4">
            <div>
              <Label htmlFor="edit_full_name">Full Name*</Label>
              <Input
                id="edit_full_name"
                value={editFormData.full_name}
                onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="edit_phone">Phone Number</Label>
              <Input
                id="edit_phone"
                type="tel"
                value={editFormData.phone_number}
                onChange={(e) => setEditFormData({ ...editFormData, phone_number: e.target.value })}
              />
            </div>
            <Button type="submit" className="w-full">Update Client</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Client?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {selectedClient?.full_name} from your client list. Their account will remain active but they won't be associated with you anymore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteClient} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
