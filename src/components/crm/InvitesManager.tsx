import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Copy, Trash2 } from "lucide-react";
import { z } from "zod";

const schema = z.object({
  email: z.string().email().max(255),
  role: z.enum(["admin", "agent", "client"]),
});

interface Invite {
  id: string;
  email: string;
  role: "admin" | "agent" | "client";
  status: string;
  token: string;
  expires_at: string;
  created_at: string;
}

interface Member {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: "admin" | "agent" | "client";
}

const InvitesManager = ({ companyId }: { companyId: string }) => {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "agent" | "client">("client");
  const [sending, setSending] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  const load = async () => {
    const [{ data: invs }, { data: mems }] = await Promise.all([
      supabase
        .from("invites")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
      supabase
        .from("company_members")
        .select("id, user_id, full_name, email, role")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true }),
    ]);
    setInvites((invs ?? []) as Invite[]);
    setMembers((mems ?? []) as Member[]);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, role });
    if (!parsed.success) {
      toast({
        title: "Validation",
        description: parsed.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    const { data, error } = await supabase.functions.invoke("send-invite", {
      body: {
        email,
        role,
        company_id: companyId,
        app_url: window.location.origin,
      },
    });
    setSending(false);

    if (error) {
      toast({
        title: "Failed",
        description: error.message ?? "Could not send invite",
        variant: "destructive",
      });
      return;
    }

    if (data?.email_sent === false) {
      // Email failed but invite created — copy link
      navigator.clipboard?.writeText(data.join_url);
      toast({
        title: "Invite created (email failed)",
        description: "Join link copied to clipboard. Share it manually.",
      });
    } else {
      toast({ title: "Invite sent", description: `Sent to ${email}` });
    }
    setEmail("");
    setRole("client");
    load();
  };

  const cancelInvite = async (id: string) => {
    const { error } = await supabase
      .from("invites")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else load();
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/join?token=${token}`;
    navigator.clipboard?.writeText(url);
    toast({ title: "Copied", description: "Join link copied to clipboard" });
  };

  const removeMember = async (memberId: string, userId: string) => {
    // Don't allow removing self
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id === userId) {
      toast({ title: "Can't remove yourself", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("company_members").delete().eq("id", memberId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else load();
  };

  const updateMemberRole = async (memberId: string, newRole: "admin" | "agent" | "client") => {
    const { error } = await supabase
      .from("company_members")
      .update({ role: newRole })
      .eq("id", memberId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else load();
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" /> Invite a teammate
          </CardTitle>
          <CardDescription>Send an invite link via email</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="space-y-3">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={role} onValueChange={(v: any) => setRole(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send invite"}
            </Button>
          </form>

          <div className="mt-6 space-y-2">
            <p className="text-sm font-medium">Pending invites</p>
            {invites.filter((i) => i.status === "pending").length === 0 ? (
              <p className="text-xs text-muted-foreground">No pending invites.</p>
            ) : (
              invites
                .filter((i) => i.status === "pending")
                .map((i) => (
                  <div key={i.id} className="flex items-center gap-2 text-sm border rounded p-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{i.email}</p>
                      <p className="text-xs text-muted-foreground">{i.role}</p>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => copyLink(i.token)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => cancelInvite(i.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team members ({members.length})</CardTitle>
          <CardDescription>People in your company</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-sm border rounded p-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.full_name ?? "—"}</p>
                <p className="text-xs text-muted-foreground truncate">{m.email}</p>
              </div>
              <Select value={m.role} onValueChange={(v: any) => updateMemberRole(m.id, v)}>
                <SelectTrigger className="w-[100px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                </SelectContent>
              </Select>
              <Button size="icon" variant="ghost" onClick={() => removeMember(m.id, m.user_id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default InvitesManager;
