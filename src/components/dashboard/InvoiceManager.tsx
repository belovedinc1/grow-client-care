import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, FileText, Upload, Download, Eye, MessageCircle, Check, X } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import jsPDF from "jspdf";

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
  id?: string;
  service_name: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  client_id: string;
  total_amount: number;
  amount_paid: number;
  discount: number;
  notes: string | null;
  upi_id: string | null;
  upi_qr_url: string | null;
  created_at: string;
  profiles?: { full_name: string; email: string | null; phone_number: string | null };
}

interface InvoiceManagerProps {
  adminId: string;
  adminProfile: any;
}

export const InvoiceManager = ({ adminId, adminProfile }: InvoiceManagerProps) => {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
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
        profiles!invoices_client_id_fkey (full_name, email, phone_number)
      `)
      .eq("admin_id", adminId)
      .order("created_at", { ascending: false });
    setInvoices(data || []);
  };

  const fetchInvoiceItems = async (invoiceId: string) => {
    const { data } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoiceId);
    setInvoiceItems(data || []);
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

    if (formData.upi_method === "qr" && qrFile) {
      const fileExt = qrFile.name.split(".").pop();
      const fileName = `${adminId}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
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

    const invoiceNumber = `INV-${Date.now()}`;
    const totalAmount = calculateTotal();

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

  const handleMarkAsPaid = async (invoice: Invoice) => {
    const newAmountPaid = invoice.amount_paid === invoice.total_amount ? 0 : invoice.total_amount;
    
    const { error } = await supabase
      .from("invoices")
      .update({ amount_paid: newAmountPaid })
      .eq("id", invoice.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ 
      title: "Success", 
      description: newAmountPaid > 0 ? "Invoice marked as paid" : "Invoice marked as unpaid" 
    });
    fetchInvoices();
  };

  const handleViewInvoice = async (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    await fetchInvoiceItems(invoice.id);
    setIsViewDialogOpen(true);
  };

  const generatePDF = (invoice: Invoice, items: InvoiceItem[]) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text("INVOICE", pageWidth / 2, 30, { align: "center" });
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(invoice.invoice_number, pageWidth / 2, 38, { align: "center" });
    
    // From section
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("From:", 20, 55);
    doc.setFont("helvetica", "normal");
    doc.text(adminProfile?.full_name || "Admin", 20, 62);
    doc.text(adminProfile?.email || "", 20, 68);
    doc.text(adminProfile?.phone_number || "", 20, 74);
    
    // To section
    doc.setFont("helvetica", "bold");
    doc.text("To:", 120, 55);
    doc.setFont("helvetica", "normal");
    doc.text(invoice.profiles?.full_name || "", 120, 62);
    doc.text(invoice.profiles?.email || "", 120, 68);
    doc.text(invoice.profiles?.phone_number || "", 120, 74);
    
    // Date
    doc.text(`Date: ${new Date(invoice.created_at).toLocaleDateString()}`, 20, 90);
    
    // Items table header
    let yPos = 105;
    doc.setFont("helvetica", "bold");
    doc.setFillColor(240, 240, 240);
    doc.rect(20, yPos - 5, pageWidth - 40, 8, "F");
    doc.text("Service", 22, yPos);
    doc.text("Qty", 100, yPos);
    doc.text("Price", 120, yPos);
    doc.text("Total", 160, yPos);
    
    // Items
    doc.setFont("helvetica", "normal");
    yPos += 10;
    items.forEach((item) => {
      doc.text(item.service_name.substring(0, 40), 22, yPos);
      doc.text(item.quantity.toString(), 100, yPos);
      doc.text(`$${item.unit_price.toFixed(2)}`, 120, yPos);
      doc.text(`$${item.total_price.toFixed(2)}`, 160, yPos);
      yPos += 8;
    });
    
    // Totals
    yPos += 10;
    doc.line(20, yPos - 5, pageWidth - 20, yPos - 5);
    
    if (invoice.discount > 0) {
      doc.text(`Discount: -$${invoice.discount.toFixed(2)}`, 120, yPos);
      yPos += 8;
    }
    
    doc.setFont("helvetica", "bold");
    doc.text(`Total: $${invoice.total_amount.toFixed(2)}`, 120, yPos);
    yPos += 8;
    doc.text(`Paid: $${invoice.amount_paid.toFixed(2)}`, 120, yPos);
    yPos += 8;
    doc.text(`Balance: $${(invoice.total_amount - invoice.amount_paid).toFixed(2)}`, 120, yPos);
    
    // Payment info
    yPos += 20;
    if (invoice.upi_id) {
      doc.setFont("helvetica", "bold");
      doc.text("Payment Details:", 20, yPos);
      doc.setFont("helvetica", "normal");
      doc.text(`UPI ID: ${invoice.upi_id}`, 20, yPos + 8);
    }
    
    // Notes
    if (invoice.notes) {
      yPos += 25;
      doc.setFont("helvetica", "bold");
      doc.text("Notes:", 20, yPos);
      doc.setFont("helvetica", "normal");
      const splitNotes = doc.splitTextToSize(invoice.notes, pageWidth - 40);
      doc.text(splitNotes, 20, yPos + 8);
    }
    
    return doc;
  };

  const handleDownloadInvoice = async (invoice: Invoice) => {
    const { data: items } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice.id);
    
    const doc = generatePDF(invoice, items || []);
    doc.save(`${invoice.invoice_number}.pdf`);
    toast({ title: "Success", description: "Invoice downloaded" });
  };

  const handleShareWhatsApp = (invoice: Invoice) => {
    const client = clients.find(c => c.id === invoice.client_id);
    const phoneNumber = client?.phone_number?.replace(/\D/g, "") || invoice.profiles?.phone_number?.replace(/\D/g, "");
    
    if (!phoneNumber) {
      toast({ title: "Error", description: "Client phone number not found", variant: "destructive" });
      return;
    }

    const message = encodeURIComponent(
      `Hello ${invoice.profiles?.full_name},\n\n` +
      `Invoice: ${invoice.invoice_number}\n` +
      `Amount: $${invoice.total_amount.toFixed(2)}\n` +
      `Status: ${invoice.amount_paid >= invoice.total_amount ? "Paid" : "Pending"}\n\n` +
      `${invoice.upi_id ? `Pay via UPI: ${invoice.upi_id}` : ""}\n\n` +
      `Thank you for your business!`
    );

    window.open(`https://wa.me/${phoneNumber}?text=${message}`, "_blank");
  };

  const resetForm = () => {
    setFormData({ client_id: "", discount: "0", notes: "", upi_id: "", upi_method: "id" });
    setItems([]);
    setCurrentItem({ service_name: "", description: "", quantity: "1", unit_price: "0" });
    setQrFile(null);
  };

  const isPaid = (invoice: Invoice) => invoice.amount_paid >= invoice.total_amount;

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
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="font-semibold">{invoice.invoice_number}</span>
                      <Badge variant="outline" className={isPaid(invoice) ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                        {isPaid(invoice) ? "Paid" : "Pending"}
                      </Badge>
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
                <div className="flex gap-2 mt-4 flex-wrap">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleViewInvoice(invoice)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleDownloadInvoice(invoice)}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleShareWhatsApp(invoice)}
                  >
                    <MessageCircle className="h-4 w-4 mr-1" />
                    WhatsApp
                  </Button>
                  <Button 
                    variant={isPaid(invoice) ? "destructive" : "default"}
                    size="sm" 
                    onClick={() => handleMarkAsPaid(invoice)}
                  >
                    {isPaid(invoice) ? (
                      <>
                        <X className="h-4 w-4 mr-1" />
                        Mark Unpaid
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-1" />
                        Mark Paid
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* View Invoice Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Invoice Details</DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-6">
              <div className="text-center border-b pb-4">
                <h2 className="text-2xl font-bold">INVOICE</h2>
                <p className="text-muted-foreground">{selectedInvoice.invoice_number}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">From</h4>
                  <p className="font-medium">{adminProfile?.full_name}</p>
                  <p className="text-sm text-muted-foreground">{adminProfile?.email}</p>
                  <p className="text-sm text-muted-foreground">{adminProfile?.phone_number}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">To</h4>
                  <p className="font-medium">{selectedInvoice.profiles?.full_name}</p>
                  <p className="text-sm text-muted-foreground">{selectedInvoice.profiles?.email}</p>
                  <p className="text-sm text-muted-foreground">{selectedInvoice.profiles?.phone_number}</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Items</h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-2 text-left">Service</th>
                        <th className="px-4 py-2 text-right">Qty</th>
                        <th className="px-4 py-2 text-right">Price</th>
                        <th className="px-4 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceItems.map((item, index) => (
                        <tr key={index} className="border-t">
                          <td className="px-4 py-2">{item.service_name}</td>
                          <td className="px-4 py-2 text-right">{item.quantity}</td>
                          <td className="px-4 py-2 text-right">${item.unit_price.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right">${item.total_price.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border-t pt-4 space-y-2 text-right">
                {selectedInvoice.discount > 0 && (
                  <p>Discount: -${selectedInvoice.discount.toFixed(2)}</p>
                )}
                <p className="text-lg font-bold">Total: ${selectedInvoice.total_amount.toFixed(2)}</p>
                <p>Paid: ${selectedInvoice.amount_paid.toFixed(2)}</p>
                <p className="font-semibold">
                  Balance: ${(selectedInvoice.total_amount - selectedInvoice.amount_paid).toFixed(2)}
                </p>
              </div>

              {selectedInvoice.upi_id && (
                <div className="border-t pt-4">
                  <h4 className="font-semibold mb-2">Payment Details</h4>
                  <p className="text-sm">UPI ID: {selectedInvoice.upi_id}</p>
                </div>
              )}

              {selectedInvoice.upi_qr_url && (
                <div className="border-t pt-4">
                  <h4 className="font-semibold mb-2">QR Code</h4>
                  <img src={selectedInvoice.upi_qr_url} alt="UPI QR Code" className="max-w-[200px]" />
                </div>
              )}

              {selectedInvoice.notes && (
                <div className="border-t pt-4">
                  <h4 className="font-semibold mb-2">Notes</h4>
                  <p className="text-sm text-muted-foreground">{selectedInvoice.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};
