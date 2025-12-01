import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, User, Mail, Phone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
  const [formData, setFormData] = useState({
    email: "",
    full_name: "",
    phone_number: "",
    password: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchClients();
  }, [adminId]);

  const fetchClients = async () => {
    const { data, error } = await supabase
      .from("clients")
      .select(`
        client_id,
        profiles!clients_client_id_fkey (
          id,
          full_name,
          email,
          phone_number,
          avatar_url
        )
      `)
      .eq("admin_id", adminId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    const clientProfiles = data
      .filter(item => item.profiles)
      .map(item => item.profiles as unknown as ClientProfile);
    
    setClients(clientProfiles);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Create client user account
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        data: {
          full_name: formData.full_name,
          role: "client",
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

    // Update phone number in profile
    if (formData.phone_number) {
      await supabase
        .from("profiles")
        .update({ phone_number: formData.phone_number })
        .eq("id", authData.user.id);
    }

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
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
