import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { MessageSquare, Sparkles, Send, Loader2, Mail, Star } from "lucide-react";

type TicketStatus = "open" | "pending" | "closed";
type TicketPriority = "low" | "normal" | "high" | "urgent";

interface Ticket {
  id: string;
  ticket_number: string;
  subject: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  created_at: string;
  created_by: string | null;
  assigned_to: string | null;
  guest_email: string | null;
  guest_name: string | null;
  source: string;
  company_id: string;
}

interface Member {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string;
}

interface Rating {
  id: string;
  ticket_id: string;
  rating: "poor" | "bad" | "okay" | "good";
  feedback: string | null;
  ai_analysis: any;
  ai_analyzed_at: string | null;
}

interface Message {
  id: string;
  ticket_id: string;
  sender_id: string | null;
  sender_email: string | null;
  sender_name: string | null;
  message: string;
  is_internal_note: boolean;
  created_at: string;
}

interface TicketsManagerProps {
  companyId: string;
  currentUserId: string;
  isStaff: boolean; // admin or agent
}

const RATING_LABELS: Record<string, string> = {
  poor: "Poor",
  bad: "Bad",
  okay: "Okay",
  good: "Good",
};

const RATING_COLORS: Record<string, string> = {
  poor: "bg-destructive/10 text-destructive",
  bad: "bg-orange-500/10 text-orange-600",
  okay: "bg-yellow-500/10 text-yellow-700",
  good: "bg-green-500/10 text-green-700",
};

export const TicketsManager = ({ companyId, currentUserId, isStaff }: TicketsManagerProps) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "pending" | "closed" | "assigned" | "unassigned" | "mine">("all");
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [newTicket, setNewTicket] = useState({ subject: "", description: "", priority: "normal" as TicketPriority });
  const [isRateOpen, setIsRateOpen] = useState(false);
  const [rateForm, setRateForm] = useState<{ rating: "poor" | "bad" | "okay" | "good"; feedback: string }>({ rating: "good", feedback: "" });
  const { toast } = useToast();

  useEffect(() => {
    fetchTickets();
    if (isStaff) fetchMembers();

    const channel = supabase
      .channel(`tickets-${companyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets", filter: `company_id=eq.${companyId}` },
        () => fetchTickets()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ticket_messages" },
        () => {
          if (selectedTicket) fetchMessages(selectedTicket.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, isStaff]);

  useEffect(() => {
    if (selectedTicket) fetchMessages(selectedTicket.id);
  }, [selectedTicket]);

  const fetchTickets = async () => {
    let query = supabase
      .from("tickets")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (!isStaff) {
      query = query.eq("created_by", currentUserId);
    }

    const { data, error } = await query;
    if (error) {
      toast({ title: "Error loading tickets", description: error.message, variant: "destructive" });
      return;
    }
    setTickets((data || []) as Ticket[]);

    // fetch ratings for these tickets
    const ids = (data || []).map((t) => t.id);
    if (ids.length) {
      const { data: ratingData } = await supabase
        .from("ticket_ratings")
        .select("*")
        .in("ticket_id", ids);
      const map: Record<string, Rating> = {};
      (ratingData || []).forEach((r: any) => {
        map[r.ticket_id] = r as Rating;
      });
      setRatings(map);
    }
  };

  const fetchMembers = async () => {
    const { data } = await supabase
      .from("company_members")
      .select("user_id, full_name, email, role")
      .eq("company_id", companyId);
    setMembers((data || []) as Member[]);
  };

  const fetchMessages = async (ticketId: string) => {
    const { data } = await supabase
      .from("ticket_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    setMessages((data || []) as Message[]);
  };

  const createTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicket.subject.trim()) return;
    const { error } = await supabase.from("tickets").insert({
      company_id: companyId,
      created_by: currentUserId,
      subject: newTicket.subject,
      description: newTicket.description,
      priority: newTicket.priority,
      status: "open",
      source: "app",
    });
    if (error) {
      toast({ title: "Failed to create ticket", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Ticket created", description: "We'll get back to you shortly." });
    setIsNewOpen(false);
    setNewTicket({ subject: "", description: "", priority: "normal" });
    fetchTickets();
  };

  const updateStatus = async (ticketId: string, status: TicketStatus) => {
    const { error } = await supabase.from("tickets").update({ status }).eq("id", ticketId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    fetchTickets();
    if (selectedTicket?.id === ticketId) {
      setSelectedTicket({ ...selectedTicket, status });
    }
  };

  const updateAssignee = async (ticketId: string, assigneeId: string | null) => {
    const { error } = await supabase
      .from("tickets")
      .update({ assigned_to: assigneeId })
      .eq("id", ticketId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    fetchTickets();
    if (selectedTicket?.id === ticketId) {
      setSelectedTicket({ ...selectedTicket, assigned_to: assigneeId });
    }
  };

  const sendReply = async (isInternal: boolean) => {
    if (!selectedTicket || !reply.trim()) return;
    setSending(true);
    try {
      // Insert message
      const { error: msgErr } = await supabase.from("ticket_messages").insert({
        ticket_id: selectedTicket.id,
        sender_id: currentUserId,
        message: reply,
        is_internal_note: isInternal,
      });
      if (msgErr) throw msgErr;

      // If staff and not internal, send email via edge function
      if (isStaff && !isInternal) {
        const { error: fnErr } = await supabase.functions.invoke("send-ticket-reply", {
          body: { ticket_id: selectedTicket.id, message: reply },
        });
        if (fnErr) {
          toast({
            title: "Reply saved, email failed",
            description: fnErr.message,
            variant: "destructive",
          });
        } else {
          toast({ title: "Reply sent", description: "Email delivered to the requester." });
        }
      } else {
        toast({ title: isInternal ? "Internal note added" : "Reply sent" });
      }
      setReply("");
      fetchMessages(selectedTicket.id);
    } catch (e: any) {
      toast({ title: "Error sending", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const submitRating = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;
    const { error } = await supabase.from("ticket_ratings").insert({
      ticket_id: selectedTicket.id,
      company_id: selectedTicket.company_id,
      rated_by: currentUserId,
      rating: rateForm.rating,
      feedback: rateForm.feedback || null,
    });
    if (error) {
      toast({ title: "Failed to submit", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Thanks for your feedback!" });
    setIsRateOpen(false);
    fetchTickets();
  };

  const analyzeFeedback = async (ticketId: string) => {
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-ticket-feedback", {
        body: { ticket_id: ticketId },
      });
      if (error) throw error;
      toast({ title: "Analysis complete", description: data?.summary || "Updated successfully." });
      fetchTickets();
    } catch (e: any) {
      toast({ title: "Analysis failed", description: e.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const filteredTickets = tickets.filter((t) => {
    if (filter === "all") return true;
    if (filter === "open") return t.status === "open";
    if (filter === "pending") return t.status === "pending";
    if (filter === "closed") return t.status === "closed";
    if (filter === "assigned") return !!t.assigned_to;
    if (filter === "unassigned") return !t.assigned_to;
    if (filter === "mine") return t.assigned_to === currentUserId;
    return true;
  });

  const counts = {
    all: tickets.length,
    open: tickets.filter((t) => t.status === "open").length,
    pending: tickets.filter((t) => t.status === "pending").length,
    closed: tickets.filter((t) => t.status === "closed").length,
    assigned: tickets.filter((t) => !!t.assigned_to).length,
    unassigned: tickets.filter((t) => !t.assigned_to).length,
    mine: tickets.filter((t) => t.assigned_to === currentUserId).length,
  };

  const statusColor = (s: TicketStatus) => {
    switch (s) {
      case "open": return "bg-blue-500/10 text-blue-700 border-blue-200";
      case "pending": return "bg-yellow-500/10 text-yellow-700 border-yellow-200";
      case "closed": return "bg-green-500/10 text-green-700 border-green-200";
    }
  };

  const priorityColor = (p: TicketPriority) => {
    switch (p) {
      case "urgent": return "bg-red-500/10 text-red-700";
      case "high": return "bg-orange-500/10 text-orange-700";
      case "normal": return "bg-blue-500/10 text-blue-700";
      case "low": return "bg-muted text-muted-foreground";
    }
  };

  const memberName = (uid: string | null) => {
    if (!uid) return "Unassigned";
    const m = members.find((x) => x.user_id === uid);
    return m?.full_name || m?.email || "Member";
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Tickets
          </CardTitle>
          <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
            <DialogTrigger asChild>
              <Button>New Ticket</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Ticket</DialogTitle></DialogHeader>
              <form onSubmit={createTicket} className="space-y-4">
                <div>
                  <Label>Subject</Label>
                  <Input
                    value={newTicket.subject}
                    onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    rows={5}
                    value={newTicket.description}
                    onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select
                    value={newTicket.priority}
                    onValueChange={(v) => setNewTicket({ ...newTicket, priority: v as TicketPriority })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full">Create</Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
              <TabsTrigger value="open">Open ({counts.open})</TabsTrigger>
              <TabsTrigger value="pending">Pending ({counts.pending})</TabsTrigger>
              <TabsTrigger value="closed">Closed ({counts.closed})</TabsTrigger>
              {isStaff && <TabsTrigger value="unassigned">Unassigned ({counts.unassigned})</TabsTrigger>}
              {isStaff && <TabsTrigger value="assigned">Assigned ({counts.assigned})</TabsTrigger>}
              {isStaff && <TabsTrigger value="mine">Mine ({counts.mine})</TabsTrigger>}
            </TabsList>
            <TabsContent value={filter} className="mt-4">
              {filteredTickets.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">No tickets found.</p>
              ) : (
                <div className="space-y-3">
                  {filteredTickets.map((t) => {
                    const rating = ratings[t.id];
                    return (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTicket(t)}
                        className="w-full text-left border rounded-lg p-4 hover:border-primary transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-muted-foreground">{t.ticket_number}</span>
                            <h3 className="font-semibold">{t.subject}</h3>
                            {t.source === "email" && <Mail className="h-3 w-3 text-muted-foreground" />}
                          </div>
                          <div className="flex items-center gap-1 flex-wrap">
                            <Badge variant="outline" className={statusColor(t.status)}>{t.status}</Badge>
                            <Badge variant="outline" className={priorityColor(t.priority)}>{t.priority}</Badge>
                            {rating && (
                              <Badge variant="outline" className={RATING_COLORS[rating.rating]}>
                                <Star className="h-3 w-3 mr-1" />{RATING_LABELS[rating.rating]}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {t.description && <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{t.description}</p>}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>From: {t.guest_name || t.guest_email || "Client"}</span>
                          {isStaff && <span>Assigned: {memberName(t.assigned_to)}</span>}
                          <span>{new Date(t.created_at).toLocaleString()}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Ticket detail dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={(o) => !o && setSelectedTicket(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedTicket && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm text-muted-foreground">{selectedTicket.ticket_number}</span>
                  <span>{selectedTicket.subject}</span>
                </DialogTitle>
              </DialogHeader>

              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={statusColor(selectedTicket.status)}>{selectedTicket.status}</Badge>
                <Badge variant="outline" className={priorityColor(selectedTicket.priority)}>{selectedTicket.priority}</Badge>
                {selectedTicket.source === "email" && (
                  <Badge variant="outline"><Mail className="h-3 w-3 mr-1" />Email</Badge>
                )}
              </div>

              {isStaff && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Status</Label>
                    <Select value={selectedTicket.status} onValueChange={(v) => updateStatus(selectedTicket.id, v as TicketStatus)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Assign to</Label>
                    <Select
                      value={selectedTicket.assigned_to || "unassigned"}
                      onValueChange={(v) => updateAssignee(selectedTicket.id, v === "unassigned" ? null : v)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {members.filter((m) => m.role === "admin" || m.role === "agent").map((m) => (
                          <SelectItem key={m.user_id} value={m.user_id}>
                            {m.full_name || m.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="text-xs text-muted-foreground">
                From: {selectedTicket.guest_name || selectedTicket.guest_email || "Client"} ·{" "}
                {new Date(selectedTicket.created_at).toLocaleString()}
              </div>

              {selectedTicket.description && (
                <div className="border rounded p-3 bg-muted/30 text-sm whitespace-pre-wrap">{selectedTicket.description}</div>
              )}

              {/* Messages thread */}
              <div className="space-y-3 max-h-80 overflow-y-auto border rounded p-3">
                {messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No replies yet.</p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-lg p-3 ${
                        m.is_internal_note
                          ? "bg-yellow-500/10 border border-yellow-300"
                          : m.sender_id === currentUserId
                          ? "bg-primary/10 ml-8"
                          : "bg-muted/50 mr-8"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold">
                          {m.sender_name || m.sender_email || (m.sender_id === currentUserId ? "You" : "User")}
                          {m.is_internal_note && <Badge className="ml-2" variant="outline">Internal</Badge>}
                        </span>
                        <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{m.message}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Reply box */}
              <div className="space-y-2">
                <Label>{isStaff ? "Reply (sends email to requester)" : "Reply"}</Label>
                <Textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Type your reply..." />
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={() => sendReply(false)} disabled={sending || !reply.trim()}>
                    {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    Send Reply
                  </Button>
                  {isStaff && (
                    <Button variant="outline" onClick={() => sendReply(true)} disabled={sending || !reply.trim()}>
                      Add Internal Note
                    </Button>
                  )}
                </div>
              </div>

              {/* Rating section */}
              {ratings[selectedTicket.id] ? (
                <div className="border rounded p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={RATING_COLORS[ratings[selectedTicket.id].rating]}>
                        <Star className="h-3 w-3 mr-1" />
                        {RATING_LABELS[ratings[selectedTicket.id].rating]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">Client feedback</span>
                    </div>
                    {isStaff && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={analyzing}
                        onClick={() => analyzeFeedback(selectedTicket.id)}
                      >
                        {analyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                        {ratings[selectedTicket.id].ai_analysis ? "Re-analyze" : "Analyze with AI"}
                      </Button>
                    )}
                  </div>
                  {ratings[selectedTicket.id].feedback && (
                    <p className="text-sm">{ratings[selectedTicket.id].feedback}</p>
                  )}
                  {ratings[selectedTicket.id].ai_analysis && (
                    <div className="bg-primary/5 border rounded p-3 text-sm space-y-1">
                      <div className="flex items-center gap-1 font-semibold text-primary">
                        <Sparkles className="h-3 w-3" /> AI Analysis
                      </div>
                      {(() => {
                        const a = ratings[selectedTicket.id].ai_analysis as any;
                        return (
                          <div className="space-y-1">
                            {a.sentiment && <p><span className="font-medium">Sentiment:</span> {a.sentiment}</p>}
                            {a.quality && <p><span className="font-medium">Service quality:</span> {a.quality}</p>}
                            {a.urgency && <p><span className="font-medium">Urgency:</span> {a.urgency}</p>}
                            {a.themes && <p><span className="font-medium">Themes:</span> {Array.isArray(a.themes) ? a.themes.join(", ") : a.themes}</p>}
                            {a.summary && <p className="italic">{a.summary}</p>}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                !isStaff && selectedTicket.status === "closed" && (
                  <Dialog open={isRateOpen} onOpenChange={setIsRateOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full"><Star className="h-4 w-4 mr-2" />Rate this ticket</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>How was the support?</DialogTitle></DialogHeader>
                      <form onSubmit={submitRating} className="space-y-4">
                        <div className="grid grid-cols-4 gap-2">
                          {(["poor", "bad", "okay", "good"] as const).map((r) => (
                            <Button
                              type="button"
                              key={r}
                              variant={rateForm.rating === r ? "default" : "outline"}
                              onClick={() => setRateForm({ ...rateForm, rating: r })}
                            >
                              {RATING_LABELS[r]}
                            </Button>
                          ))}
                        </div>
                        <div>
                          <Label>Feedback (optional)</Label>
                          <Textarea
                            rows={4}
                            value={rateForm.feedback}
                            onChange={(e) => setRateForm({ ...rateForm, feedback: e.target.value })}
                          />
                        </div>
                        <Button type="submit" className="w-full">Submit</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                )
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TicketsManager;
