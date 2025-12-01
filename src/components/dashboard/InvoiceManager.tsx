import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, FileText, Upload } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Service {
  id: string;
  name: string;
  default_price: number | null;
}

interface ClientProfile {
  id: string;
  full_name: string;
  email: string | null;
  phone_number: string | null;
}

interface InvoiceItem {
  service_name: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface InvoiceManagerProps {
  adminId: string;
  adminProfile: any;
}

export const InvoiceManager = ({ adminId, adminProfile }: InvoiceManagerProps) => {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    client_id: "",
    discount: "0",
    notes: "",
    upi_id: "",
    upi_method: "id" as "id" | "qr",
  });
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [currentItem, setCurrentItem] = useState({
    service_name: "",
    description: "",
    quantity: "1",
    unit_price: "0",
  });
  const [qrFile, setQrFile] = useState<File | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchClients();
    fetchServices();
    fetchInvoices();
  }, [adminId]);

  const fetchClients = async () => {
    const { data } = await supabase
      .from("clients")
      .select(`
        client_id,
        profiles!clients_client_id_fkey (
          id,
          full_name,
          email,
          phone_number
        )
      `)
      .eq("admin_id", adminId);

    const clientProfiles = data
      ?.filter(item => item.profiles)
      .map(item => item.profiles as unknown as ClientProfile) || [];
    
    setClients(clientProfiles);
  };

  const fetchServices = async () => {
    const { data } = await supabase
      .from("services")
      .select("*")
      .eq("admin_id", adminId)
      .eq("is_active", true);
    setServices(data || []);
  };

  const fetchInvoices = async () => {
    const { data } = await supabase
      .from("invoices")
      .select(`
        *,
        profiles!invoices_client_id_fkey (full_name, email)
      `)
      .eq("admin_id", adminId)
      .order("created_at", { ascending: false });
    setInvoices(data || []);
  };

  const addItem = () => {
    const quantity = parseFloat(currentItem.quantity);
    const unitPrice = parseFloat(currentItem.unit_price);
    const totalPrice = quantity * unitPrice;

    setItems([
      ...items,
      {
        service_name: currentItem.service_name,
        description: currentItem.description,
        quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
      },
    ]);
    setCurrentItem({ service_name: "", description: "", quantity: "1", unit_price: "0" });
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleServiceSelect = (serviceId: string) => {
    const service = services.find(s => s.id === serviceId);
    if (service) {
      setCurrentItem({
        ...currentItem,
        service_name: service.name,
        unit_price: service.default_price?.toString() || "0",
      });
    }
  };

  const calculateTotal = () => {
    const subtotal = items.reduce((sum, item) => sum + item.total_price, 0);
    const discount = parseFloat(formData.discount) || 0;
    return subtotal - discount;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (items.length === 0) {
      toast({ title: "Error", description: "Add at least one item", variant: "destructive" });
      return;
    }

    let upiQrUrl = null;

    // Upload QR code if selected
    if (formData.upi_method === "qr" && qrFile) {
      const fileExt = qrFile.name.split(".").pop();
      const fileName = `${adminId}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError, data: uploadData } = await supabase.storage
        .from("upi-qr-codes")
        .upload(fileName, qrFile);

      if (uploadError) {
        toast({ title: "Error", description: uploadError.message, variant: "destructive" });
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("upi-qr-codes")
        .getPublicUrl(fileName);
      
      upiQrUrl = publicUrl;
    }

    // Generate invoice number
    const invoiceNumber = `INV-${Date.now()}`;
    const totalAmount = calculateTotal();

    // Create invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        admin_id: adminId,
        client_id: formData.client_id,
        invoice_number: invoiceNumber,
        total_amount: totalAmount,
        discount: parseFloat(formData.discount) || 0,
        amount_paid: 0,
        notes: formData.notes || null,
        upi_id: formData.upi_method === "id" ? formData.upi_id : null,
        upi_qr_url: upiQrUrl,
      })
      .select()
      .single();

    if (invoiceError) {
      toast({ title: "Error", description: invoiceError.message, variant: "destructive" });
      return;
    }

    // Create invoice items
    const itemsWithInvoiceId = items.map(item => ({
      ...item,
      invoice_id: invoice.id,
    }));

    const { error: itemsError } = await supabase
      .from("invoice_items")
      .insert(itemsWithInvoiceId);

    if (itemsError) {
      toast({ title: "Error", description: itemsError.message, variant: "destructive" });
      return;
    }

    toast({ title: "Success", description: "Invoice created successfully" });
    setIsDialogOpen(false);
    resetForm();
    fetchInvoices();
  };

  const resetForm = () => {
    setFormData({ client_id: "", discount: "0", notes: "", upi_id: "", upi_method: "id" });
    setItems([]);
    setCurrentItem({ service_name: "", description: "", quantity: "1", unit_price: "0" });
    setQrFile(null);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Invoicing</CardTitle>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Invoice
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Invoice</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>From (Admin)</Label>
                  <div className="mt-1 text-sm">
                    <p className="font-semibold">{adminProfile?.full_name}</p>
                    <p className="text-muted-foreground">{adminProfile?.email}</p>
                    <p className="text-muted-foreground">{adminProfile?.phone_number}</p>
                  </div>
                </div>
                <div>
                  <Label htmlFor="client">To (Client)*</Label>
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
              </div>

              <div className="space-y-4">
                <Label>Invoice Items</Label>
                <div className="border rounded-lg p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Select Service</Label>
                      <Select onValueChange={handleServiceSelect}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a service" />
                        </SelectTrigger>
                        <SelectContent>
                          {services.map((service) => (
                            <SelectItem key={service.id} value={service.id}>
                              {service.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="custom_service">Or Custom Service</Label>
                      <Input
                        id="custom_service"
                        value={currentItem.service_name}
                        onChange={(e) => setCurrentItem({ ...currentItem, service_name: e.target.value })}
                        placeholder="Enter custom service"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      value={currentItem.description}
                      onChange={(e) => setCurrentItem({ ...currentItem, description: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="quantity">Quantity</Label>
                      <Input
                        id="quantity"
                        type="number"
                        step="0.01"
                        value={currentItem.quantity}
                        onChange={(e) => setCurrentItem({ ...currentItem, quantity: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="unit_price">Unit Price</Label>
                      <Input
                        id="unit_price"
                        type="number"
                        step="0.01"
                        value={currentItem.unit_price}
                        onChange={(e) => setCurrentItem({ ...currentItem, unit_price: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Total</Label>
                      <Input
                        value={(parseFloat(currentItem.quantity) * parseFloat(currentItem.unit_price)).toFixed(2)}
                        readOnly
                      />
                    </div>
                  </div>

                  <Button type="button" onClick={addItem} disabled={!currentItem.service_name}>
                    Add Item
                  </Button>
                </div>

                {items.length > 0 && (
                  <div className="border rounded-lg p-4">
                    <h4 className="font-semibold mb-2">Added Items</h4>
                    <div className="space-y-2">
                      {items.map((item, index) => (
                        <div key={index} className="flex justify-between items-center text-sm">
                          <span>{item.service_name} (x{item.quantity})</span>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">${item.total_price.toFixed(2)}</span>
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(index)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="discount">Discount ($)</Label>
                <Input
                  id="discount"
                  type="number"
                  step="0.01"
                  value={formData.discount}
                  onChange={(e) => setFormData({ ...formData, discount: e.target.value })}
                />
              </div>

              <div className="text-right text-lg font-bold">
                Total: ${calculateTotal().toFixed(2)}
              </div>

              <div>
                <Label>Payment Method</Label>
                <Tabs value={formData.upi_method} onValueChange={(value) => setFormData({ ...formData, upi_method: value as "id" | "qr" })}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="id">UPI ID</TabsTrigger>
                    <TabsTrigger value="qr">Upload QR Code</TabsTrigger>
                  </TabsList>
                  <TabsContent value="id" className="mt-4">
                    <Label htmlFor="upi_id">UPI ID</Label>
                    <Input
                      id="upi_id"
                      value={formData.upi_id}
                      onChange={(e) => setFormData({ ...formData, upi_id: e.target.value })}
                      placeholder="yourname@upi"
                    />
                  </TabsContent>
                  <TabsContent value="qr" className="mt-4">
                    <Label htmlFor="qr_upload">Upload UPI QR Code</Label>
                    <div className="mt-2">
                      <Input
                        id="qr_upload"
                        type="file"
                        accept="image/*"
                        onChange={(e) => setQrFile(e.target.files?.[0] || null)}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                />
              </div>

              <Button type="submit" className="w-full">
                Create Invoice
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {invoices.length === 0 ? (
          <p className="text-muted-foreground">No invoices yet. Create your first invoice to get started.</p>
        ) : (
          <div className="space-y-4">
            {invoices.map((invoice) => (
              <div key={invoice.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="font-semibold">{invoice.invoice_number}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Client: {invoice.profiles?.full_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(invoice.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">${invoice.total_amount}</p>
                    <p className="text-sm text-muted-foreground">
                      Paid: ${invoice.amount_paid}
                    </p>
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
