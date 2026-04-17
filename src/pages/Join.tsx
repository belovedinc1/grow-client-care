import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Building2 } from "lucide-react";
import { z } from "zod";

const schema = z.object({
  fullName: z.string().trim().min(2).max(100),
  password: z.string().min(8).max(72),
});

interface InviteInfo {
  id: string;
  company_id: string;
  company_name: string;
  email: string;
  role: "admin" | "agent" | "client";
  status: string;
  expires_at: string;
}

const Join = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = params.get("token") ?? "";

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Missing invite token");
      setLoadingInvite(false);
      return;
    }
    (async () => {
      const { data, error } = await supabase.rpc("get_invite_by_token", { _token: token });
      if (error || !data || data.length === 0) {
        setError("Invalid or expired invite");
      } else {
        const inv = data[0] as InviteInfo;
        if (inv.status !== "pending") setError(`Invite is ${inv.status}`);
        else if (new Date(inv.expires_at) < new Date()) setError("Invite has expired");
        else setInvite(inv);
      }
      setLoadingInvite(false);
    })();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invite) return;
    const parsed = schema.safeParse({ fullName, password });
    if (!parsed.success) {
      toast({
        title: "Validation",
        description: parsed.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      // Try sign up first; if account exists, sign in.
      const signUpRes = await supabase.auth.signUp({
        email: invite.email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: { full_name: fullName },
        },
      });

      if (signUpRes.error && !signUpRes.error.message.toLowerCase().includes("registered")) {
        throw signUpRes.error;
      }

      // Sign in (handles both new and existing)
      if (!signUpRes.data.session) {
        const signInRes = await supabase.auth.signInWithPassword({
          email: invite.email,
          password,
        });
        if (signInRes.error) {
          throw new Error(
            "Account exists with a different password. Use your existing password.",
          );
        }
      }

      // Now accept invite
      const { error: acceptErr } = await supabase.rpc("accept_invite", {
        _token: token,
        _full_name: fullName,
      });
      if (acceptErr) throw acceptErr;

      toast({ title: "Welcome!", description: `Joined ${invite.company_name}` });
      navigate("/dashboard");
    } catch (err: any) {
      toast({
        title: "Could not join",
        description: err.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-accent/5 to-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invite problem</CardTitle>
            <CardDescription>{error ?? "Invalid invite"}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/auth")} className="w-full">
              Go to login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-accent/5 to-background p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary rounded-2xl">
              <Building2 className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">Join {invite.company_name}</CardTitle>
          <CardDescription>
            You're invited as <strong>{invite.role}</strong> ({invite.email})
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your full name</Label>
              <Input
                id="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password (min 8 chars)</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <p className="text-xs text-muted-foreground">
                If you already have an account on this email, enter your existing password.
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Joining...
                </>
              ) : (
                "Accept invite & join"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Join;
