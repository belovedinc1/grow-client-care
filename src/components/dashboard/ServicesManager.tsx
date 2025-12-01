import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Service {
  id: string;
  name: string;
  description: string | null;
  default_price: number | null;
  is_active: boolean;
}

interface ServicesManagerProps {
  adminId: string;
}

export const ServicesManager = ({ adminId }: ServicesManagerProps) => {
  const [services, setServices] = useState<Service[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    default_price: "",
    is_active: true,
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchServices();
  }, [adminId]);

  const fetchServices = async () => {
    const { data, error } = await supabase
      .from("services")
      .select("*")
      .eq("admin_id", adminId)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setServices(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const serviceData = {
      name: formData.name,
      description: formData.description || null,
      default_price: formData.default_price ? parseFloat(formData.default_price) : null,
      is_active: formData.is_active,
      admin_id: adminId,
    };

    if (editingService) {
      const { error } = await supabase
        .from("services")
        .update(serviceData)
        .eq("id", editingService.id);

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Success", description: "Service updated successfully" });
    } else {
      const { error } = await supabase.from("services").insert(serviceData);

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Success", description: "Service created successfully" });
    }

    setIsDialogOpen(false);
    resetForm();
    fetchServices();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this service?")) return;

    const { error } = await supabase.from("services").delete().eq("id", id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: "Service deleted successfully" });
    fetchServices();
  };

  const handleEdit = (service: Service) => {
    setEditingService(service);
    setFormData({
      name: service.name,
      description: service.description || "",
      default_price: service.default_price?.toString() || "",
      is_active: service.is_active,
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({ name: "", description: "", default_price: "", is_active: true });
    setEditingService(null);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Available Services</CardTitle>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Service
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingService ? "Edit Service" : "Add New Service"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Service Name*</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
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
                <Label htmlFor="price">Default Price</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={formData.default_price}
                  onChange={(e) => setFormData({ ...formData, default_price: e.target.value })}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="active">Active</Label>
              </div>
              <Button type="submit" className="w-full">
                {editingService ? "Update" : "Create"} Service
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {services.length === 0 ? (
          <p className="text-muted-foreground">No services yet. Add your first service to get started.</p>
        ) : (
          <div className="space-y-4">
            {services.map((service) => (
              <div key={service.id} className="flex items-center justify-between border-b pb-4">
                <div className="flex-1">
                  <h3 className="font-semibold">{service.name}</h3>
                  {service.description && (
                    <p className="text-sm text-muted-foreground">{service.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2">
                    {service.default_price && (
                      <span className="text-sm font-medium">${service.default_price}</span>
                    )}
                    <span className={`text-xs px-2 py-1 rounded ${service.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                      {service.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" onClick={() => handleEdit(service)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="destructive" size="icon" onClick={() => handleDelete(service.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
