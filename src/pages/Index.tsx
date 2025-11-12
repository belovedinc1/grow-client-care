import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Building2, Users, FileText, Star, ArrowRight } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/dashboard");
      }
    };
    checkAuth();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-accent/10 to-background">
      {/* Header */}
      <header className="container mx-auto px-4 py-6 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Building2 className="h-8 w-8 text-primary" />
          <span className="text-2xl font-bold">Client Care CRM</span>
        </div>
        <Button onClick={() => navigate("/auth")} variant="outline">
          Login
        </Button>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Manage Your Clients
          <br />
          With Confidence
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          A comprehensive CRM solution for service providers to manage clients,
          projects, invoices, and satisfaction ratings—all in one place.
        </p>
        <Button size="lg" onClick={() => navigate("/auth")} className="text-lg px-8">
          Get Started
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <FeatureCard
            icon={Users}
            title="Client Management"
            description="Track and manage all your client relationships in one place"
          />
          <FeatureCard
            icon={FileText}
            title="Smart Invoicing"
            description="Create professional invoices with custom services and UPI payments"
          />
          <FeatureCard
            icon={Building2}
            title="Project Tracking"
            description="Monitor active projects and their status in real-time"
          />
          <FeatureCard
            icon={Star}
            title="Satisfaction Ratings"
            description="Collect and analyze client feedback to improve your services"
          />
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="bg-gradient-to-r from-primary to-accent rounded-3xl p-12 text-primary-foreground">
          <h2 className="text-4xl font-bold mb-4">
            Ready to Transform Your Client Management?
          </h2>
          <p className="text-xl mb-8 opacity-90">
            Join service providers who trust Client Care CRM
          </p>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => navigate("/auth")}
            className="text-lg px-8"
          >
            Start Free Trial
          </Button>
        </div>
      </section>
    </div>
  );
};

const FeatureCard = ({ icon: Icon, title, description }: any) => (
  <div className="bg-card p-6 rounded-2xl border hover:shadow-lg transition-all hover:scale-105">
    <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
      <Icon className="h-6 w-6 text-primary" />
    </div>
    <h3 className="text-xl font-semibold mb-2">{title}</h3>
    <p className="text-muted-foreground">{description}</p>
  </div>
);

export default Index;
