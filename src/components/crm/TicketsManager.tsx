import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, MessageSquare } from "lucide-react";
import type { CompanyRole } from "@/hooks/useCompany";

interface Ticket {
  id: string;
  ticket_number: string;
  subject: string;
  description: string | null;
  status: "open" | "pending" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  message: string;
  sender_id: string | null;
  sender_name: string | null;
  sender_email: string | null;
  created_at: string;
  is_internal_note: boolean;
}

interface Props {
  companyId: string;
  role: CompanyRole;
  userId: string;
}

const statusColors: Record<string, string> = {
  open: "bg-green-500/15 text-green-700 dark:text-green-400",
  pending: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  closed: "bg-muted text-muted-foreground",
};

const TicketsManager = ({ companyId, role, userId }: Props) => {
  const { toast } = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "pending" | "closed">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Create form
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [creating, setCreating] = useState(false);

  const loadTickets = async () => {
    setLoading(true);
    let q = supabase
      .from("tickets")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (filter !== "all") q = q.eq("status", filter);
    const { data, error } = await q;
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setTickets((data ?? []) as Ticket[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, filter]);

  const openTicket = async (t: Ticket) => {
    setActiveTicket(t);
    const { data } = await supabase
      .from("ticket_messages")
      .select("*")
      .eq("ticket_id", t.id)
      .order("created_at", { ascending: true });
    setMessages((data ?? []) as Message[]);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("tickets")
      .insert({
        company_id: companyId,
        created_by: userId,
        subject: subject.trim(),
        description: description.trim() || null,
        priority,
        ticket_number: "", // trigger will fill it
      })
      .select()
      .single();
    setCreating(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Ticket created", description: data.ticket_number });
    setSubject("");
    setDescription("");
    setPriority("normal");
    setCreateOpen(false);
    loadTickets();
  };

  const sendReply = async () => {
    if (!activeTicket || !newMessage.trim()) return;
    setSending(true);
    const { error } = await supabase.from("ticket_messages").insert({
      ticket_id: activeTicket.id,
      sender_id: userId,
      message: newMessage.trim(),
    });
    setSending(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setNewMessage("");
    openTicket(activeTicket);
  };

  const updateStatus = async (status: Ticket["status"]) => {
    if (!activeTicket) return;
    const { error } = await supabase
      .from("tickets")
      .update({ status })
      .eq("id", activeTicket.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setActiveTicket({ ...activeTicket, status });
    loadTickets();
  };

  const canManage = role === "admin" || role === "agent";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <div>
          <CardTitle>Tickets</CardTitle>
          <CardDescription>
            {canManage ? "All tickets in your company" : "Your support tickets"}
          </CardDescription>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> New ticket
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create ticket</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-3">
                <div>
                  <Label>Subject</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={200} />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    maxLength={5000}
                  />
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={creating}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : tickets.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No tickets yet.</p>
        ) : (
          <div className="space-y-2">
            {tickets.map((t) => (
              <button
                key={t.id}
                onClick={() => openTicket(t)}
                className="w-full text-left p-3 border rounded-lg hover:bg-accent/50 transition flex items-start justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-muted-foreground">{t.ticket_number}</span>
                    <Badge variant="outline" className="text-xs">{t.priority}</Badge>
                  </div>
                  <p className="font-medium truncate mt-1">{t.subject}</p>
                </div>
                <Badge className={statusColors[t.status]}>{t.status}</Badge>
              </button>
            ))}
          </div>
        )}
      </CardContent>

      {/* Ticket detail */}
      <Dialog open={!!activeTicket} onOpenChange={(o) => !o && setActiveTicket(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {activeTicket && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm text-muted-foreground">{activeTicket.ticket_number}</span>
                  {activeTicket.subject}
                </DialogTitle>
              </DialogHeader>
              <div className="flex gap-2 items-center flex-wrap">
                <Badge className={statusColors[activeTicket.status]}>{activeTicket.status}</Badge>
                <Badge variant="outline">{activeTicket.priority}</Badge>
                {canManage && (
                  <Select value={activeTicket.status} onValueChange={(v: any) => updateStatus(v)}>
                    <SelectTrigger className="w-[140px] h-8 text-xs ml-auto">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              {activeTicket.description && (
                <p className="text-sm whitespace-pre-wrap p-3 bg-muted rounded">
                  {activeTicket.description}
                </p>
              )}
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <MessageSquare className="h-4 w-4" /> Conversation ({messages.length})
                </div>
                {messages.length === 0 && (
                  <p className="text-sm text-muted-foreground">No messages yet.</p>
                )}
                {messages.map((m) => (
                  <div key={m.id} className="text-sm p-3 border rounded">
                    <div className="text-xs text-muted-foreground mb-1">
                      {m.sender_name ?? m.sender_email ?? "User"} ·{" "}
                      {new Date(m.created_at).toLocaleString()}
                    </div>
                    <p className="whitespace-pre-wrap">{m.message}</p>
                  </div>
                ))}
              </div>
              {activeTicket.status !== "closed" && (
                <div className="space-y-2 border-t pt-3">
                  <Textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Write a reply..."
                    rows={3}
                    maxLength={5000}
                  />
                  <Button onClick={sendReply} disabled={sending || !newMessage.trim()} className="w-full">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reply"}
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default TicketsManager;
