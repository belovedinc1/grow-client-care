import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Building2 } from "lucide-react";
import { z } from "zod";

const signupSchema = z.object({
  companyName: z.string().trim().min(2, "Company name min 2 chars").max(100),
  fullName: z.string().trim().min(2, "Name min 2 chars").max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(8, "Password min 8 chars").max(72),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
});

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"login" | "signup">("login");

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [signupForm, setSignupForm] = useState({
    companyName: "",
    fullName: "",
    email: "",
    password: "",
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/dashboard");
    });
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = loginSchema.safeParse(loginForm);
    if (!parsed.success) {
      toast({
        title: "Validation",
        description: parsed.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword(loginForm);
      if (error) {
        toast({
          title: "Login failed",
          description: error.message.includes("Invalid")
            ? "Invalid email or password"
            : error.message,
          variant: "destructive",
        });
        return;
      }
      if (data.session) navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = signupSchema.safeParse(signupForm);
    if (!parsed.success) {
      toast({
        title: "Validation",
        description: parsed.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // 1. Create auth user
      const signUp = await supabase.auth.signUp({
        email: signupForm.email,
        password: signupForm.password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: { full_name: signupForm.fullName },
        },
      });

      if (signUp.error) {
        toast({
          title: "Signup failed",
          description: signUp.error.message.includes("registered")
            ? "Email already registered. Please login."
            : signUp.error.message,
          variant: "destructive",
        });
        return;
      }

      // 2. Ensure session (sign in if email confirmation required)
      let session = signUp.data.session;
      if (!session) {
        const signIn = await supabase.auth.signInWithPassword({
          email: signupForm.email,
          password: signupForm.password,
        });
        session = signIn.data.session;
      }

      if (!session) {
        toast({
          title: "Confirm your email",
          description: "Check your inbox to verify, then login to create your company.",
        });
        setTab("login");
        return;
      }

      // 3. Create company + admin membership
      const { error: rpcErr } = await supabase.rpc("create_company_with_admin", {
        _company_name: signupForm.companyName,
        _admin_full_name: signupForm.fullName,
      });

      if (rpcErr) {
        toast({
          title: "Could not create company",
          description: rpcErr.message,
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Welcome!", description: `${signupForm.companyName} is ready.` });
      navigate("/dashboard");
    } catch (err: any) {
      toast({ title: "Error", description: err.message ?? "Unknown", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-accent/5 to-background p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary rounded-2xl">
              <Building2 className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold">Client Care CRM</CardTitle>
          <CardDescription>Multi-tenant support ticketing</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Create Company</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    value={loginForm.email}
                    onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Login"}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Joining via invite? Use the link in your email.
                </p>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="company">Company name</Label>
                  <Input
                    id="company"
                    value={signupForm.companyName}
                    onChange={(e) => setSignupForm({ ...signupForm, companyName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Your name (admin)</Label>
                  <Input
                    id="signup-name"
                    value={signupForm.fullName}
                    onChange={(e) => setSignupForm({ ...signupForm, fullName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    value={signupForm.email}
                    onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password (min 8)</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    value={signupForm.password}
                    onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
                    required
                    minLength={8}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  You'll be the admin. Invite your team after signup.
                </p>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create company"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
